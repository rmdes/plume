import { describe, expect, it } from "vitest";
import { numberedLines, prefixLines, renderMarkdown, wrapSelection } from "./markdown";

describe("renderMarkdown", () => {
  it("returns empty string for empty/whitespace input", async () => {
    expect(await renderMarkdown("")).toBe("");
    expect(await renderMarkdown("   \n  ")).toBe("");
  });

  it("renders bold + italic + link", async () => {
    const html = await renderMarkdown("**bold** and *italic* and [link](https://example.com)");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain('href="https://example.com"');
  });

  it("strips raw <script> tags via DOMPurify", async () => {
    const html = await renderMarkdown("hi <script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(1)");
  });

  it("strips on* event handlers", async () => {
    const html = await renderMarkdown('<a href="x" onclick="alert(1)">click</a>');
    expect(html).not.toContain("onclick");
  });

  it("renders headings, lists, blockquotes, code", async () => {
    const html = await renderMarkdown("# Heading\n\n- one\n- two\n\n> quote\n\n`code`");
    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<li>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<code>");
  });
});

describe("wrapSelection", () => {
  it("wraps the selected substring with before + after", () => {
    const r = wrapSelection("hello world", 6, 11, "**", "**");
    expect(r.value).toBe("hello **world**");
    expect(r.selectionStart).toBe(8); // after the opening **
    expect(r.selectionEnd).toBe(13); // end of "world"
  });

  it("inserts placeholder when nothing is selected and selects it", () => {
    const r = wrapSelection("hello ", 6, 6, "*", "*", "italic");
    expect(r.value).toBe("hello *italic*");
    // Selection covers the placeholder so the next keystroke replaces it.
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("italic");
  });

  it("preserves text outside the selection", () => {
    const r = wrapSelection("abc def ghi", 4, 7, "_", "_");
    expect(r.value).toBe("abc _def_ ghi");
  });
});

describe("prefixLines", () => {
  it("adds prefix to each line touched by the selection", () => {
    // Selection 0..7 covers "one\ntwo" — the trailing \n marks line break,
    // not part of the next line. So "three" stays unprefixed.
    const r = prefixLines("one\ntwo\nthree", 0, 7, "- ");
    expect(r.value).toBe("- one\n- two\nthree");
  });

  it("snaps selection to whole lines (selection mid-line still prefixes the whole line)", () => {
    const r = prefixLines("hello world", 3, 8, "> ");
    expect(r.value).toBe("> hello world");
  });

  it("does NOT extend prefix to lines beyond the selection's end-of-line", () => {
    const r = prefixLines("alpha\nbeta\ngamma", 0, 5, "# ");
    // selection 0..5 covers "alpha". lineEnd = indexOf("\n", 5) = 5.
    expect(r.value).toBe("# alpha\nbeta\ngamma");
  });

  it("handles multi-line selection", () => {
    const r = prefixLines("alpha\nbeta\ngamma", 0, 10, "- ");
    // selection 0..10 covers "alpha\nbeta". lineEnd = indexOf("\n", 10) = 10.
    expect(r.value).toBe("- alpha\n- beta\ngamma");
  });
});

describe("numberedLines", () => {
  it("numbers each touched line starting at 1", () => {
    const r = numberedLines("alpha\nbeta\ngamma", 0, 16);
    expect(r.value).toBe("1. alpha\n2. beta\n3. gamma");
  });

  it("ignores lines beyond the selection's end-of-line", () => {
    const r = numberedLines("alpha\nbeta\ngamma", 0, 5);
    expect(r.value).toBe("1. alpha\nbeta\ngamma");
  });
});
