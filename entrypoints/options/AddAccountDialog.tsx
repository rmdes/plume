import { useState } from "preact/hooks";
import { CLIENT_ID, DEFAULT_SCOPE, getRedirectUri } from "../../core/auth-config";
import { chromeIdentityLauncher } from "../../core/auth-launcher";
import { startAuth } from "../../core/indieauth";
import { accountStore } from "../../storage";

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

export function AddAccountDialog({ onClose, onAdded }: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(event: Event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const origin = `${new URL(url).origin}/*`;
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) {
        throw new Error(`Permission denied for ${origin}`);
      }
      const token = await startAuth({
        siteUrl: url,
        clientId: CLIENT_ID,
        redirectUri: getRedirectUri(),
        scope: DEFAULT_SCOPE,
        launcher: chromeIdentityLauncher,
      });
      await accountStore().add(token);
      onAdded();
      onClose();
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
          <button type="submit" disabled={busy || !url}>
            {busy ? "Authorizing…" : "Authorize"}
          </button>
        </div>
      </form>
    </div>
  );
}
