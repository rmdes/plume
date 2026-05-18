import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAndCacheServerConfig, CACHE_TTL_MS } from "./server-config";
import { AccountStore } from "../storage/accounts";
import { FakeBrowserStorage } from "../storage/browser-storage";
import type { TokenData } from "./types";

const token: TokenData = {
  me: "https://rmendes.net/",
  access_token: "tok",
  token_type: "Bearer",
  scope: "create",
  micropub_endpoint: "https://rmendes.net/micropub",
  token_endpoint: "https://rmendes.net/auth/token",
};

describe("fetchAndCacheServerConfig", () => {
  let store: FakeBrowserStorage;
  let accounts: AccountStore;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T14:30:00.000Z"));
    store = new FakeBrowserStorage();
    accounts = new AccountStore(store);
    await accounts.add(token);
  });
  afterEach(() => vi.useRealTimers());

  it("fetches config + post-types + categories, stores in account", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            "media-endpoint": "https://rmendes.net/media",
            "syndicate-to": [{ uid: "https://bsky.app", name: "Bluesky" }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            "post-types": [{ type: "note", name: "Note" }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ categories: ["indieweb"] })));
    const config = await fetchAndCacheServerConfig(accounts, "rmendes.net");
    expect(config["syndicate-to"]).toEqual([{ uid: "https://bsky.app", name: "Bluesky" }]);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    // Re-fetch within TTL — no network
    const cached = await fetchAndCacheServerConfig(accounts, "rmendes.net");
    expect(cached).toEqual(config);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("re-fetches after TTL expires", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({})));
    await fetchAndCacheServerConfig(accounts, "rmendes.net");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    vi.setSystemTime(new Date(Date.now() + CACHE_TTL_MS + 1000));
    await fetchAndCacheServerConfig(accounts, "rmendes.net");
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });
});
