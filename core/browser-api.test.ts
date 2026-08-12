import { afterEach, describe, expect, it, vi } from "vitest";

type Globals = { browser?: unknown; chrome?: unknown };

async function loadModule(globals: Globals) {
  vi.resetModules();
  const g = globalThis as Globals;
  g.browser = globals.browser;
  g.chrome = globals.chrome;
  return await import("./browser-api");
}

async function loadWith(globals: Globals) {
  return (await loadModule(globals)).browser;
}

afterEach(() => {
  const g = globalThis as Globals;
  delete g.browser;
  delete g.chrome;
});

describe("browser-api namespace resolution", () => {
  it("prefers `browser` on Firefox, whose async methods return promises", async () => {
    // Firefox exposes both namespaces. `chrome` there is callback-only and
    // returns undefined, which is what made storage reads hang the popup, so
    // the promise-based `browser` namespace must win.
    const firefoxBrowser = { runtime: { id: "plume@rmdes.net" } };
    const firefoxChrome = { runtime: { id: "plume@rmdes.net" } };
    expect(await loadWith({ browser: firefoxBrowser, chrome: firefoxChrome })).toBe(firefoxBrowser);
  });

  it("falls back to `chrome` on Chrome, which has no `browser` global", async () => {
    const chromeNs = { runtime: { id: "hcphdjeoolimpjjekegpobkhoealiige" } };
    expect(await loadWith({ browser: undefined, chrome: chromeNs })).toBe(chromeNs);
  });

  it("ignores a `browser` global that is not a live extension namespace", async () => {
    // Some pages define an unrelated `browser` object; without the runtime.id
    // check we would bind to it and every API call would fail.
    const chromeNs = { runtime: { id: "hcphdjeoolimpjjekegpobkhoealiige" } };
    expect(await loadWith({ browser: { name: "not-an-extension-api" }, chrome: chromeNs })).toBe(
      chromeNs,
    );
  });
});

describe("toolbar action namespace", () => {
  it("uses `action` on MV3", async () => {
    const setBadgeText = () => {};
    const mod = await loadModule({
      chrome: { runtime: { id: "abc" }, action: { setBadgeText } },
    });
    expect(mod.action.setBadgeText).toBe(setBadgeText);
  });

  it("falls back to `browserAction` on the MV2 Firefox build", async () => {
    // MV3 renamed browserAction → action. The Firefox build is MV2 and has
    // only browserAction, so `action.*` calls threw there.
    const setBadgeText = () => {};
    const mod = await loadModule({
      browser: { runtime: { id: "plume@rmdes.net" }, browserAction: { setBadgeText } },
    });
    expect(mod.action.setBadgeText).toBe(setBadgeText);
  });

  it("does not throw on import when no extension globals exist", async () => {
    const mod = await loadModule({});
    expect(mod.action).toBeUndefined();
  });
});
