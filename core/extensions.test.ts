import { describe, expect, it } from "vitest";
import { detectExtensions, KNOWN_EXTENSIONS } from "./extensions";

describe("detectExtensions", () => {
  it("returns empty array when the server advertises no post-types", () => {
    expect(detectExtensions({})).toEqual([]);
    expect(detectExtensions({ "post-types": [] })).toEqual([]);
  });

  it("returns empty array when post-types have no matching properties", () => {
    const config = {
      "post-types": [
        { properties: ["content", "name", "category"] },
        { properties: ["bookmark-of", "summary"] },
      ],
    };
    expect(detectExtensions(config)).toEqual([]);
  });

  it("detects ai-metadata when all required properties appear across post-types", () => {
    // Required (non-optional) keys for ai-metadata: ai-text-level, ai-tools,
    // ai-description. ai-code-level is optional and should not gate detection.
    const config = {
      "post-types": [
        {
          properties: ["content", "ai-text-level", "ai-tools", "ai-description"],
        },
      ],
    };
    expect(detectExtensions(config)).toEqual(["ai-metadata"]);
  });

  it("unions properties across multiple post-types", () => {
    // Each post type advertises a subset; together the union has all required.
    const config = {
      "post-types": [
        { properties: ["content", "ai-text-level"] },
        { properties: ["name", "ai-tools"] },
        { properties: ["category", "ai-description"] },
      ],
    };
    expect(detectExtensions(config)).toEqual(["ai-metadata"]);
  });

  it("does NOT detect when only a subset of required properties appear", () => {
    // ai-tools and ai-description are missing — should not detect.
    const config = {
      "post-types": [{ properties: ["content", "ai-text-level"] }],
    };
    expect(detectExtensions(config)).toEqual([]);
  });

  it("ignores optional properties when scoring detection", () => {
    // Only the optional ai-code-level is present — required ones are not.
    // Detection should NOT fire since required props are still missing.
    const config = {
      "post-types": [{ properties: ["content", "ai-code-level"] }],
    };
    expect(detectExtensions(config)).toEqual([]);
  });

  it("ignores post-types that have no properties[] field", () => {
    const config = { "post-types": [{}, {}] };
    expect(detectExtensions(config)).toEqual([]);
  });

  it("registry sanity: ai-metadata has known required + optional split", () => {
    // Guards against future registry edits silently breaking detection logic.
    const ai = KNOWN_EXTENSIONS["ai-metadata"];
    if (!ai) throw new Error("KNOWN_EXTENSIONS['ai-metadata'] not found");
    const required = ai.properties.filter((p) => !p.optional).map((p) => p.key);
    const optional = ai.properties.filter((p) => p.optional).map((p) => p.key);
    expect(required).toEqual(["ai-text-level", "ai-tools", "ai-description"]);
    expect(optional).toEqual(["ai-code-level"]);
  });
});
