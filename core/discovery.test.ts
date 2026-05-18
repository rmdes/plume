import { beforeEach, describe, expect, it, vi } from "vitest";
import { discoverEndpoints, parseHtmlLinks, parseLinkHeaders } from "./discovery";

describe("parseLinkHeaders", () => {
  it("returns empty object for null input", () => {
    expect(parseLinkHeaders(null)).toEqual({});
  });

  it("parses single link header", () => {
    const header = '<https://example.com/micropub>; rel="micropub"';
    expect(parseLinkHeaders(header)).toEqual({ micropub: "https://example.com/micropub" });
  });

  it("parses multiple link headers", () => {
    const header =
      '<https://example.com/micropub>; rel="micropub", ' +
      '<https://example.com/auth>; rel="authorization_endpoint"';
    expect(parseLinkHeaders(header)).toEqual({
      micropub: "https://example.com/micropub",
      authorization_endpoint: "https://example.com/auth",
    });
  });
});

describe("parseHtmlLinks", () => {
  it("returns empty object when no link tags present", () => {
    const html = "<html><head></head><body></body></html>";
    expect(parseHtmlLinks(html)).toEqual({});
  });

  it("parses link tags into rel-to-href map", () => {
    const html =
      "<html><head>" +
      '<link rel="micropub" href="https://example.com/micropub">' +
      '<link rel="authorization_endpoint" href="https://example.com/auth">' +
      '<link rel="token_endpoint" href="https://example.com/auth/token">' +
      "</head></html>";
    expect(parseHtmlLinks(html)).toEqual({
      micropub: "https://example.com/micropub",
      authorization_endpoint: "https://example.com/auth",
      token_endpoint: "https://example.com/auth/token",
    });
  });

  it("handles href before rel attribute order", () => {
    const html = '<html><head><link href="https://example.com/mp" rel="micropub"></head></html>';
    expect(parseHtmlLinks(html)).toEqual({ micropub: "https://example.com/mp" });
  });
});

describe("discoverEndpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns endpoints from HTML link tags", async () => {
    const html =
      "<html><head>" +
      '<link rel="micropub" href="https://example.com/micropub">' +
      '<link rel="authorization_endpoint" href="https://example.com/auth">' +
      '<link rel="token_endpoint" href="https://example.com/auth/token">' +
      "</head></html>";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(html, { headers: { "Content-Type": "text/html" } }),
    );
    const endpoints = await discoverEndpoints("https://example.com/");
    expect(endpoints.micropub).toBe("https://example.com/micropub");
    expect(endpoints.authorization_endpoint).toBe("https://example.com/auth");
    expect(endpoints.token_endpoint).toBe("https://example.com/auth/token");
  });

  it("HTTP Link header overrides HTML link tag", async () => {
    const html = '<html><head><link rel="micropub" href="https://wrong.com/mp"></head></html>';
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(html, {
        headers: {
          "Content-Type": "text/html",
          Link: '<https://right.com/mp>; rel="micropub"',
        },
      }),
    );
    const endpoints = await discoverEndpoints("https://example.com/");
    expect(endpoints.micropub).toBe("https://right.com/mp");
  });

  it("fetches indieauth-metadata when discovered", async () => {
    const html =
      '<html><head><link rel="micropub" href="https://example.com/mp">' +
      '<link rel="indieauth-metadata" href="https://example.com/.well-known/oauth-authorization-server">' +
      "</head></html>";
    const metadata = {
      authorization_endpoint: "https://example.com/auth",
      token_endpoint: "https://example.com/auth/token",
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(html, { headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(metadata)));
    const endpoints = await discoverEndpoints("https://example.com/");
    expect(endpoints.authorization_endpoint).toBe("https://example.com/auth");
    expect(endpoints.token_endpoint).toBe("https://example.com/auth/token");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws when no micropub endpoint found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><head></head></html>", { headers: { "Content-Type": "text/html" } }),
    );
    await expect(discoverEndpoints("https://example.com/")).rejects.toThrow(
      /Could not find micropub endpoint/,
    );
  });
});
