import type { PostType } from "../core/types";

const TYPES: { value: PostType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "article", label: "Article" },
  { value: "reply", label: "Reply" },
  { value: "bookmark", label: "Bookmark" },
  { value: "like", label: "Like" },
  { value: "repost", label: "Repost" },
  { value: "quote", label: "Quote" },
  { value: "photo", label: "Photo" },
];

interface Props {
  value: PostType;
  onChange: (type: PostType) => void;
  /**
   * Post type → the server's own name for it, from `?q=post-types`
   * (`serverPostTypeLabels`). Types the server advertises take its label;
   * the rest stay selectable but are dimmed, because a server omitting a
   * type does not mean it will reject one — Micropub derives the type from
   * the properties sent. Omit while the config is still loading.
   */
  serverLabels?: Record<string, string>;
}

export function TypePicker({ value, onChange, serverLabels }: Props) {
  const advertised = serverLabels && Object.keys(serverLabels).length > 0;
  return (
    <div
      role="tablist"
      aria-label="Post type"
      style={{
        display: "flex",
        gap: 4,
        overflowX: "auto",
        padding: "4px 0",
        borderBottom: "1px solid #eee",
      }}
    >
      {TYPES.map((t) => {
        const selected = value === t.value;
        const known = !advertised || t.value in serverLabels;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.value)}
            type="button"
            title={known ? undefined : "Not advertised by this server"}
            style={{
              padding: "6px 10px",
              background: selected ? "#3b82f6" : "transparent",
              color: selected ? "white" : "inherit",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
              whiteSpace: "nowrap",
              opacity: known || selected ? 1 : 0.45,
            }}
          >
            {serverLabels?.[t.value] ?? t.label}
          </button>
        );
      })}
    </div>
  );
}
