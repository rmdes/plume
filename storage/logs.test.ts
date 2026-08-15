import { beforeEach, describe, expect, it } from "vitest";
import { FakeBrowserStorage } from "./browser-storage";
import { type LogEntry, LogStore } from "./logs";

const entry = (message: string): LogEntry => ({
  at: new Date().toISOString(),
  level: "error",
  context: "background",
  message,
});

describe("LogStore", () => {
  let store: LogStore;
  beforeEach(() => {
    store = new LogStore(new FakeBrowserStorage());
  });

  it("returns an empty list before anything is logged", async () => {
    expect(await store.list()).toEqual([]);
  });

  it("appends entries in order", async () => {
    await store.append(entry("first"));
    await store.append(entry("second"));

    expect((await store.list()).map((e) => e.message)).toEqual(["first", "second"]);
  });

  it("keeps only the most recent 100 entries", async () => {
    for (let i = 0; i < 130; i++) {
      await store.append(entry(`entry ${i}`));
    }

    const entries = await store.list();
    expect(entries).toHaveLength(100);
    // The oldest are dropped, not the newest — a truncation bug here would
    // leave the buffer full of the least useful entries.
    expect(entries[0]?.message).toBe("entry 30");
    expect(entries.at(-1)?.message).toBe("entry 129");
  });

  it("clears everything", async () => {
    await store.append(entry("first"));
    await store.clear();

    expect(await store.list()).toEqual([]);
  });
});
