import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CLIENT_ID } from "../../core/auth-config";
import { browser } from "../../core/browser-api";
import { log, setLogContext } from "../../core/logger";
import { refreshToken } from "../../core/indieauth";
import { fetchAndCacheServerConfig } from "../../core/server-config";
import type { CreateOptions, PostType, ServerConfig, TokenData } from "../../core/types";
import {
  applyComposerSurface,
  COMPOSER_PING,
  COMPOSER_TAB_KEY,
  isTouchOnlyDevice,
  shouldOpenComposerInTab,
  TOUCH_ONLY_QUERY,
} from "../../core/composer-surface";
import { accountStore, defaultsStore, draftScope, draftStore, sessionStorage } from "../../storage";
import { Composer } from "./Composer";
import { DraftPanel } from "./DraftPanel";

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

function openInTab(): void {
  void browser.tabs.create({ url: browser.runtime.getURL("popup.html?popout=1") });
  window.close();
}

function Popup() {
  const [account, setAccount] = useState<TokenData | null | undefined>(undefined);
  const [accounts, setAccounts] = useState<TokenData[]>([]);
  const [prefill, setPrefill] = useState<PrefillState | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [enabledExtensions, setEnabledExtensions] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    (async () => {
      const a = await accountStore().getActiveRefreshed((tok) => refreshToken(tok, CLIENT_ID));
      setAccount(a);
      accountStore().list().then(setAccounts);
      if (!a) {
        log.info("popup opened (no account connected)");
        setPrefill({});
        return;
      }
      log.info("popup opened", { domain: new URL(a.me).hostname, popout: isPopout });
      // Kick off server config fetch (non-blocking)
      fetchAndCacheServerConfig(accountStore(), new URL(a.me).hostname)
        .then(setConfig)
        .catch((e) => {
          log.warn("server config unavailable", e);
          setConfig({});
        });
      accountStore().getEnabledExtensions(new URL(a.me).hostname).then(setEnabledExtensions);
      draftStore()
        .list()
        .then((all) => setDraftCount(all.filter((d) => d.domain === new URL(a.me).hostname).length))
        .catch(() => setDraftCount(0));
      const pre = (await sessionStorage().get<PrefillState>(PREFILL_KEY)) ?? {};
      await sessionStorage().remove(PREFILL_KEY);

      const domain = new URL(a.me).hostname;
      const scope = draftScope(pre);
      const draft = await draftStore().load(domain, scope);
      if (draft && !pre.content) {
        setPrefill({ ...pre, ...draft });
      } else {
        setPrefill(pre);
      }
    })().catch((e: unknown) => {
      // Without this, any rejection here left `account`/`prefill` unset and the
      // popup sat on "Loading…" forever with nothing for the user to report.
      // Surface the message instead and let the render fall through.
      log.error("popup init failed", e);
      setLoadError(e instanceof Error ? e.message : String(e));
      setAccount((prev) => (prev === undefined ? null : prev));
      setPrefill((prev) => prev ?? {});
    });
  }, []);

  function openOptions() {
    browser.runtime.openOptionsPage();
  }

  async function switchAccount(domain: string) {
    await accountStore().setDefault(domain);
    // Re-seed the prefill so a context-menu seed (bookmark URL etc.) survives
    // the reload under the newly selected account.
    if (prefill && Object.keys(prefill).length > 0) {
      await sessionStorage().set({ [PREFILL_KEY]: prefill });
    }
    window.location.reload();
  }

  if (account === undefined || prefill === null) {
    return <main style={{ padding: 16, minWidth: 320 }}>Loading…</main>;
  }

  if (account === null) {
    return (
      <main style={{ padding: 16, minWidth: 320 }}>
        {loadError ? (
          <>
            <p style={{ color: "#900" }}>Plume couldn't start up.</p>
            <p style={{ fontSize: 12, fontFamily: "monospace", wordBreak: "break-word" }}>
              {loadError}
            </p>
          </>
        ) : (
          <p>No Micropub account connected.</p>
        )}
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
              // No minimum: on a phone this tab is the default surface, and a
              // fixed 480px forced the layout viewport wider than the screen, so
              // the browser zoomed the whole page out.
              width: "min(720px, 100%)",
              margin: "min(32px, 4vw) auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
              borderRadius: 8,
              fontFamily: "system-ui, sans-serif",
              background: "white",
            }
          : {
              // 360 + the 56px rail: the writing column keeps the width it had
              minWidth: 420,
              maxWidth: 420,
              fontFamily: "system-ui, sans-serif",
            }
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
        <span>
          🪶 Plume ·{" "}
          {accounts.length > 1 ? (
            <select
              value={new URL(account.me).hostname}
              onChange={(e) => void switchAccount(e.currentTarget.value)}
              aria-label="Account to post from"
              title="Switch posting account"
              style={{
                border: "none",
                background: "none",
                color: "#666",
                font: "inherit",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {accounts.map((a) => {
                const d = new URL(a.me).hostname;
                return (
                  <option key={d} value={d}>
                    {d}
                  </option>
                );
              })}
            </select>
          ) : (
            new URL(account.me).hostname
          )}
        </span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {draftCount > 0 && (
            <button
              onClick={() => setShowDrafts((v) => !v)}
              type="button"
              aria-label={`${draftCount} saved ${draftCount === 1 ? "draft" : "drafts"}`}
              title={`${draftCount} saved ${draftCount === 1 ? "draft" : "drafts"}`}
              aria-pressed={showDrafts}
              style={{
                // A labelled chip rather than an icon: 🗒 has no glyph in some
                // Linux font sets and degrades to an empty box, which left the
                // one control meant to make drafts findable as the least
                // visible thing in the header.
                background: showDrafts ? "#3b82f6" : "#eff6ff",
                color: showDrafts ? "white" : "#1d4ed8",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                whiteSpace: "nowrap",
              }}
            >
              {draftCount} {draftCount === 1 ? "draft" : "drafts"}
            </button>
          )}
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
      {showDrafts ? (
        <DraftPanel
          domain={new URL(account.me).hostname}
          onClose={() => setShowDrafts(false)}
          onOpen={(draft) => {
            // Reload with the draft seeded so the composer picks it up through
            // the same prefill path the context menus already use.
            void sessionStorage()
              .set({ [PREFILL_KEY]: draft })
              .then(() => window.location.reload());
          }}
        />
      ) : (
        <Composer
          account={account}
          seed={prefill}
          serverConfig={config ?? undefined}
          enabledExtensions={enabledExtensions}
          isPopout={isPopout}
          onPosted={async (loc) => {
            const domain = new URL(account.me).hostname;
            await draftStore().remove(domain, draftScope(prefill));
            setToast(`Posted ✓ ${loc}`);
            setTimeout(() => window.close(), 800);
          }}
          onError={(msg) => setToast(`Error: ${msg}`)}
        />
      )}
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

setLogContext("popup");

/**
 * First open on a touch-only device: Chromium on Android closes this popup
 * as soon as the keyboard appears, so switch the icon to the tab surface and
 * open the tab now. The stored preference means this runs once per profile;
 * afterwards the icon tap goes straight to the tab via the background. Not
 * in pop-out mode, which is already the tab.
 */
async function redirectTouchDeviceToTab(): Promise<boolean> {
  if (isPopout) return false;
  const { composerInTab } = await defaultsStore().get();
  // Only the automatic case is decided here; an explicit choice was already
  // applied by the background, so the popup being open means "popup".
  if (composerInTab !== undefined) return false;
  const mediaMatches = window.matchMedia(TOUCH_ONLY_QUERY).matches;
  const os = await browser.runtime
    .getPlatformInfo()
    .then((info) => info.os as string)
    .catch(() => undefined);
  const touchOnly = isTouchOnlyDevice(mediaMatches, os);
  // Recorded so a "the popup still opens on my phone" report says why.
  log.info("composer surface decided", { mediaMatches, os, touchOnly });
  if (!shouldOpenComposerInTab(composerInTab, touchOnly)) return false;
  try {
    await defaultsStore().setComposerInTab(true);
    await applyComposerSurface(true);
  } catch (e) {
    // Still open the tab: the user must never be stuck. The next tap retries.
    log.warn("could not remember the tab composer preference", e);
  }
  openInTab();
  return true;
}

/**
 * A pop-out registers itself so the next icon tap focuses this tab instead of
 * opening another, whichever opener created it (background, the ↗ button, or
 * the first-run touch redirect). `tabs.getCurrent()` works from an extension
 * page without the `tabs` permission.
 */
async function registerComposerTab(): Promise<void> {
  // Answer the background's ping while this page is the composer. Navigating
  // the tab elsewhere unloads this listener, which is exactly the signal.
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if ((message as { type?: unknown })?.type !== COMPOSER_PING) return false;
    sendResponse(true);
    return false;
  });
  const tab = await browser.tabs.getCurrent();
  if (tab?.id !== undefined) await sessionStorage().set({ [COMPOSER_TAB_KEY]: tab.id });
}

const root = document.getElementById("app");
if (root) {
  if (isPopout)
    registerComposerTab().catch((e) => log.warn("could not register the composer tab", e));
  redirectTouchDeviceToTab()
    .catch((e) => {
      log.warn("touch-device check failed", e);
      return false;
    })
    .then((redirected) => {
      if (!redirected) render(<Popup />, root);
    });
}
