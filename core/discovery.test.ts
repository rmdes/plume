import { describe, expect, it } from "vitest";
import { parseHtmlLinks, parseLinkHeaders } from "./discovery";

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
