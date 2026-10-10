import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { AccountStore } from "../storage/accounts";
import { FakeBrowserStorage } from "../storage/browser-storage";
import { PendingAuthStore } from "../storage/pending-auth";
import { completeTabAuth, type TabAuthDeps } from "./tab-auth";

const record = {
  state: "st",
  verifier: "ver",
  siteUrl: "https://rmendes.net/",
  endpoints: {
    micropub: "https://rmendes.net/micropub",
    token_endpoint: "https://rmendes.net/auth/token",
    authorization_endpoint: "https://rmendes.net/auth",
  },
  redirectUri: "https://rmdes.github.io/plume/callback.html",
  clientId: "https://rmdes.github.io/plume/",
};

function tokenResponse() {
  return new Response(
    JSON.stringify({
      me: "https://rmendes.net/",
      access_token: "tok",
      scope: "create",
      expires_in: 3600,
    }),
  );
}

describe("completeTabAuth", () => {
  let session: FakeBrowserStorage;
  let local: FakeBrowserStorage;
  let pending: PendingAuthStore;
  let accounts: AccountStore;
  let fetchConfig: Mock<TabAuthDeps["fetchConfig"]>;

  beforeEach(() => {
    vi.restoreAllMocks();
    session = new FakeBrowserStorage();
    local = new FakeBrowserStorage();
    pending = new PendingAuthStore(session);
    accounts = new AccountStore(local);
    fetchConfig = vi.fn<TabAuthDeps["fetchConfig"]>().mockResolvedValue({});
  });

  it("exchanges the code, stores the account, fetches config, and replies with the domain", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(tokenResponse());
    await pending.put(record);

    const reply = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "st" },
      { pending, accounts, fetchConfig },
    );

    expect(reply).toEqual({ ok: true, domain: "rmendes.net" });
    expect((await accounts.get("rmendes.net"))?.access_token).toBe("tok");
    expect(fetchConfig).toHaveBeenCalledWith(accounts, "rmendes.net");
    const body = (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string;
    expect(body).toContain("code=CODE");
    expect(body).toContain("code_verifier=ver");
    expect(await session.get("authResult:st")).toMatchObject({
      ok: true,
      domain: "rmendes.net",
    });
  });

  it("refuses an unknown state without touching the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const reply = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "unknown" },
      { pending, accounts, fetchConfig },
    );
    expect(reply.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await session.get("authResult:unknown")).toMatchObject({ ok: false });
  });

  it("refuses a message with no state", async () => {
    const reply = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE" },
      { pending, accounts, fetchConfig },
    );
    expect(reply.ok).toBe(false);
  });

  it("replies ok: false and records the outcome when code and error are both missing", async () => {
    await pending.put(record);
    const reply = await completeTabAuth(
      { type: "indieauth-callback", state: "st" },
      { pending, accounts, fetchConfig },
    );
    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.error).toMatch(/missing code/i);
    expect(await session.get("authResult:st")).toMatchObject({ ok: false });
  });

  it("refuses the same code a second time", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(tokenResponse());
    await pending.put(record);
    const first = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "st" },
      { pending, accounts, fetchConfig },
    );
    const second = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "st" },
      { pending, accounts, fetchConfig },
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it("exchanges the code exactly once when two callbacks race for the same state", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(tokenResponse());
    await pending.put(record);
    const [first, second] = await Promise.all([
      completeTabAuth(
        { type: "indieauth-callback", code: "CODE", state: "st" },
        { pending, accounts, fetchConfig },
      ),
      completeTabAuth(
        { type: "indieauth-callback", code: "CODE", state: "st" },
        { pending, accounts, fetchConfig },
      ),
    ]);
    const results = [first, second];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server's error and records it for the dialog", async () => {
    await pending.put(record);
    const reply = await completeTabAuth(
      {
        type: "indieauth-callback",
        state: "st",
        error: "access_denied",
        errorDescription: "You said no",
      },
      { pending, accounts, fetchConfig },
    );
    expect(reply).toEqual({ ok: false, error: "You said no" });
    expect(await session.get("authResult:st")).toMatchObject({ ok: false, error: "You said no" });
    expect(await session.get("pendingAuth:st")).toBeUndefined();
  });

  it("reports a failed exchange and records it for the dialog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );
    await pending.put(record);
    const reply = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "st" },
      { pending, accounts, fetchConfig },
    );
    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.error).toMatch(/invalid_grant/);
    expect(await session.get("authResult:st")).toMatchObject({ ok: false });
    expect(await accounts.get("rmendes.net")).toBeUndefined();
  });

  it("still succeeds when the config fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(tokenResponse());
    fetchConfig.mockRejectedValue(new Error("config down"));
    await pending.put(record);
    const reply = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "st" },
      { pending, accounts, fetchConfig },
    );
    expect(reply).toEqual({ ok: true, domain: "rmendes.net" });
  });
});
