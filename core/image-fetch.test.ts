import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchImageAsBlob } from "./image-fetch";

describe("fetchImageAsBlob", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns a Blob with the response content-type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("imgdata", { headers: { "Content-Type": "image/png" } }),
    );
    const blob = await fetchImageAsBlob("https://cdn.example/x.png");
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("throws CORS-classified error when fetch fails with TypeError", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchImageAsBlob("https://cdn.example/x.png")).rejects.toMatchObject({
      message: expect.stringMatching(/CORS/),
    });
  });

  it("throws when response is not OK", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    await expect(fetchImageAsBlob("https://cdn.example/x.png")).rejects.toThrow(/404/);
  });
});
