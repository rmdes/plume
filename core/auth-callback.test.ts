import { describe, expect, it } from "vitest";
import { CALLBACK_URL, isCallbackMessage, parseCallback } from "./auth-callback";

describe("auth callback", () => {
  it("derives the callback URL from the client id", () => {
    expect(CALLBACK_URL).toBe("https://rmdes.github.io/plume/callback.html");
  });

  it("parses a successful redirect", () => {
    expect(parseCallback("?code=abc&state=xyz")).toEqual({
      type: "indieauth-callback",
      code: "abc",
      state: "xyz",
    });
  });

  it("parses an error redirect", () => {
    expect(
      parseCallback("?error=access_denied&error_description=User%20said%20no&state=xyz"),
    ).toEqual({
      type: "indieauth-callback",
      state: "xyz",
      error: "access_denied",
      errorDescription: "User said no",
    });
  });

  it("recognises its own messages and nothing else", () => {
    expect(isCallbackMessage({ type: "indieauth-callback" })).toBe(true);
    expect(isCallbackMessage({ type: "something-else" })).toBe(false);
    expect(isCallbackMessage(null)).toBe(false);
    expect(isCallbackMessage("indieauth-callback")).toBe(false);
  });
});
