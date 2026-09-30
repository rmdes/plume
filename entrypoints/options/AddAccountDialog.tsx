import { useEffect, useRef, useState } from "preact/hooks";
import { CALLBACK_URL } from "../../core/auth-callback";
import { CLIENT_ID, DEFAULT_SCOPE, getRedirectUri } from "../../core/auth-config";
import { pickAuthFlow } from "../../core/auth-flow";
import { chromeIdentityLauncher } from "../../core/auth-launcher";
import { browser } from "../../core/browser-api";
import { log } from "../../core/logger";
import { discoverEndpoints, endpointOrigins } from "../../core/discovery";
import { prepareAuth, startAuth } from "../../core/indieauth";
import { fetchAndCacheServerConfig } from "../../core/server-config";
import type { Endpoints } from "../../core/types";
import { accountStore, defaultsStore, pendingAuthStore } from "../../storage";
import { authResultKey, type AuthResult } from "../../storage/pending-auth";

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

/**
 * Origins still to be granted, held between the two permission prompts.
 * Sites that delegate IndieAuth put their token endpoint on a different origin
 * than the blog, and `permissions.request()` only works inside a user gesture —
 * which the discovery fetch destroys. So the extra origins need their own
 * click, which is what `pending` drives.
 */
interface PendingGrant {
  siteUrl: string;
  endpoints: Endpoints;
  origins: string[];
}

type StepState = "waiting" | "active" | "done" | "failed";

interface Step {
  id: string;
  label: string;
  state: StepState;
  detail?: string;
}

/**
 * The steps known before discovery runs. A second permission grant is only
 * required by servers that delegate IndieAuth elsewhere, so that step is
 * spliced in once discovery tells us it is needed.
 */
const initialSteps = (host: string): Step[] => [
  { id: "permission", label: `Requesting access to ${host}`, state: "waiting" },
  { id: "discovery", label: "Discovering endpoints", state: "waiting" },
  { id: "token", label: "Exchanging your login for a token", state: "waiting" },
  { id: "config", label: "Loading server configuration", state: "waiting" },
];

const ICON: Record<StepState, string> = {
  waiting: "·",
  active: "◐",
  done: "✓",
  failed: "✗",
};

const COLOR: Record<StepState, string> = {
  waiting: "#999",
  active: "#3b82f6",
  done: "#15803d",
  failed: "crimson",
};

/**
 * How long an unanswered `permissions.request()` gets before the step says
 * so. Desktop browsers show the site-access prompt as a modal at once, so
 * this only surfaces on a browser that never shows one: Vivaldi for Android
 * 8.2 accepts the call and then neither prompts nor settles the promise,
 * which left the dialog spinning on its first step forever. The request is
 * left pending rather than abandoned, in case the prompt is merely slow.
 */
const PROMPT_STALL_MS = 10_000;

const PROMPT_STALL_HINT =
  "Still waiting for the browser's site-access prompt. If none appeared, this browser " +
  "cannot grant extensions access to sites yet (Vivaldi for Android 8.2 stalls here), " +
  "and Plume cannot reach your site without it.";

type TabAuthOutcome = "connected" | "cancelled";

/**
 * Resolves "connected" when the background records success for this sign-in,
 * rejects when it records a failure, and resolves "cancelled" when the
 * dialog goes away first. Watches storage rather than holding a promise
 * across the tab switch, because on mobile this page may be discarded
 * meanwhile — in which case nobody is waiting and the account simply appears
 * in the list on return. The background records the outcome under the
 * sign-in's own state key (`authResult:<state>`), not by diffing the account
 * list, so re-adding an existing account resolves the same as a new one. The
 * signal covers the other exit: the user closing the dialog while the login
 * tab is still open, which must not leave a listener behind to fire on some
 * later, unrelated account.
 */
function waitForTabAuth(state: string, signal: AbortSignal): Promise<TabAuthOutcome> {
  return new Promise((resolve, reject) => {
    function done(): void {
      browser.storage.onChanged.removeListener(onChanged);
      signal.removeEventListener("abort", onAbort);
    }
    function onAbort(): void {
      done();
      resolve("cancelled");
    }
    function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string): void {
      if (area !== "session") return;
      const result = changes[authResultKey(state)]?.newValue as AuthResult | undefined;
      if (!result) return;
      done();
      if (result.ok) resolve("connected");
      else reject(new Error(result.error));
    }
    if (signal.aborted) {
      resolve("cancelled");
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    browser.storage.onChanged.addListener(onChanged);
  });
}

