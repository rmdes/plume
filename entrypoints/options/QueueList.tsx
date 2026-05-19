import { useEffect, useState } from "preact/hooks";
import { MicropubClient } from "../../core/micropub-client";
import { accountStore, queueStore } from "../../storage";
import type { QueueItem } from "../../storage";

export function QueueList() {
  const [items, setItems] = useState<QueueItem[]>([]);

  async function refresh() {
    setItems(await queueStore().list());
  }
  useEffect(() => {
    refresh();
    // Live refresh: background queue executor mutates `queue` in storage on
    // its own schedule. Without this listener, this list goes stale until
    // the user reloads the options page.
    function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string): void {
      if (area === "local" && "queue" in changes) void refresh();
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  async function retryNow(item: QueueItem) {
    const account = await accountStore().get(item.account);
    if (!account) return;
    const client = new MicropubClient({
      micropubEndpoint: account.micropub_endpoint,
      mediaEndpoint: account.media_endpoint,
      token: account.access_token,
    });
    try {
      await client.create(item.payload);
      await queueStore().remove(item.id);
    } catch (e) {
      await queueStore().recordAttempt(item.id, {
        error: e instanceof Error ? e.message : String(e),
        retryable: true,
      });
    }
    await refresh();
  }

  async function discard(item: QueueItem) {
    await queueStore().remove(item.id);
    await refresh();
  }

  if (items.length === 0) return null;
  return (
    <section style={{ marginTop: 24 }}>
      <h2>Retry queue ({items.length})</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              padding: "8px 0",
              borderBottom: "1px solid #eee",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: item.status === "auth_needed" ? "#dc2626" : "#666",
                minWidth: 100,
              }}
            >
              {item.status}
            </span>
            <span style={{ flex: 1, fontSize: 13 }}>
              {item.payload.content?.slice(0, 60) ?? item.payload.name ?? "(no content)"} →{" "}
              {item.account}
            </span>
            <span style={{ fontSize: 11, color: "#999" }}>{item.attempts.length} attempts</span>
            <button type="button" onClick={() => retryNow(item)}>
              Retry
            </button>
            <button type="button" onClick={() => discard(item)}>
              Discard
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
