import { useEffect, useRef, useState } from "preact/hooks";
import { renderMarkdown } from "../core/markdown";

interface Props {
  source: string;
  /** Sets min-height so the preview pane doesn't collapse when empty. */
  minHeight?: number;
}

/**
 * Read-only rendered Markdown pane. Shown by the composer when the
 * "👁 Preview" toggle is active. `renderMarkdown` is async (lazy-loads
 * snarkdown + DOMPurify on first call) so we hold the result in state
 * and re-render after each parse. Subsequent calls hit the cached
 * renderer and resolve in the same microtask.
 */
export function MarkdownPreview({ source, minHeight = 120 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");

  useEffect(() => {
    let cancelled = false;
    void renderMarkdown(source).then((rendered) => {
      if (!cancelled) setHtml(rendered);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // DOMPurify-sanitized HTML is inserted via direct ref assignment
  // instead of dangerouslySetInnerHTML — keeps Preact uninvolved in
  // the rendered subtree (we're treating it as opaque content).
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = html;
    }
  }, [html]);

  if (!html) {
    return (
      <div
        style={{
          padding: 12,
          fontSize: 13,
          color: "#999",
          fontStyle: "italic",
          border: "1px solid #e5e5e5",
          borderRadius: 4,
          minHeight,
          boxSizing: "border-box",
        }}
      >
        {source.trim() ? "Rendering…" : "Preview empty — type something with Markdown."}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      aria-label="Rendered Markdown preview"
      style={{
        padding: 12,
        fontSize: 14,
        fontFamily: "Lora, Georgia, serif",
        lineHeight: 1.5,
        border: "1px solid #e5e5e5",
        borderRadius: 4,
        background: "#fafafa",
        minHeight,
        boxSizing: "border-box",
        overflow: "auto",
      }}
    />
  );
}
