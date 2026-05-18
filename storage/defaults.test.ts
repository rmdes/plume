import { beforeEach, describe, expect, it } from "vitest";
import { FakeBrowserStorage } from "./browser-storage";
import { DefaultsStore } from "./defaults";

describe("DefaultsStore", () => {
  let store: DefaultsStore;
  beforeEach(() => {
    store = new DefaultsStore(new FakeBrowserStorage());
  });

  it("get returns initial empty defaults when nothing saved", async () => {
    const d = await store.get();
    expect(d.activeAccount).toBeNull();
    expect(d.aiMetadata).toBeUndefined();
    expect(d.syndicateTo).toEqual([]);
  });

  it("setAiMetadata persists and merges into get()", async () => {
    await store.setAiMetadata({
      textLevel: "2",
      tools: "Claude",
      description: "Co-drafted with Claude Code",
    });
    const d = await store.get();
    expect(d.aiMetadata?.textLevel).toBe("2");
    expect(d.aiMetadata?.tools).toBe("Claude");
  });

  it("setSyndicateTo replaces the list", async () => {
    await store.setSyndicateTo(["https://bsky.app/profile/me"]);
    const d = await store.get();
    expect(d.syndicateTo).toEqual(["https://bsky.app/profile/me"]);
  });

  it("setActiveAccount writes through (shared key with AccountStore)", async () => {
    await store.setActiveAccount("rmendes.net");
    expect((await store.get()).activeAccount).toBe("rmendes.net");
  });
});
