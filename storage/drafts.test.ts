import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBrowserStorage } from "./browser-storage";
import { type Draft, DraftStore } from "./drafts";

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
});
