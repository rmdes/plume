import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBrowserStorage } from "./browser-storage";
import { BACKOFF_SCHEDULE_MS, MAX_ATTEMPTS, QueueStore } from "./queue";

describe("QueueStore", () => {
  let store: QueueStore;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T14:30:00.000Z"));
    store = new QueueStore(new FakeBrowserStorage());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueue adds item with pending status and immediate nextAttempt", async () => {
    const id = await store.enqueue({
      account: "rmendes.net",
      payload: { content: "hi" },
    });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(id);
    expect(list[0]?.status).toBe("pending");
    expect(list[0]?.attempts).toEqual([]);
    expect(list[0]?.nextAttempt).toBe("2026-05-17T14:30:00.000Z");
  });

  it("dueNow returns only items with nextAttempt <= now", async () => {
    await store.enqueue({ account: "a", payload: { content: "1" } });
    vi.setSystemTime(new Date("2026-05-17T15:00:00.000Z"));
    await store.enqueue({ account: "a", payload: { content: "2" } });
    vi.setSystemTime(new Date("2026-05-17T14:45:00.000Z"));
    const due = await store.dueNow();
    expect(due).toHaveLength(1);
    expect((due[0]?.payload as { content: string }).content).toBe("1");
  });

  it("recordAttempt with retryable=true schedules next attempt per backoff schedule", async () => {
    const id = await store.enqueue({ account: "a", payload: { content: "x" } });
    await store.recordAttempt(id, { error: "503", retryable: true });
    const item = (await store.list())[0];
    if (!item) throw new Error("queue empty");
    expect(item.attempts).toHaveLength(1);
    expect(item.status).toBe("pending");
    const nextMs = new Date(item.nextAttempt).getTime() - Date.now();
    expect(nextMs).toBe(BACKOFF_SCHEDULE_MS[0]);
  });

  it("backoff schedule advances with each retry", async () => {
    const id = await store.enqueue({ account: "a", payload: { content: "x" } });
    for (let i = 0; i < BACKOFF_SCHEDULE_MS.length; i++) {
      await store.recordAttempt(id, { error: `5xx-${i}`, retryable: true });
    }
    const item = (await store.list())[0];
    if (!item) throw new Error("queue empty");
    expect(item.attempts).toHaveLength(BACKOFF_SCHEDULE_MS.length);
  });

  it("after MAX_ATTEMPTS, status becomes abandoned", async () => {
    const id = await store.enqueue({ account: "a", payload: { content: "x" } });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await store.recordAttempt(id, { error: "5xx", retryable: true });
    }
    const item = (await store.list())[0];
    if (!item) throw new Error("queue empty");
    expect(item.status).toBe("abandoned");
  });

  it("recordAttempt with authNeeded=true sets status auth_needed", async () => {
    const id = await store.enqueue({ account: "a", payload: { content: "x" } });
    await store.recordAttempt(id, { error: "401", authNeeded: true });
    const item = (await store.list())[0];
    if (!item) throw new Error("queue empty");
    expect(item.status).toBe("auth_needed");
  });

  it("remove deletes an item by id", async () => {
    const id = await store.enqueue({ account: "a", payload: { content: "x" } });
    await store.remove(id);
    expect(await store.list()).toEqual([]);
  });

  it("count returns the queue length", async () => {
    expect(await store.count()).toBe(0);
    await store.enqueue({ account: "a", payload: { content: "1" } });
    await store.enqueue({ account: "a", payload: { content: "2" } });
    expect(await store.count()).toBe(2);
  });

  it("hasAuthNeeded returns true if any item has auth_needed status", async () => {
    const id = await store.enqueue({ account: "a", payload: { content: "x" } });
    expect(await store.hasAuthNeeded()).toBe(false);
    await store.recordAttempt(id, { error: "401", authNeeded: true });
    expect(await store.hasAuthNeeded()).toBe(true);
  });
});
