import { useEffect, useState } from "preact/hooks";
import { browser } from "../../core/browser-api";
import { accountStore, draftStore, sessionStorage } from "../../storage";
import type { ListedDraft } from "../../storage";

const PREFILL_KEY = "pendingPrefill";

export function DraftList() {
  const [drafts, setDrafts] = useState<ListedDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setDrafts(await draftStore().list());
  }
  useEffect(() => {
    refresh();
    // Live refresh: the popup composer auto-saves drafts in the background.
    // Listen for storage mutations so the list stays current without a
    // manual reload of the options tab.
    function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string): void {
      if (area === "local" && "drafts" in changes) void refresh();
    }
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  // Delete by the domain/scope the store parsed out of the key itself. The
  // previous version re-split the key here and bailed on a falsy scope, which
  // made the button a silent no-op for every draft stored under an empty
  // scope — the exact drafts the composer used to produce.
  async function remove(entry: ListedDraft) {
    await draftStore().remove(entry.domain, entry.scope);
    await refresh();
  }

  // Open the draft in the composer. Seeds the same session-storage prefill the
  // context menus use, then opens the pop-out composer in a tab — the popup
  // can't be opened programmatically from the options page in every browser,
  // and the wider layout suits editing an existing draft anyway.
  async function open(entry: ListedDraft) {
    setError(null);
    try {
      const account = await accountStore().get(entry.domain);
      if (!account) {
        setError(`No connected account for ${entry.domain}. Reconnect it to edit this draft.`);
        return;
      }
      // The draft belongs to one blog; make that the posting identity so it
      // can't be published to whichever account happened to be active.
      await accountStore().setDefault(entry.domain);
      await sessionStorage().set({ [PREFILL_KEY]: entry.draft });
      await browser.tabs.create({ url: browser.runtime.getURL("popup.html?popout=1") });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (drafts.length === 0) return null;
  return (
    <section style={{ marginTop: 24 }}>
      <h2>Drafts ({drafts.length})</h2>
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {drafts.map((entry) => {
          const { key, domain, scope, draft } = entry;
          return (
            <li
              key={key}
              style={{
                padding: "8px 0",
                borderBottom: "1px solid #eee",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ flex: 1, fontSize: 13 }}>
                {(draft.content?.slice(0, 60) ?? draft.name ?? key) || "(empty)"}
                <span style={{ display: "block", fontSize: 11, color: "#999" }}>
                  {domain}
                  {scope && scope !== "general" ? ` · ${scope}` : ""}
                </span>
              </span>
              <span style={{ fontSize: 11, color: "#999" }}>
                {draft.savedAt ? new Date(draft.savedAt).toLocaleString() : ""}
              </span>
              <button type="button" onClick={() => open(entry)}>
                Edit
              </button>
              <button type="button" onClick={() => remove(entry)} aria-label="Delete draft">
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
