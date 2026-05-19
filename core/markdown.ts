/**
 * Parse Markdown to sanitized HTML for the composer preview pane.
 *
 * Snarkdown handles paragraphs, headings, bold/italic, links, lists,
 * code spans, blockquotes — the practical subset for Micropub notes.
 * DOMPurify strips any raw `<script>` / `<iframe>` / on*-handlers that
 * survive snarkdown's permissive raw-HTML passthrough, since the preview
 * renders inside the privileged extension popup.
 *
 * The renderer is lazy-loaded the first time it's called so that
 * users who never toggle Preview don't pay the ~30 kB DOMPurify weight
 * on every popup open. After the first call, subsequent renders are
 * synchronous from the cached modules.
 */
type Renderer = (source: string) => string;
let cachedRenderer: Renderer | null = null;

async function loadRenderer(): Promise<Renderer> {
  if (cachedRenderer) return cachedRenderer;
  const [{ default: snarkdown }, { default: DOMPurify }] = await Promise.all([
    import("snarkdown"),
    import("dompurify"),
  ]);
  cachedRenderer = (source: string) => DOMPurify.sanitize(snarkdown(source));
  return cachedRenderer;
}

export async function renderMarkdown(source: string): Promise<string> {
  if (!source.trim()) return "";
  const render = await loadRenderer();
  return render(source);
}

export interface MarkdownInsertion {
  /** New textarea value after the action. */
  value: string;
  /** New caret position (or selection start). */
  selectionStart: number;
  /** New selection end (== selectionStart for a collapsed caret). */
  selectionEnd: number;
}

/**
 * Wrap the current selection in `before` + `after`. If no selection,
 * inserts the wrapper around `placeholder` and selects the placeholder
 * so the next keystroke replaces it (familiar pattern from VS Code).
 */
export function wrapSelection(
  source: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder = "",
): MarkdownInsertion {
  const selected = source.slice(start, end);
  const inner = selected || placeholder;
  const value = source.slice(0, start) + before + inner + after + source.slice(end);
  return {
    value,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + inner.length,
  };
}

/**
 * Prefix every line touched by the selection with `prefix`. Used for
 * list / blockquote / heading actions where the syntax is line-leading,
 * not character-wrapping.
 *
 * Selection expands to include the start of the first line and the
 * end of the last selected line so users don't have to position the
 * caret at column 0 to get the expected result.
 */
export function prefixLines(
  source: string,
  start: number,
  end: number,
  prefix: string,
): MarkdownInsertion {
  // Snap selection to whole lines so the prefix lands on column 0 even
  // when the user selected mid-line.
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const lineEndIdx = source.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? source.length : lineEndIdx;

  const block = source.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const prefixed = lines.map((line) => prefix + line).join("\n");
  const value = source.slice(0, lineStart) + prefixed + source.slice(lineEnd);
  // Push the original selection rightward by the inserted prefix width
  // on each affected line.
  return {
    value,
    selectionStart: start + prefix.length,
    selectionEnd: end + prefix.length * lines.length,
  };
}

/** Same as prefixLines but numbers each line as an ordered list. */
export function numberedLines(source: string, start: number, end: number): MarkdownInsertion {
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const lineEndIdx = source.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? source.length : lineEndIdx;

  const block = source.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  let totalInsertedChars = 0;
  const prefixed = lines
    .map((line, i) => {
      const prefix = `${i + 1}. `;
      totalInsertedChars += prefix.length;
      return prefix + line;
    })
    .join("\n");
  const value = source.slice(0, lineStart) + prefixed + source.slice(lineEnd);
  return {
    value,
    selectionStart: start + 3, // "1. "
    selectionEnd: end + totalInsertedChars,
  };
}
