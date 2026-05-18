import { describe, expect, it } from "vitest";
import { parseLinkHeaders } from "./discovery";

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
