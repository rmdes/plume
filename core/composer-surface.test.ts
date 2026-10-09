import { describe, expect, it } from "vitest";
import { isTouchOnlyDevice, shouldOpenComposerInTab, TOUCH_ONLY_QUERY } from "./composer-surface";

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

describe("isTouchOnlyDevice", () => {
  it("is true when the media query matches", () => {
    expect(isTouchOnlyDevice(true, "linux")).toBe(true);
  });

  it("is true on Android even when the popup host reports hover and a fine pointer", () => {
    // Vivaldi 8.2 for Android renders the popup in a frame whose media
    // features look like a desktop, which is how 1.7.3 missed the phone.
    expect(isTouchOnlyDevice(false, "android")).toBe(true);
  });

  it("is false on a desktop OS without a touch-only match", () => {
    expect(isTouchOnlyDevice(false, "win")).toBe(false);
    expect(isTouchOnlyDevice(false, "mac")).toBe(false);
    expect(isTouchOnlyDevice(false, undefined)).toBe(false);
  });
});
