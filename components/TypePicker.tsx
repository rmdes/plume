import type { PostType } from "../core/types";

// The icon carries the recognition at this size; the label is the fallback
// for anyone who reads the glyph differently than intended.
const TYPES: { value: PostType; label: string; icon: string }[] = [
  { value: "note", label: "Note", icon: "✏️" },
  { value: "article", label: "Article", icon: "📄" },
  { value: "reply", label: "Reply", icon: "💬" },
  { value: "bookmark", label: "Bookmark", icon: "🔖" },
  { value: "like", label: "Like", icon: "❤️" },
  { value: "repost", label: "Repost", icon: "🔁" },
  { value: "quote", label: "Quote", icon: "❝" },
  { value: "photo", label: "Photo", icon: "📷" },
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
      aria-orientation="vertical"
      style={{
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #eee",
        alignSelf: "stretch",
      }}
    >
      {TYPES.map((t) => {
        const selected = value === t.value;
        const known = !advertised || t.value in serverLabels;
        const label = serverLabels?.[t.value] ?? t.label;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.value)}
            type="button"
            title={known ? label : `${label} — not advertised by this server`}
            style={{
              display: "grid",
              justifyItems: "center",
              gap: 1,
              padding: "6px 2px",
              width: "4rem",
              background: selected ? "#3b82f6" : "transparent",
              color: selected ? "white" : "inherit",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              opacity: known || selected ? 1 : 0.45,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1.1 }}>
              {t.icon}
            </span>
            <span
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
                // Server names can be longer than the built-in labels
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
