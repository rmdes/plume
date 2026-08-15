import { useState } from "preact/hooks";
import { CLIENT_ID, DEFAULT_SCOPE, getRedirectUri } from "../../core/auth-config";
import { chromeIdentityLauncher } from "../../core/auth-launcher";
import { browser } from "../../core/browser-api";
import { discoverEndpoints, endpointOrigins } from "../../core/discovery";
import { startAuth } from "../../core/indieauth";
import { fetchAndCacheServerConfig } from "../../core/server-config";
import type { Endpoints } from "../../core/types";
import { accountStore } from "../../storage";

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

export function AddAccountDialog({ onClose, onAdded }: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingGrant | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [finished, setFinished] = useState(false);

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
      patchStep(id, { state: "done" });
      return result;
    } catch (e) {
      patchStep(id, {
        state: "failed",
        detail: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  async function authorize(siteUrl: string, endpoints: Endpoints) {
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
      await runStep("permission", async () => {
        if (!(await browser.permissions.request({ origins: [siteOrigin] }))) {
          throw new Error(`Permission denied for ${siteOrigin}`);
        }
      });

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
      await runStep("grant", async () => {
        if (!(await browser.permissions.request({ origins: pending.origins }))) {
          throw new Error(
            `Permission denied. Plume cannot complete sign-in without access to ` +
              `this server's token endpoint.`,
          );
        }
      });
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
