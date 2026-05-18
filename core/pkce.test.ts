import { describe, expect, it } from "vitest";
import { base64urlEncode, generatePKCE } from "./pkce";

describe("base64urlEncode", () => {
  it("encodes bytes with URL-safe alphabet and no padding", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const out = base64urlEncode(bytes);
    expect(out).not.toContain("+");
    expect(out).not.toContain("/");
    expect(out).not.toContain("=");
  });
});

describe("generatePKCE", () => {
  it("returns verifier and challenge", async () => {
    const { verifier, challenge } = await generatePKCE();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(challenge).not.toBe(verifier);
  });

  it("different calls produce different verifiers", async () => {
    const a = await generatePKCE();
    const b = await generatePKCE();
    expect(a.verifier).not.toBe(b.verifier);
  });

  it("challenge is SHA-256 of verifier, base64url-encoded", async () => {
    const { verifier, challenge } = await generatePKCE();
    const expected = base64urlEncode(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
    );
    expect(challenge).toBe(expected);
  });
});
