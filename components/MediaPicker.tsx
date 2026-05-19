import { useEffect, useState } from "preact/hooks";
import { MicropubClient } from "../core/micropub-client";
import type { MediaItem, TokenData } from "../core/types";

interface Props {
  account: TokenData;
  onSelect: (item: MediaItem) => void;
  onClose: () => void;
}

const PAGE_SIZE = 12;

/**
 * Modal grid picker for browsing files already on the user's media endpoint.
 * Queries `?q=source&limit=12[&after=cursor|&before=cursor]` and renders the
 * `items[]` as a 3-column thumbnail grid with cursor-based pagination.
 *
 * Selecting a thumbnail calls `onSelect(item)`; the Composer wires this to
 * `patch({ photo: [item.url] })` so the picked file flows into the same
 * preview/post pipeline as a freshly-uploaded one.
 */
export function MediaPicker({ account, onSelect, onClose }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [paging, setPaging] = useState<{ after?: string; before?: string }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(cursor?: { after?: string; before?: string }): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      // Self-heal: if the cached account record is missing media_endpoint (the
      // site didn't declare <link rel="media-endpoint"> on its homepage), look
      // it up via ?q=config. fetchAndCacheServerConfig writes the discovered
      // endpoint back to the account for next time, so this is a one-time hit.
      let mediaEndpoint = account.media_endpoint;
      if (!mediaEndpoint) {
        const { fetchAndCacheServerConfig } = await import("../core/server-config");
        const { accountStore } = await import("../storage");
        const domain = new URL(account.me).hostname;
        const config = await fetchAndCacheServerConfig(accountStore(), domain);
        mediaEndpoint = config["media-endpoint"];
        if (!mediaEndpoint) {
          throw new Error(
            `Server at ${domain} has no media-endpoint configured. ` +
              "Add one to your Indiekit config or check ?q=config response.",
          );
        }
      }
      const client = new MicropubClient({
        micropubEndpoint: account.micropub_endpoint,
        mediaEndpoint,
        token: account.access_token,
      });
      const result = await client.listMedia({ limit: PAGE_SIZE, ...cursor });
      setItems(result.items ?? []);
      setPaging(result.paging ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // Load the first page on mount only; subsequent pages are user-driven
  // via the pagination buttons below.
  useEffect(() => {
    void load();
  }, []);

  return (
    <div
      role="dialog"
      aria-label="Pick existing media"
      onClick={(e) => {
        // Click on the backdrop closes; clicks on the inner panel don't bubble here.
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: "white",
          padding: 12,
          borderRadius: 8,
          maxWidth: 340,
          width: "92%",
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <strong style={{ fontSize: 13 }}>Pick existing media</strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close media picker"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </header>

        {error && (
          <p role="alert" style={{ color: "crimson", fontSize: 12, margin: "8px 0" }}>
            {error}
          </p>
        )}
        {loading && <p style={{ color: "#999", fontSize: 12 }}>Loading…</p>}
        {!loading && !error && items.length === 0 && (
          <p style={{ color: "#999", fontSize: 12 }}>
            No media files yet. Upload one to get started.
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 4,
          }}
        >
          {items.map((item) => (
            <button
              key={item.uid ?? item.url}
              type="button"
              onClick={() => onSelect(item)}
              title={item.url}
              style={{
                aspectRatio: "1",
                padding: 0,
                border: "1px solid #eee",
                borderRadius: 4,
                background: "#f9fafb",
                cursor: "pointer",
                overflow: "hidden",
              }}
            >
              <img
                src={item.url}
                alt={item.uid ?? "Media item"}
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </button>
          ))}
        </div>

        {(paging.after || paging.before) && (
          <footer
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 12,
              fontSize: 12,
            }}
          >
            <button
              type="button"
              disabled={!paging.before || loading}
              onClick={() => void load({ before: paging.before })}
            >
              ← Newer
            </button>
            <button
              type="button"
              disabled={!paging.after || loading}
              onClick={() => void load({ after: paging.after })}
            >
              Older →
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
