import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPageTitle } from "./page-title";

describe("fetchPageTitle", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("extracts <title> contents", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><head><title>My Page</title></head></html>"),
    );
    expect(await fetchPageTitle("https://x.com/")).toBe("My Page");
  });

  it("returns empty string when no title tag", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html><head></head></html>"));
    expect(await fetchPageTitle("https://x.com/")).toBe("");
  });

  it("returns empty string on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    expect(await fetchPageTitle("https://x.com/")).toBe("");
  });

  it("returns empty string on timeout (abort)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new DOMException("aborted", "AbortError")), 50);
        }),
    );
    expect(await fetchPageTitle("https://x.com/", 10)).toBe("");
  });
});
