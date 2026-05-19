import { useRef } from "preact/hooks";
import type { RefObject } from "preact";
import {
  numberedLines,
  prefixLines,
  wrapSelection,
  type MarkdownInsertion,
} from "../core/markdown";

interface Props {
  /** Live textarea ref so toolbar actions can read selection bounds. */
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
  /** Toggle the preview pane on/off. */
  preview: boolean;
  onTogglePreview: () => void;
  /** Wider layout in popout mode → show extra buttons. */
  compact?: boolean;
}

/**
 * Above-textarea toolbar for inserting Markdown syntax. Toolbar actions
 * read the current selection from the textarea, apply the transformation,
 * push the new value via onChange, and restore selection on the next
 * tick so the cursor lands inside the just-inserted markup.
 */
export function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
  preview,
  onTogglePreview,
  compact = false,
}: Props) {
  // Track the next selection to apply after the value has been written
  // back into the textarea. Preact's re-render between onChange and
  // selection restore would otherwise wipe the caret position.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  function apply(action: (src: string, start: number, end: number) => MarkdownInsertion) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart, selectionEnd } = ta;
    const r = action(value, selectionStart, selectionEnd);
    pendingSelection.current = { start: r.selectionStart, end: r.selectionEnd };
    onChange(r.value);
    // Restore selection after Preact flushes the updated value into the DOM.
    queueMicrotask(() => {
      const cur = textareaRef.current;
      const sel = pendingSelection.current;
      if (cur && sel) {
        cur.focus();
        cur.setSelectionRange(sel.start, sel.end);
        pendingSelection.current = null;
      }
    });
  }

  const btnStyle = {
    background: "white",
    border: "1px solid #d4d4d8",
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 12,
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    cursor: "pointer",
    lineHeight: 1.4,
  };

  function link() {
    const ta = textareaRef.current;
    if (!ta) return;
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    apply((src, start, end) => wrapSelection(src, start, end, "[", `](${url})`, "link text"));
  }

  return (
    <div
      role="toolbar"
      aria-label="Markdown formatting"
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        alignItems: "center",
        padding: "4px 0",
      }}
    >
      <button
        type="button"
        title="Bold (wrap with **)"
        style={{ ...btnStyle, fontWeight: 700 }}
        onClick={() => apply((s, a, b) => wrapSelection(s, a, b, "**", "**", "bold"))}
      >
        B
      </button>
      <button
        type="button"
        title="Italic (wrap with *)"
        style={{ ...btnStyle, fontStyle: "italic" }}
        onClick={() => apply((s, a, b) => wrapSelection(s, a, b, "*", "*", "italic"))}
      >
        I
      </button>
      <button type="button" title="Link" style={btnStyle} onClick={link}>
        🔗
      </button>
      <button
        type="button"
        title="Bulleted list"
        style={btnStyle}
        onClick={() => apply((s, a, b) => prefixLines(s, a, b, "- "))}
      >
        •
      </button>
      {!compact && (
        <button
          type="button"
          title="Numbered list"
          style={btnStyle}
          onClick={() => apply(numberedLines)}
        >
          1.
        </button>
      )}
      <button
        type="button"
        title="Blockquote"
        style={btnStyle}
        onClick={() => apply((s, a, b) => prefixLines(s, a, b, "> "))}
      >
        ❝
      </button>
      <button
        type="button"
        title="Inline code (wrap with `)"
        style={{ ...btnStyle, fontFamily: "ui-monospace, monospace" }}
        onClick={() => apply((s, a, b) => wrapSelection(s, a, b, "`", "`", "code"))}
      >
        {"<>"}
      </button>
      {!compact && (
        <button
          type="button"
          title="Heading"
          style={btnStyle}
          onClick={() => apply((s, a, b) => prefixLines(s, a, b, "## "))}
        >
          H
        </button>
      )}
      <span style={{ flex: 1 }} />
      <button
        type="button"
        title={preview ? "Back to editing" : "Preview rendered Markdown"}
        aria-pressed={preview}
        style={{
          ...btnStyle,
          background: preview ? "#dbeafe" : "white",
          borderColor: preview ? "#3b82f6" : "#d4d4d8",
        }}
        onClick={onTogglePreview}
      >
        {preview ? "✎ Edit" : "👁 Preview"}
      </button>
    </div>
  );
}
