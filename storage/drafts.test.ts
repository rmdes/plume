import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBrowserStorage } from "./browser-storage";
import { type Draft, draftScope, DraftStore } from "./drafts";

describe("DraftStore", () => {
  let store: DraftStore;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T14:30:00.000Z"));
    store = new DraftStore(new FakeBrowserStorage());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("save + load round-trips a draft", async () => {
    const draft: Draft = { type: "note", content: "hello" };
    await store.save("rmendes.net", "general", draft);
    const loaded = await store.load("rmendes.net", "general");
    expect(loaded?.content).toBe("hello");
    expect(loaded?.savedAt).toBe("2026-05-17T14:30:00.000Z");
  });

  it("save overwrites existing draft for same key", async () => {
    await store.save("rmendes.net", "general", { type: "note", content: "v1" });
    await store.save("rmendes.net", "general", { type: "note", content: "v2" });
    const loaded = await store.load("rmendes.net", "general");
    expect(loaded?.content).toBe("v2");
  });

  it("different scopes get different drafts", async () => {
    await store.save("rmendes.net", "general", { type: "note", content: "a" });
    await store.save("rmendes.net", "https://example.com/post", {
      type: "bookmark",
      bookmarkOf: "https://example.com/post",
      content: "b",
    });
    expect((await store.load("rmendes.net", "general"))?.content).toBe("a");
    expect((await store.load("rmendes.net", "https://example.com/post"))?.content).toBe("b");
  });

  it("load returns undefined when no draft for key", async () => {
    expect(await store.load("rmendes.net", "general")).toBeUndefined();
  });

  it("remove deletes a single draft", async () => {
    await store.save("rmendes.net", "general", { type: "note", content: "x" });
    await store.remove("rmendes.net", "general");
    expect(await store.load("rmendes.net", "general")).toBeUndefined();
  });

  it("purgeExpired removes drafts older than 7 days", async () => {
    await store.save("rmendes.net", "old", { type: "note", content: "stale" });
    vi.setSystemTime(new Date("2026-05-25T14:30:00.000Z")); // 8 days later
    await store.save("rmendes.net", "fresh", { type: "note", content: "new" });
    await store.purgeExpired();
    expect(await store.load("rmendes.net", "old")).toBeUndefined();
    const fresh = await store.load("rmendes.net", "fresh");
    expect(fresh?.content).toBe("new");
  });

  it("list returns all drafts with their keys", async () => {
    await store.save("rmendes.net", "general", { type: "note", content: "a" });
    await store.save("rmendes.net", "https://x.com/", { type: "bookmark", content: "b" });
    const all = await store.list();
    expect(all).toHaveLength(2);
    const keys = all.map((entry) => entry.key);
    expect(keys).toContain("rmendes.net::general");
    expect(keys).toContain("rmendes.net::https://x.com/");
  });

  it("list splits each key back into its domain and scope", async () => {
    await store.save("rmendes.net", "https://x.com/a", { content: "b" });
    const [entry] = await store.list();
    expect(entry?.domain).toBe("rmendes.net");
    // Split on the FIRST separator only: a scope is a URL and may itself
    // contain "::" (an IPv6 host, a query string), which a naive
    // split("::", 2) would silently truncate — losing the draft.
    expect(entry?.scope).toBe("https://x.com/a");
  });

  it("round-trips a scope containing the separator", async () => {
    await store.save("rmendes.net", "http://[::1]/post", { content: "b" });
    const [entry] = await store.list();
    expect(entry?.scope).toBe("http://[::1]/post");
    await store.remove(entry?.domain ?? "", entry?.scope ?? "");
    expect(await store.list()).toHaveLength(0);
  });

  it("removes a draft saved under an empty scope", async () => {
    // Drafts written before the scope fix landed are keyed "domain::" — the
    // options list must still be able to delete them.
    await store.save("rmendes.net", "", { content: "orphan" });
    const [entry] = await store.list();
    expect(entry?.key).toBe("rmendes.net::");
    expect(entry?.domain).toBe("rmendes.net");
    expect(entry?.scope).toBe("");
    await store.remove(entry?.domain ?? "", entry?.scope ?? "");
    expect(await store.list()).toHaveLength(0);
  });
});

describe("draftScope", () => {
  it("falls back to 'general' when no target URL is set", () => {
    expect(draftScope({})).toBe("general");
  });

  it("treats an empty target URL as absent", () => {
    // Composer patches `bookmarkOf: ""` whenever the post type is a target
    // type and the URL field is blank. `??` let that "" through as the scope,
    // filing the draft under "domain::" where neither the popup's restore nor
    // the options list's delete button could find it.
    expect(draftScope({ bookmarkOf: "" })).toBe("general");
    expect(draftScope({ bookmarkOf: "", inReplyTo: "", likeOf: "", repostOf: "" })).toBe("general");
  });

  it("uses whichever target URL is set", () => {
    expect(draftScope({ bookmarkOf: "https://x.com/a" })).toBe("https://x.com/a");
    expect(draftScope({ bookmarkOf: "", inReplyTo: "https://x.com/b" })).toBe("https://x.com/b");
    expect(draftScope({ likeOf: "https://x.com/c" })).toBe("https://x.com/c");
    expect(draftScope({ repostOf: "https://x.com/d" })).toBe("https://x.com/d");
  });
});
