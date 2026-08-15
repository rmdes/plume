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
    expect(sanitizeForLog({ nothing: "useful" })).toEqual({ message: "[object Object]" });
  });
});
