import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CLIENT_ID } from "../../core/auth-config";
import { refreshToken } from "../../core/indieauth";
import type { CreateOptions, PostType, TokenData } from "../../core/types";
import { accountStore, sessionStorage } from "../../storage";
import { Composer } from "./Composer";

const PREFILL_KEY = "pendingPrefill";

interface PrefillState extends Partial<CreateOptions> {
  type?: PostType;
}

function Popup() {
  const [account, setAccount] = useState<TokenData | null | undefined>(undefined);
  const [prefill, setPrefill] = useState<PrefillState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const a = await accountStore().getActiveRefreshed((tok) => refreshToken(tok, CLIENT_ID));
      setAccount(a);
      const pre = await sessionStorage().get<PrefillState>(PREFILL_KEY);
      if (pre) {
        setPrefill(pre);
        await sessionStorage().remove(PREFILL_KEY);
      } else {
        setPrefill({});
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

  return (
    <main style={{ minWidth: 360, maxWidth: 360, fontFamily: "system-ui, sans-serif" }}>
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
        <button
          onClick={openOptions}
          type="button"
          aria-label="Open settings"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#666" }}
        >
          ⚙
        </button>
      </header>
      <Composer
        account={account}
        seed={prefill}
        onPosted={(loc) => {
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
