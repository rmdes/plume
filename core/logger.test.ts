import { describe, expect, it } from "vitest";
import { sanitizeForLog } from "./logger";

describe("sanitizeForLog", () => {
  it("keeps only the fields worth reporting", () => {
    const error = Object.assign(new Error("Token exchange failed"), {
      status: 401,
      method: "POST",
      url: "https://tokens.indieauth.com/token",
      headers: { Authorization: "Bearer super-secret-token" },
      config: { auth: "also-secret" },
    });

    const safe = sanitizeForLog(error);

    expect(safe).toEqual({
      name: "Error",
      message: "Token exchange failed",
      status: 401,
      method: "POST",
      url: "https://tokens.indieauth.com/token",
    });
    expect(JSON.stringify(safe)).not.toContain("super-secret-token");
    expect(JSON.stringify(safe)).not.toContain("also-secret");
  });

  it("redacts credentials carried in a URL", () => {
    const safe = sanitizeForLog(
      Object.assign(new Error("failed"), {
        url: "https://example.com/auth?code=abc123&state=xyz&client_id=https://plume",
      }),
    );

    expect(safe.url).toBe(
      "https://example.com/auth?code=%5Bredacted%5D&state=%5Bredacted%5D&client_id=https%3A%2F%2Fplume",
    );
    expect(safe.url).not.toContain("abc123");
    expect(safe.url).not.toContain("xyz");
  });

  it("redacts credentials appearing inside a message", () => {
    const safe = sanitizeForLog("https://example.com/cb?access_token=leaked-token");
    expect(JSON.stringify(safe)).not.toContain("leaked-token");
  });

  it("handles values that are not errors", () => {
    expect(sanitizeForLog("plain string")).toEqual({ message: "plain string" });
    expect(sanitizeForLog(undefined)).toEqual({ message: "undefined" });
    expect(sanitizeForLog(null)).toEqual({ message: "null" });
    // A plain object keeps its keys — see the context tests below. Only
    // values with nothing recordable at all fall back to a string.
    expect(sanitizeForLog({})).toEqual({ message: "[object Object]" });
  });
});

describe("sanitizeForLog with context we attached ourselves", () => {
  it("keeps the keys of a plain context object", () => {
    // Regression: whitelisting error fields threw the whole object away and
    // recorded `{"message":"[object Object]"}`, which is the one thing a log
    // entry must not do — the context is why the entry is worth reading.
    expect(sanitizeForLog({ domain: "rmendes.net", popout: false })).toEqual({
      domain: "rmendes.net",
      popout: false,
    });

    expect(sanitizeForLog({ domain: "rmendes.net", syndicateTo: 0 })).toEqual({
      domain: "rmendes.net",
      syndicateTo: 0,
    });
  });

  it("still redacts credentials inside context values", () => {
    const safe = sanitizeForLog({ url: "https://example.com/cb?code=leaked&x=1" });
    expect(JSON.stringify(safe)).not.toContain("leaked");
  });

  it("summarises arrays and drops nested objects", () => {
    expect(sanitizeForLog({ tags: ["a", "b", "c"], nested: { deep: 1 } })).toEqual({
      tags: "[3 items]",
    });
  });

  it("still prefers error fields when the value is a thrown error", () => {
    const safe = sanitizeForLog(Object.assign(new Error("boom"), { status: 500, extra: "x" }));
    expect(safe).toEqual({ name: "Error", message: "boom", status: 500 });
  });
});
