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
  availableTypes?: PostType[]; // from server config; falls back to all
}

export function TypePicker({ value, onChange, availableTypes }: Props) {
  const visible = availableTypes ? TYPES.filter((t) => availableTypes.includes(t.value)) : TYPES;
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
      {visible.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          type="button"
          style={{
            padding: "6px 10px",
            background: value === t.value ? "#3b82f6" : "transparent",
            color: value === t.value ? "white" : "inherit",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