export function AddAccountDialog({ onClose, onAdded }: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingGrant | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [finished, setFinished] = useState(false);

  // Aborted on unmount so a sign-in abandoned mid-tab leaves no listener behind.
  const lifetime = useRef(new AbortController());
  useEffect(() => () => lifetime.current.abort(), []);

  function patchStep(id: string, patch: Partial<Step>) {
    setSteps((current) =>
      current ? current.map((step) => (step.id === id ? { ...step, ...patch } : step)) : current,
    );
  }

  /**
   * Run one step, reflecting its outcome in the list. A failure is always
   * shown; whether it stops the flow is the caller's decision, so that a
   * server with a broken `?q=config` still gets you signed in.
   */
  async function runStep<T>(id: string, work: () => Promise<T>): Promise<T> {
    patchStep(id, { state: "active", detail: undefined });
    try {
      const result = await work();
      patchStep(id, { state: "done", detail: undefined });
      return result;
    } catch (e) {
      log.error(`add account: ${id} failed`, e);
      patchStep(id, {
        state: "failed",
        detail: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  /** Both permission prompts go through here, so a stalled one is caught in either place. */
  async function requestOrigins(stepId: string, origins: string[], denied: string) {
    const stall = setTimeout(() => {
      patchStep(stepId, { detail: PROMPT_STALL_HINT });
      log.warn("site-access prompt unanswered", { origins, userAgent: navigator.userAgent });
    }, PROMPT_STALL_MS);
    try {
      if (!(await browser.permissions.request({ origins }))) throw new Error(denied);
    } finally {
      clearTimeout(stall);
    }
  }

  async function authorize(siteUrl: string, endpoints: Endpoints) {
    const identityAvailable = typeof browser.identity?.launchWebAuthFlow === "function";
    const flow = pickAuthFlow(await defaultsStore().get(), identityAvailable);
    if (flow === "tab") {
      await authorizeInTab(siteUrl, endpoints);
      return;
    }

    const token = await runStep("token", () =>
      startAuth({
        siteUrl,
        clientId: CLIENT_ID,
        redirectUri: getRedirectUri(),
        scope: DEFAULT_SCOPE,
        launcher: chromeIdentityLauncher,
        endpoints,
      }),
    );
    await accountStore().add(token);
    log.info("account connected", { domain: new URL(token.me).hostname });
    onAdded();

    // Non-fatal: the account is already usable, and the popup refetches config
    // on every open. Surfacing the failure beats blocking sign-in on it.
    let configOk = true;
    try {
      await runStep("config", () =>
        fetchAndCacheServerConfig(accountStore(), new URL(token.me).hostname),
      );
    } catch {
      configOk = false;
    }

    setFinished(true);
    if (configOk) {
      setTimeout(onClose, 700);
    }
  }

  /**
   * The login happens in an ordinary tab and is finished by the background
   * script (see core/tab-auth.ts), which also loads server config. This page
   * only prepares the request and watches for the outcome.
   */
  async function authorizeInTab(siteUrl: string, endpoints: Endpoints) {
    const host = new URL(siteUrl).hostname;
    const outcome = await runStep("token", async () => {
      const prepared = await prepareAuth({
        siteUrl,
        clientId: CLIENT_ID,
        redirectUri: CALLBACK_URL,
        scope: DEFAULT_SCOPE,
        endpoints,
      });
      await pendingAuthStore().put({
        state: prepared.state,
        verifier: prepared.verifier,
        siteUrl,
        endpoints,
        redirectUri: CALLBACK_URL,
        clientId: CLIENT_ID,
      });
      // Subscribe before the tab opens so a fast server cannot beat us to it.
      const waiting = waitForTabAuth(prepared.state, lifetime.current.signal);
      patchStep("token", { detail: `Finish signing in at ${host} in the tab that opened` });
      await browser.tabs.create({ url: prepared.authUrl });
      return waiting;
    });
    // The dialog was closed while the login tab was open. The background
    // still finishes the sign-in on its own; there is just nobody to tell.
    if (outcome === "cancelled") return;
    // Config is the background's job on this flow and non-fatal there, as
    // it is non-fatal here on the identity flow.
    patchStep("config", { state: "done" });
    onAdded();
    setFinished(true);
    setTimeout(onClose, 700);
  }

  async function handleAdd(event: Event) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    let siteOrigin: string;
    try {
      siteOrigin = `${new URL(url).origin}/*`;
    } catch {
      setError("Enter a valid site URL.");
      setBusy(false);
      return;
    }
    setSteps(initialSteps(new URL(url).hostname));

    try {
      // First prompt, still inside the submit gesture: the site's own origin,
      // which is all that's needed to read its <link rel> endpoints.
      await runStep("permission", () =>
        requestOrigins("permission", [siteOrigin], `Permission denied for ${siteOrigin}`),
      );

      const endpoints = await runStep("discovery", () => discoverEndpoints(url));

      const missing: string[] = [];
      for (const origin of endpointOrigins(endpoints)) {
        if (!(await browser.permissions.contains({ origins: [origin] }))) {
          missing.push(origin);
        }
      }

      // Same-origin servers (the common case) never see a second prompt.
      if (missing.length === 0) {
        await authorize(url, endpoints);
        return;
      }

      setSteps((current) => {
        if (!current) return current;
        const grant: Step = {
          id: "grant",
          label: `Granting access to ${missing.join(", ")}`,
          state: "waiting",
          detail: "Needs your confirmation",
        };
        const at = current.findIndex((step) => step.id === "token");
        return [...current.slice(0, at), grant, ...current.slice(at)];
      });
      setPending({ siteUrl: url, endpoints, origins: missing });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleGrant() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await runStep("grant", () =>
        requestOrigins(
          "grant",
          pending.origins,
          "Permission denied. Plume cannot complete sign-in without access to " +
            "this server's token endpoint.",
        ),
      );
      await authorize(pending.siteUrl, pending.endpoints);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const awaitingGrant = pending && !finished;

  return (
    <div
      role="dialog"
      aria-label="Add Micropub account"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <style>{"@keyframes plume-spin{to{transform:rotate(360deg)}}"}</style>
      <form
        onSubmit={handleAdd}
        style={{
          background: "white",
          padding: 24,
          borderRadius: 8,
          // Fluid width: hits 440px on roomy viewports, shrinks to 92% of
          // viewport on narrow ones (popup view, sidebars, small windows).
          // Without this, the rigid minWidth:400 clipped the Authorize
          // button when the modal opened inside a popup-sized surface.
          width: "min(440px, 92vw)",
          boxSizing: "border-box",
          display: "grid",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>Add Micropub account</h3>

        {steps ? (
          <ol
            aria-live="polite"
            style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}
          >
            {steps.map((step) => (
              <li
                key={step.id}
                style={{ display: "grid", gridTemplateColumns: "1.2rem 1fr", fontSize: 13 }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    color: COLOR[step.state],
                    display: "inline-block",
                    animation:
                      step.state === "active" ? "plume-spin 1s linear infinite" : undefined,
                  }}
                >
                  {ICON[step.state]}
                </span>
                <span style={{ color: step.state === "waiting" ? "#999" : "inherit" }}>
                  {step.label}
                  {step.detail && (
                    <span
                      style={{
                        display: "block",
                        color: step.state === "failed" ? "crimson" : "#666",
                        fontSize: 12,
                      }}
                    >
                      {step.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <label>
            Your site URL
            <input
              type="url"
              required
              placeholder="https://yourblog.com"
              value={url}
              onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)}
              style={{ width: "100%", padding: 8 }}
            />
          </label>
        )}

        {awaitingGrant && (
          <p style={{ margin: 0, fontSize: 13 }}>
            <strong>{new URL(pending.siteUrl).hostname}</strong> signs you in through a different
            server, so Plume needs access to it to exchange your login for a token.
          </p>
        )}

        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            // Wrap to a second row if the dialog gets squeezed below the
            // combined natural width of both buttons + gap.
            flexWrap: "wrap",
          }}
        >
          {/* Never disabled: a step can stall on the network or on a permission
              prompt, and closing the dialog must always remain possible. */}
          <button type="button" onClick={onClose}>
            {finished ? "Close" : "Cancel"}
          </button>
          {awaitingGrant ? (
            // Deliberately type="button" with its own handler: this click is
            // the fresh user gesture that permissions.request() requires.
            <button type="button" onClick={handleGrant} disabled={busy}>
              {busy ? "Authorizing…" : "Grant access & continue"}
            </button>
          ) : (
            !steps && (
              <button type="submit" disabled={busy || !url}>
                Authorize
              </button>
            )
          )}
        </div>
      </form>
    </div>
  );
}
