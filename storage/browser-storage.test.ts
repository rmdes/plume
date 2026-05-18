import { beforeEach, describe, expect, it } from "vitest";
import { FakeBrowserStorage } from "./browser-storage";

describe("FakeBrowserStorage", () => {
  let storage: FakeBrowserStorage;
  beforeEach(() => {
    storage = new FakeBrowserStorage();
  });

  it("get returns undefined for missing key", async () => {
    expect(await storage.get("missing")).toBeUndefined();
  });

  it("set + get round-trips a value", async () => {
    await storage.set({ foo: "bar" });
    expect(await storage.get("foo")).toBe("bar");
  });

  it("get returns multiple keys when passed an array", async () => {
    await storage.set({ a: 1, b: 2, c: 3 });
    expect(await storage.get(["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("remove deletes a key", async () => {
    await storage.set({ foo: "bar" });
    await storage.remove("foo");
    expect(await storage.get("foo")).toBeUndefined();
  });

  it("clear empties storage", async () => {
    await storage.set({ a: 1, b: 2 });
    await storage.clear();
    expect(await storage.get("a")).toBeUndefined();
    expect(await storage.get("b")).toBeUndefined();
  });
});
