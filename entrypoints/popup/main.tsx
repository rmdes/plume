import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CLIENT_ID } from "../../core/auth-config";
import { refreshToken } from "../../core/indieauth";
import { fetchAndCacheServerConfig } from "../../core/server-config";
import type { CreateOptions, PostType, ServerConfig, TokenData } from "../../core/types";
import { accountStore, draftStore, sessionStorage } from "../../storage";
import { Composer } from "./Composer";

const PREFILL_KEY = "pendingPrefill";

interface PrefillState extends Partial<CreateOptions> {
  type?: PostType;
}

// Pop-out mode renders the popup as a centered tab page at desk-width
// instead of the cramped 360px toolbar popup. Triggered by appending
// ?popout=1 to popup.html — both the explicit pop-out button below and
// the openPopupSafe fallback in background.ts use this flag.
const isPopout =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("popout") === "1";

function Popup() {
  const [account, setAccount] = useState<TokenData | null | undefined>(undefined);
  const [prefill, setPrefill] = useState<PrefillState | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [enabledExtensions, setEnabledExtensions] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  function openInTab() {
    void chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?popout=1") });
    window.close();
  }

  useEffect(() => {
    (async () => {
      const a = await accountStore().getActiveRefreshed((tok) => refreshToken(tok, CLIENT_ID));
      setAccount(a);
      if (!a) {
        setPrefill({});
        return;
      }
      // Kick off server config fetch (non-blocking)
      fetchAndCacheServerConfig(accountStore(), new URL(a.me).hostname)
        .then(setConfig)
        .catch(() => setConfig({}));
      accountStore().getEnabledExtensions(new URL(a.me).hostname).then(setEnabledExtensions);
      const pre = (await sessionStorage().get<PrefillState>(PREFILL_KEY)) ?? {};
      await sessionStorage().remove(PREFILL_KEY);

      const domain = new URL(a.me).hostname;
      const scope = pre.bookmarkOf ?? pre.inReplyTo ?? pre.likeOf ?? pre.repostOf ?? "general";
      const draft = await draftStore().load(domain, scope);
      if (draft && !pre.content) {
        setPrefill({ ...pre, ...draft });
      } else {
        setPrefill(pre);
      }
    })();
  }, []);

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  if (account === undefined || prefill === null) {
    return <main style={{ padding: 16, minWidth: 320 }}>Loading…</main>;
  }

  if (account === null) {
    return (
      <main style={{ padding: 16, minWidth: 320 }}>
        <p>No Micropub account connected.</p>
        <button onClick={openOptions} type="button">
          Open Plume settings
        </button>
      </main>
    );
  }

  const mediaError = (prefill as Record<string, unknown>)._media_error as string | undefined;

  return (
    <main
      style={
        isPopout
          ? {
              // Desk-width layout: comfortable for articles, still readable
              // line lengths (typography research caps body width ~75ch ≈ 720px).
              minWidth: 480,
              maxWidth: 720,
              margin: "32px auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
              borderRadius: 8,
              fontFamily: "system-ui, sans-serif",
              background: "white",
            }
          : { minWidth: 360, maxWidth: 360, fontFamily: "system-ui, sans-serif" }
      }
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid #eee",
          fontSize: 12,
          color: "#666",
        }}
      >
        <span>🪶 Plume · {new URL(account.me).hostname}</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {!isPopout && (
            <button
              onClick={openInTab}
              type="button"
              aria-label="Open in a wider window"
              title="Open in a wider window (for articles)"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#666",
                fontSize: 14,
              }}
            >
              ↗
            </button>
          )}
          <button
            onClick={openOptions}
            type="button"
            aria-label="Open settings"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#666" }}
          >
            ⚙
          </button>
        </div>
      </header>
      {mediaError && (
        <div
          role="alert"
          style={{
            background: "#fee",
            color: "#900",
            padding: "8px 12px",
            fontSize: 12,
            borderBottom: "1px solid #fcc",
          }}
        >
          ⚠ {mediaError}
        </div>
      )}
      {config === null && (
        <div
          style={{
            padding: "4px 12px",
            fontSize: 11,
            color: "#999",
            textAlign: "center",
            borderBottom: "1px solid #eee",
          }}
        >
          Connecting to {new URL(account.me).hostname}…
        </div>
      )}
      <Composer
        account={account}
        seed={prefill}
        serverConfig={config ?? undefined}
        enabledExtensions={enabledExtensions}
        isPopout={isPopout}
        onPosted={async (loc) => {
          const domain = new URL(account.me).hostname;
          const scope =
            prefill.bookmarkOf ??
            prefill.inReplyTo ??
            prefill.likeOf ??
            prefill.repostOf ??
            "general";
          await draftStore().remove(domain, scope);
          setToast(`Posted ✓ ${loc}`);
          setTimeout(() => window.close(), 800);
        }}
        onError={(msg) => setToast(`Error: ${msg}`)}
      />
      {toast && (
        <div
          role="status"
          style={{ padding: 8, background: "#f5f5f5", fontSize: 12, color: "#444" }}
        >
          {toast}
        </div>
      )}
    </main>
  );
}

const root = document.getElementById("app");
if (root) {
  render(<Popup />, root);
}
