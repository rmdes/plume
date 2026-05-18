import { useState } from "preact/hooks";

interface Props {
  values: string[];
  suggestions?: string[];
  onChange: (next: string[]) => void;
}

export function CategoryChips({ values, suggestions = [], onChange }: Props) {
  const [input, setInput] = useState("");
  function add(tag: string) {
    const t = tag.trim();
    if (!t || values.includes(t)) return;
    onChange([...values, t]);
    setInput("");
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {values.map((v) => (
        <span
          key={v}
          style={{
            background: "#eef",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 12,
          }}
        >
          #{v}{" "}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            style={{ background: "none", border: "none", cursor: "pointer" }}
            aria-label={`Remove tag ${v}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        list="cat-suggestions"
        value={input}
        placeholder="+ add tag"
        aria-label="Add tag"
        onInput={(e) => setInput((e.currentTarget as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(input);
          }
        }}
        onBlur={() => add(input)}
        style={{ border: "1px dashed #ccc", padding: "2px 6px", fontSize: 12 }}
      />
      {suggestions.length > 0 && (
        <datalist id="cat-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
