import { beforeEach, describe, expect, it } from "vitest";
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
