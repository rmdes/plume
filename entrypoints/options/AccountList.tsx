import { useEffect, useState } from "preact/hooks";
import { browser } from "../../core/browser-api";
import { applyComposerSurface } from "../../core/composer-surface";
import type { TokenData } from "../../core/types";
import { accountStore, defaultsStore } from "../../storage";
import { ExtensionToggles } from "./ExtensionToggles";

interface Props {
  onAddClick: () => void;
}

export function AccountList({ onAddClick }: Props) {
  const [accounts, setAccounts] = useState<TokenData[]>([]);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [tabSignIn, setTabSignIn] = useState(false);
  const [composerInTab, setComposerInTab] = useState(false);

  async function refresh() {
    const store = accountStore();
    setAccounts(await store.list());
    setActiveDomain(await store.getDefaultDomain());
    const defaults = await defaultsStore().get();
    setTabSignIn(defaults.tabSignIn ?? false);
    setComposerInTab(defaults.composerInTab ?? false);
  }

  async function toggleTabSignIn(value: boolean) {
    setTabSignIn(value);
    await defaultsStore().setTabSignIn(value);
  }

  async function toggleComposerInTab(value: boolean) {
    setComposerInTab(value);
    await defaultsStore().setComposerInTab(value);
    await applyComposerSurface(value);
  }

  useEffect(() => {
    refresh();
    // A tab-based sign-in is completed by the background script, possibly
    // after this page was discarded and reopened, so the list must follow
    // storage rather than wait for the dialog to tell it.
    function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string): void {
      if (area === "local" && ("accounts" in changes || "defaults" in changes)) void refresh();
    }
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  async function handleSetDefault(domain: string) {
    await accountStore().setDefault(domain);
    await refresh();
  }

  async function handleRemove(domain: string) {
    if (!confirm(`Remove account ${domain}?`)) return;
    await accountStore().remove(domain);
    await refresh();
  }

  return (
    <section>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Accounts</h2>
        <button onClick={onAddClick} type="button">
          + Add account
        </button>
      </header>
      <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
        <input
          type="checkbox"
          checked={tabSignIn}
          onChange={(e) => void toggleTabSignIn((e.currentTarget as HTMLInputElement).checked)}
        />{" "}
        Sign in using a browser tab instead of a popup window
        <span style={{ display: "block", color: "#666", fontSize: 12 }}>
          Plume does this on its own where the browser has no sign-in window, such as Firefox for
          Android. Turn it on if the popup window never appears or closes at once.
        </span>
      </label>
      <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
        <input
          type="checkbox"
          checked={composerInTab}
          onChange={(e) => void toggleComposerInTab((e.currentTarget as HTMLInputElement).checked)}
        />{" "}
        Open the composer in a tab instead of the toolbar popup
        <span style={{ display: "block", color: "#666", fontSize: 12 }}>
          Plume does this on its own on touch-only devices, where the popup closes as soon as the
          keyboard appears.
        </span>
      </label>
      {accounts.length === 0 ? (
        <p>No accounts yet. Click "Add account" to connect your Micropub blog.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {accounts.map((a) => {
            const domain = new URL(a.me).hostname;
            const isActive = domain === activeDomain;
            return (
              <li key={domain} style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontWeight: isActive ? 600 : 400 }}>
                    {isActive ? "●" : "○"} {domain}
                  </span>
                  <span style={{ flex: 1, color: "#666", fontSize: 12 }}>scope: {a.scope}</span>
                  {!isActive && (
                    <button onClick={() => handleSetDefault(domain)} type="button">
                      Set default
                    </button>
                  )}
                  <button onClick={() => handleRemove(domain)} type="button">
                    Remove
                  </button>
                </div>
                <ExtensionToggles domain={domain} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
