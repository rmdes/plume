import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AuthLauncher, exchangeCode, refreshToken, startAuth } from "./indieauth";
import type { Endpoints, TokenData } from "./types";

const CLIENT_ID = "https://rmdes.github.io/plume/";
const REDIRECT_URI = "https://abc123.chromiumapp.org/";

describe("exchangeCode", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("POSTs code + verifier and returns TokenData", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          me: "https://rmendes.net/",
          access_token: "tok123",
          scope: "create update delete media",
          expires_in: 3600,
          refresh_token: "refresh123",
        }),
      ),
    );
    const endpoints: Endpoints = {
      micropub: "https://rmendes.net/micropub",
      media_endpoint: "https://rmendes.net/media",
      token_endpoint: "https://rmendes.net/auth/token",
      authorization_endpoint: "https://rmendes.net/auth",
    };
    const token = await exchangeCode({
      code: "AUTHCODE",
      verifier: "VERIFIER",
      redirectUri: REDIRECT_URI,
      clientId: CLIENT_ID,
      endpoints,
    });
    expect(token.access_token).toBe("tok123");
    expect(token.me).toBe("https://rmendes.net/");
    expect(token.refresh_token).toBe("refresh123");
    expect(token.expires_at).toBeDefined();
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("no fetch call recorded");
    const body = (call[1] as RequestInit).body as string;
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=AUTHCODE");
    expect(body).toContain("code_verifier=VERIFIER");
  });

  it("throws when token endpoint returns error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );
    await expect(
      exchangeCode({
        code: "x",
        verifier: "v",
        redirectUri: REDIRECT_URI,
        clientId: CLIENT_ID,
        endpoints: {
          micropub: "m",
          token_endpoint: "https://example.com/token",
        } as Endpoints,
      }),
    ).rejects.toThrow(/invalid_grant/);
  });
});

describe("startAuth", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls launcher with built authorization URL and exchanges resulting code", async () => {
    const html =
      "<html><head>" +
      '<link rel="micropub" href="https://rmendes.net/micropub">' +
      '<link rel="authorization_endpoint" href="https://rmendes.net/auth">' +
      '<link rel="token_endpoint" href="https://rmendes.net/auth/token">' +
      "</head></html>";
    const tokenResponse = JSON.stringify({
      me: "https://rmendes.net/",
      access_token: "tok",
      scope: "create",
      expires_in: 3600,
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(html, { headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response(tokenResponse));

    const launcher: AuthLauncher = vi.fn(async (authUrl) => {
      const url = new URL(authUrl);
      const state = url.searchParams.get("state");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("me")).toBe("https://rmendes.net/");
      return `${REDIRECT_URI}?code=AUTH123&state=${state}`;
    });

    const token = await startAuth({
      siteUrl: "https://rmendes.net/",
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scope: "create update delete media",
      launcher,
    });

    expect(launcher).toHaveBeenCalledTimes(1);
    expect(token.access_token).toBe("tok");
  });

  it("throws when launcher returns mismatched state", async () => {
    const html =
      "<html><head>" +
      '<link rel="micropub" href="https://x/mp">' +
      '<link rel="authorization_endpoint" href="https://x/auth">' +
      '<link rel="token_endpoint" href="https://x/auth/token">' +
      "</head></html>";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(html, { headers: { "Content-Type": "text/html" } }),
    );
    const launcher: AuthLauncher = async () => `${REDIRECT_URI}?code=AUTH&state=WRONG_STATE`;

    await expect(
      startAuth({
        siteUrl: "https://x/",
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        scope: "create",
        launcher,
      }),
    ).rejects.toThrow(/State mismatch/);
  });
});

describe("refreshToken", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts refresh_token grant and returns updated TokenData", async () => {
    const existing: TokenData = {
      me: "https://rmendes.net/",
      access_token: "old",
      token_type: "Bearer",
      scope: "create",
      refresh_token: "refresh-abc",
      micropub_endpoint: "https://rmendes.net/micropub",
      token_endpoint: "https://rmendes.net/auth/token",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "new", expires_in: 3600 })),
    );
    const updated = await refreshToken(existing, CLIENT_ID);
    expect(updated.access_token).toBe("new");
    expect(updated.refresh_token).toBe("refresh-abc"); // preserved
  });

  it("throws when no refresh_token available", async () => {
    const existing: TokenData = {
      me: "https://rmendes.net/",
      access_token: "old",
      token_type: "Bearer",
      scope: "create",
      micropub_endpoint: "x",
      token_endpoint: "x",
    };
    await expect(refreshToken(existing, CLIENT_ID)).rejects.toThrow(/No refresh token/);
  });
});
