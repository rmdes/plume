import { beforeEach, describe, expect, it } from "vitest";
import { FakeBrowserStorage } from "./browser-storage";
import {
  authResultKey,
  PENDING_AUTH_TTL_MS,
  PendingAuthStore,
  pendingAuthKey,
} from "./pending-auth";

const record = {
  state: "abc",
  verifier: "v",
  siteUrl: "https://rmendes.net/",
  endpoints: {
    micropub: "https://rmendes.net/micropub",
    token_endpoint: "https://rmendes.net/auth/token",
  },
  redirectUri: "https://rmdes.github.io/plume/callback.html",
  clientId: "https://rmdes.github.io/plume/",
};

describe("PendingAuthStore", () => {
  let storage: FakeBrowserStorage;
  let now: number;
  let store: PendingAuthStore;

  beforeEach(() => {
    storage = new FakeBrowserStorage();
    now = Date.parse("2026-09-29T10:00:00Z");
    store = new PendingAuthStore(storage, () => now);
  });

  it("take returns the record once and then nothing", async () => {
    await store.put(record);
    const taken = await store.take("abc");
    expect(taken?.verifier).toBe("v");
    expect(taken?.createdAt).toBe("2026-09-29T10:00:00.000Z");
    expect(await store.take("abc")).toBeUndefined();
    expect(await storage.get(pendingAuthKey("abc"))).toBeUndefined();
  });

  it("take treats an expired record as absent and deletes it", async () => {
    await store.put(record);
    now += PENDING_AUTH_TTL_MS + 1;
    expect(await store.take("abc")).toBeUndefined();
    expect(await storage.get(pendingAuthKey("abc"))).toBeUndefined();
  });

  it("take returns nothing for an unknown state", async () => {
    expect(await store.take("nope")).toBeUndefined();
  });

  it("take treats an unparsable createdAt as expired (fail closed)", async () => {
    await storage.set({
      [pendingAuthKey("bad")]: { ...record, state: "bad", createdAt: "not-a-date" },
    });
    expect(await store.take("bad")).toBeUndefined();
    expect(await storage.get(pendingAuthKey("bad"))).toBeUndefined();
  });

  it("setResult records the outcome under its own key", async () => {
    await store.setResult("abc", { ok: false, error: "denied" });
    expect(await storage.get(authResultKey("abc"))).toEqual({
      ok: false,
      error: "denied",
      at: "2026-09-29T10:00:00.000Z",
    });
  });
});
