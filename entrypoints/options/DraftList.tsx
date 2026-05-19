import { useEffect, useState } from "preact/hooks";
import { draftStore } from "../../storage";
import type { ListedDraft } from "../../storage";

export function DraftList() {
  const [drafts, setDrafts] = useState<ListedDraft[]>([]);

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
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  async function remove(key: string) {
    const [domain, scope] = key.split("::", 2);
    if (!domain || !scope) return;
    await draftStore().remove(domain, scope);
    await refresh();
  }

  if (drafts.length === 0) return null;
  return (
    <section style={{ marginTop: 24 }}>
      <h2>Drafts ({drafts.length})</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {drafts.map(({ key, draft }) => (
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
            </span>
            <span style={{ fontSize: 11, color: "#999" }}>
              {draft.savedAt ? new Date(draft.savedAt).toLocaleString() : ""}
            </span>
            <button type="button" onClick={() => remove(key)} aria-label="Delete draft">
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
