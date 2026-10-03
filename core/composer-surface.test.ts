import { describe, expect, it } from "vitest";
import { shouldOpenComposerInTab, TOUCH_ONLY_QUERY } from "./composer-surface";

describe("shouldOpenComposerInTab", () => {
  it("follows the device when there is no preference", () => {
    expect(shouldOpenComposerInTab(undefined, true)).toBe(true);
    expect(shouldOpenComposerInTab(undefined, false)).toBe(false);
  });

  it("an explicit preference wins over the device", () => {
    expect(shouldOpenComposerInTab(true, false)).toBe(true);
    expect(shouldOpenComposerInTab(true, true)).toBe(true);
    expect(shouldOpenComposerInTab(false, true)).toBe(false);
    expect(shouldOpenComposerInTab(false, false)).toBe(false);
  });

  it("matches touch-only devices, not touch screens with a mouse", () => {
    expect(TOUCH_ONLY_QUERY).toBe("(hover: none) and (pointer: coarse)");
  });
});
