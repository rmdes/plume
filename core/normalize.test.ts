import { describe, expect, it } from "vitest";
import { normalizePropertyName, readProp } from "./normalize";

describe("normalizePropertyName", () => {
  it("converts mf2 dash form to camelCase", () => {
    expect(normalizePropertyName("bookmark-of")).toBe("bookmarkOf");
    expect(normalizePropertyName("in-reply-to")).toBe("inReplyTo");
    expect(normalizePropertyName("ai-text-level")).toBe("aiTextLevel");
  });

  it("leaves no-dash names unchanged", () => {
    expect(normalizePropertyName("content")).toBe("content");
    expect(normalizePropertyName("name")).toBe("name");
  });
});

describe("readProp", () => {
  it("reads dash form when present", () => {
    const source = { "bookmark-of": ["https://example.com/"] };
    expect(readProp(source, "bookmark-of")).toEqual(["https://example.com/"]);
  });

  it("falls back to camelCase form when dash form absent", () => {
    const source = { bookmarkOf: ["https://example.com/"] };
    expect(readProp(source, "bookmark-of")).toEqual(["https://example.com/"]);
  });

  it("returns undefined when neither form present", () => {
    const source = { content: ["hello"] };
    expect(readProp(source, "bookmark-of")).toBeUndefined();
  });
});
