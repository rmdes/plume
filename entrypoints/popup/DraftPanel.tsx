import { useEffect, useState } from "preact/hooks";
import { log } from "../../core/logger";
import { draftStore } from "../../storage";
import type { Draft, ListedDraft } from "../../storage";

interface Props {
  /** Only this blog's drafts; the composer can only post to one account. */
  domain: string;
  onOpen: (draft: Draft) => void;
  onClose: () => void;
}

/** "2 min ago" is easier to scan than a timestamp when picking a draft. */
function relativeTime(iso?: string): string {
  if (!iso) return "";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (seconds >= size) return formatter.format(-Math.floor(seconds / size), unit);
  }
  return formatter.format(0, "minute");
}

/** The site a reply or bookmark targets — the type is already shown beside it. */
function targetHost(scope: string): string {
  if (!scope || scope === "general") return "";
  try {
    return new URL(scope).hostname;
  } catch {
    return "";
  }
}

function summarise(draft: Draft): string {
  const text = draft.content?.trim() || draft.name?.trim() || "";
  if (!text) return "(empty)";
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

export function DraftPanel({ domain, onOpen, onClose }: Props) {
  const [drafts, setDrafts] = useState<ListedDraft[] | null>(null);

  async function refresh() {
    const all = await draftStore().list();
    setDrafts(all.filter((entry) => entry.domain === domain));
  }

  useEffect(() => {
    refresh().catch((e) => log.error("listing drafts failed", e));
  }, [domain]);

  async function remove(entry: ListedDraft) {
    await draftStore().remove(entry.domain, entry.scope);
    await refresh();
  }

  return (
    <div style={{ padding: 12, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>Drafts</strong>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6" }}
        >
          ← back
        </button>
      </div>

      {drafts === null ? (
        <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Loading…</p>
      ) : drafts.length === 0 ? (
        <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
          No saved drafts for {domain}. Drafts are kept for seven days.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
          {drafts.map((entry) => (
            <li
              key={entry.key}
              style={{ display: "flex", alignItems: "start", gap: 8, padding: "6px 0" }}
            >
              <button
                type="button"
                onClick={() => onOpen(entry.draft)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  font: "inherit",
                }}
              >
                <span style={{ fontSize: 13, display: "block" }}>{summarise(entry.draft)}</span>
                <span style={{ fontSize: 11, color: "#999" }}>
                  {entry.draft.type ?? "note"}
                  {targetHost(entry.scope) ? ` · ${targetHost(entry.scope)}` : ""} ·{" "}
                  {relativeTime(entry.draft.savedAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => remove(entry)}
                aria-label={`Delete draft: ${summarise(entry.draft)}`}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#999",
                  fontSize: 15,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
