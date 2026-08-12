import { useState } from "preact/hooks";
import { CLIENT_ID, DEFAULT_SCOPE, getRedirectUri } from "../../core/auth-config";
import { browser } from "../../core/browser-api";
import { chromeIdentityLauncher } from "../../core/auth-launcher";
import { discoverEndpoints, endpointOrigins } from "../../core/discovery";
import { startAuth } from "../../core/indieauth";
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

export function AddAccountDialog({ onClose, onAdded }: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingGrant | null>(null);

  async function authorize(siteUrl: string, endpoints: Endpoints) {
    const token = await startAuth({
      siteUrl,
      clientId: CLIENT_ID,
      redirectUri: getRedirectUri(),
      scope: DEFAULT_SCOPE,
      launcher: chromeIdentityLauncher,
      endpoints,
    });
    await accountStore().add(token);
    onAdded();
    onClose();
  }

  async function handleAdd(event: Event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // First prompt, still inside the submit gesture: the site's own origin,
      // which is all that's needed to read its <link rel> endpoints.
      const siteOrigin = `${new URL(url).origin}/*`;
      if (!(await browser.permissions.request({ origins: [siteOrigin] }))) {
        throw new Error(`Permission denied for ${siteOrigin}`);
      }

      const endpoints = await discoverEndpoints(url);
      const needed = endpointOrigins(endpoints);
      const missing: string[] = [];
      for (const origin of needed) {
        if (!(await browser.permissions.contains({ origins: [origin] }))) {
          missing.push(origin);
        }
      }

      // Same-origin servers (the common case) never see a second prompt.
      if (missing.length === 0) {
        await authorize(url, endpoints);
        return;
      }
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
      if (!(await browser.permissions.request({ origins: pending.origins }))) {
        throw new Error(
          `Permission denied for ${pending.origins.join(", ")}. Plume cannot complete ` +
            "sign-in without access to this server's token endpoint.",
        );
      }
      await authorize(pending.siteUrl, pending.endpoints);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
        <h3>Add Micropub account</h3>
        {pending ? (
          <>
            <p style={{ margin: 0 }}>
              <strong>{new URL(pending.siteUrl).hostname}</strong> signs you in through a different
              server. Plume needs access to it to exchange your login for a token:
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {pending.origins.map((origin) => (
                <li key={origin} style={{ fontFamily: "monospace", fontSize: 13 }}>
                  {origin}
                </li>
              ))}
            </ul>
          </>
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
        {error && <p style={{ color: "crimson" }}>{error}</p>}
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
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {pending ? (
            // Deliberately type="button" with its own handler: this click is
            // the fresh user gesture that permissions.request() requires.
            <button type="button" onClick={handleGrant} disabled={busy}>
              {busy ? "Authorizing…" : "Grant access & continue"}
            </button>
          ) : (
            <button type="submit" disabled={busy || !url}>
              {busy ? "Authorizing…" : "Authorize"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
