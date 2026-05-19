import { useState } from "preact/hooks";

interface Props {
  values: Record<string, string>;
  defaults?: { textLevel?: string; codeLevel?: string; tools?: string; description?: string };
  onChange: (next: Record<string, string>) => void;
}

export function AiMetadataPanel({ values, defaults = {}, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = {
    "ai-text-level": values["ai-text-level"] ?? defaults.textLevel ?? "",
    "ai-code-level": values["ai-code-level"] ?? defaults.codeLevel ?? "",
    "ai-tools": values["ai-tools"] ?? defaults.tools ?? "",
    "ai-description": values["ai-description"] ?? defaults.description ?? "",
  };
  const summary = current["ai-text-level"]
    ? `level ${current["ai-text-level"]}${current["ai-tools"] ? ` · ${current["ai-tools"]}` : ""}`
    : "not set";

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      style={{
        background: "#fcf8f0",
        padding: 8,
        borderRadius: 4,
        border: "1px solid #f0e6d6",
        fontSize: 12,
      }}
    >
      <summary style={{ cursor: "pointer" }}>AI metadata ({summary})</summary>
      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        <label>
          Text level:
          <select
            value={current["ai-text-level"]}
            onChange={(e) =>
              onChange({ ...values, "ai-text-level": (e.currentTarget as HTMLSelectElement).value })
            }
          >
            <option value="">—</option>
            <option value="0">0 — Human only</option>
            <option value="1">1 — Editorial assist</option>
            <option value="2">2 — Co-drafting</option>
            <option value="3">3 — AI generated, human reviewed</option>
          </select>
        </label>
        <label>
          Code level (optional):
          <select
            value={current["ai-code-level"]}
            onChange={(e) =>
              onChange({
                ...values,
                "ai-code-level": (e.currentTarget as HTMLSelectElement).value,
              })
            }
          >
            <option value="">—</option>
            <option value="0">0 — Human-written</option>
            <option value="1">1 — AI-assisted</option>
            <option value="2">2 — Primarily AI-generated</option>
          </select>
        </label>
        <label>
          Tools:
          <input
            type="text"
            value={current["ai-tools"]}
            onInput={(e) =>
              onChange({ ...values, "ai-tools": (e.currentTarget as HTMLInputElement).value })
            }
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Description:
          <textarea
            value={current["ai-description"]}
            rows={2}
            onInput={(e) =>
              onChange({
                ...values,
                "ai-description": (e.currentTarget as HTMLTextAreaElement).value,
              })
            }
            style={{ width: "100%" }}
          />
        </label>
        <p style={{ margin: 0, fontSize: 11, color: "#888" }}>
          <a
            href="https://rmendes.net/articles/2026/03/03/adding-ai-usage-metadata-to/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3b82f6" }}
          >
            About AI transparency metadata →
          </a>
        </p>
      </div>
    </details>
  );
}
