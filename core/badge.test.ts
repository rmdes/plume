import { describe, it, expect } from "vitest";
import { computeBadgeState } from "./badge";

describe("computeBadgeState", () => {
  it("returns auth_needed when any queue item has auth_needed status", () => {
    expect(computeBadgeState({ hasAuthNeeded: true, queueCount: 0 })).toEqual({
      text: "!",
      color: "#dc2626",
    });
  });

  it("auth_needed wins over queue count", () => {
    expect(computeBadgeState({ hasAuthNeeded: true, queueCount: 5 })).toEqual({
      text: "!",
      color: "#dc2626",
    });
  });

  it("returns queue count as text when no auth_needed", () => {
    expect(computeBadgeState({ hasAuthNeeded: false, queueCount: 3 })).toEqual({
      text: "3",
      color: "#f59e0b",
    });
  });

  it("returns 9+ when queue exceeds 9", () => {
    expect(computeBadgeState({ hasAuthNeeded: false, queueCount: 12 })).toEqual({
      text: "9+",
      color: "#f59e0b",
    });
  });

  it("returns clear badge state when nothing", () => {
    expect(computeBadgeState({ hasAuthNeeded: false, queueCount: 0 })).toEqual({
      text: "",
      color: "#000000",
    });
  });
});
