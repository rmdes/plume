import { describe, expect, it } from "vitest";
import { buildPrefillFromContextInfo, MENU_ITEMS } from "./context-menus";

describe("MENU_ITEMS", () => {
  it("registers all 7 capture entry points (3 page + 2 link + 1 selection + 1 image)", () => {
    const ids = MENU_ITEMS.map((m) => m.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "plume-bookmark-page",
        "plume-reply-page",
        "plume-like-page",
        "plume-bookmark-link",
        "plume-reply-link",
        "plume-quote-selection",
        "plume-post-image",
      ]),
    );
  });
});

describe("buildPrefillFromContextInfo", () => {
  it("bookmark-page sets bookmarkOf to pageUrl and name to tab.title", () => {
    const prefill = buildPrefillFromContextInfo(
      { menuItemId: "plume-bookmark-page", pageUrl: "https://example.com/article" },
      { title: "Example Article" },
    );
    expect(prefill).toEqual({
      type: "bookmark",
      bookmarkOf: "https://example.com/article",
      name: "Example Article",
      content: "",
    });
  });

  it("reply-page sets inReplyTo to pageUrl", () => {
    const prefill = buildPrefillFromContextInfo(
      { menuItemId: "plume-reply-page", pageUrl: "https://example.com/" },
      { title: "X" },
    );
    expect(prefill?.type).toBe("reply");
    expect(prefill?.inReplyTo).toBe("https://example.com/");
  });

  it("like-page sets likeOf and clears content (likes have no commentary)", () => {
    const prefill = buildPrefillFromContextInfo(
      { menuItemId: "plume-like-page", pageUrl: "https://x.com/" },
      { title: "X" },
    );
    expect(prefill?.likeOf).toBe("https://x.com/");
  });

  it("bookmark-link prefers linkUrl over pageUrl", () => {
    const prefill = buildPrefillFromContextInfo(
      {
        menuItemId: "plume-bookmark-link",
        pageUrl: "https://reader.example/",
        linkUrl: "https://target.example/post",
      },
      { title: "Reader" },
    );
    expect(prefill?.bookmarkOf).toBe("https://target.example/post");
  });

  it("quote-selection builds Markdown blockquote with citation", () => {
    const prefill = buildPrefillFromContextInfo(
      {
        menuItemId: "plume-quote-selection",
        pageUrl: "https://source.example/post",
        selectionText: "first line\nsecond line",
      },
      { title: "Source Post Title" },
    );
    expect(prefill?.type).toBe("quote");
    expect(prefill?.inReplyTo).toBe("https://source.example/post");
    expect(prefill?.content).toBe(
      "> first line\n> second line\n\n— [Source Post Title](https://source.example/post)",
    );
  });

  it("post-image sets _pending_media_fetch with srcUrl", () => {
    const prefill = buildPrefillFromContextInfo(
      {
        menuItemId: "plume-post-image",
        srcUrl: "https://cdn.example/photo.jpg",
        pageUrl: "https://example.com/article",
      },
      { title: "X" },
    );
    expect(prefill?.type).toBe("photo");
    expect((prefill as unknown as Record<string, unknown>)._pending_media_fetch).toBe(
      "https://cdn.example/photo.jpg",
    );
  });

  it("returns null for unknown menuItemId", () => {
    expect(buildPrefillFromContextInfo({ menuItemId: "unknown" }, { title: "x" })).toBeNull();
  });
});
