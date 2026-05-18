import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenData } from "../core/types";
import { AccountStore } from "./accounts";
import { FakeBrowserStorage } from "./browser-storage";

const fakeToken = (me: string): TokenData => ({
  me,
  access_token: `tok-${me}`,
  token_type: "Bearer",
  scope: "create update delete media",
  micropub_endpoint: `${me}micropub`,
  media_endpoint: `${me}media`,
  token_endpoint: `${me}auth/token`,
  authorization_endpoint: `${me}auth`,
});

describe("AccountStore", () => {
  let store: AccountStore;
  beforeEach(() => {
    store = new AccountStore(new FakeBrowserStorage());
  });

  it("list returns empty when no accounts", async () => {
    expect(await store.list()).toEqual([]);
  });

  it("add stores account and returns the saved token", async () => {
    const token = fakeToken("https://rmendes.net/");
    await store.add(token);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.me).toBe("https://rmendes.net/");
  });

  it("add sets first account as default", async () => {
    await store.add(fakeToken("https://rmendes.net/"));
    expect(await store.getDefaultDomain()).toBe("rmendes.net");
  });

  it("adding second account does not change default", async () => {
    await store.add(fakeToken("https://rmendes.net/"));
    await store.add(fakeToken("https://staging.example.com/"));
    expect(await store.getDefaultDomain()).toBe("rmendes.net");
  });

  it("setDefault changes the active account", async () => {
    await store.add(fakeToken("https://rmendes.net/"));
    await store.add(fakeToken("https://staging.example.com/"));
    await store.setDefault("staging.example.com");
    expect(await store.getDefaultDomain()).toBe("staging.example.com");
  });

  it("setDefault throws when account does not exist", async () => {
    await expect(store.setDefault("nope.example.com")).rejects.toThrow(/not found/);
  });

  it("remove deletes account and clears default if it was active", async () => {
    await store.add(fakeToken("https://rmendes.net/"));
    await store.add(fakeToken("https://staging.example.com/"));
    await store.remove("rmendes.net");
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(await store.getDefaultDomain()).toBe("staging.example.com");
  });

  it("remove leaves default null when last account removed", async () => {
    await store.add(fakeToken("https://rmendes.net/"));
    await store.remove("rmendes.net");
    expect(await store.getDefaultDomain()).toBeNull();
  });

  it("getActive returns the default account's token", async () => {
    const token = fakeToken("https://rmendes.net/");
    await store.add(token);
    const active = await store.getActive();
    expect(active?.me).toBe("https://rmendes.net/");
  });

  it("getActive returns null when no default", async () => {
    expect(await store.getActive()).toBeNull();
  });

  it("get(domain) returns specific account", async () => {
    await store.add(fakeToken("https://rmendes.net/"));
    const acct = await store.get("rmendes.net");
    expect(acct?.me).toBe("https://rmendes.net/");
  });
});

describe("AccountStore.getActiveRefreshed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T14:30:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns token as-is when not near expiry", async () => {
    const s = new AccountStore(new FakeBrowserStorage());
    const token = {
      ...fakeToken("https://rmendes.net/"),
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
    await s.add(token);
    const refreshFn = vi.fn();
    const active = await s.getActiveRefreshed(refreshFn);
    expect(active?.access_token).toBe(token.access_token);
    expect(refreshFn).not.toHaveBeenCalled();
  });

  it("calls refresher and stores updated token when near expiry", async () => {
    const s = new AccountStore(new FakeBrowserStorage());
    const expired = {
      ...fakeToken("https://rmendes.net/"),
      expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token: "refresh-abc",
    };
    await s.add(expired);
    const refreshFn = vi.fn().mockResolvedValue({
      ...expired,
      access_token: "new-token",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    const active = await s.getActiveRefreshed(refreshFn);
    expect(active?.access_token).toBe("new-token");
    expect(refreshFn).toHaveBeenCalledOnce();
    const reread = await s.get("rmendes.net");
    expect(reread?.access_token).toBe("new-token");
  });
});
