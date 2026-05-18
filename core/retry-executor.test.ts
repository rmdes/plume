import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "../storage/accounts";
import { FakeBrowserStorage } from "../storage/browser-storage";
import { QueueStore } from "../storage/queue";
import { type RetryDeps, runRetryTick } from "./retry-executor";
import type { TokenData } from "./types";

const token: TokenData = {
  me: "https://rmendes.net/",
  access_token: "tok",
  token_type: "Bearer",
  scope: "create",
  micropub_endpoint: "https://rmendes.net/micropub",
  token_endpoint: "https://rmendes.net/auth/token",
};

describe("runRetryTick", () => {
  let store: FakeBrowserStorage;
  let queue: QueueStore;
  let accounts: AccountStore;

  beforeEach(async () => {
    store = new FakeBrowserStorage();
    queue = new QueueStore(store);
    accounts = new AccountStore(store);
    await accounts.add(token);
  });

  it("removes item from queue on successful post", async () => {
    await queue.enqueue({ account: "rmendes.net", payload: { content: "hi" } });
    const deps: RetryDeps = {
      queue,
      accounts,
      post: vi.fn().mockResolvedValue({ location: "https://x", status: 201 }),
      notify: vi.fn(),
      refresher: vi.fn(),
    };
    await runRetryTick(deps);
    expect(await queue.count()).toBe(0);
    expect(deps.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "success" }));
  });

  it("records attempt + reschedules on retryable failure", async () => {
    await queue.enqueue({ account: "rmendes.net", payload: { content: "hi" } });
    const deps: RetryDeps = {
      queue,
      accounts,
      post: vi.fn().mockRejectedValue(new Error("503 Service Unavailable")),
      notify: vi.fn(),
      refresher: vi.fn(),
    };
    await runRetryTick(deps);
    expect(await queue.count()).toBe(1);
    const items = await queue.list();
    const item = items[0];
    if (!item) throw new Error("queue empty");
    expect(item.attempts).toHaveLength(1);
    expect(item.status).toBe("pending");
  });

  it("sets auth_needed status and notifies on 401", async () => {
    await queue.enqueue({ account: "rmendes.net", payload: { content: "hi" } });
    const deps: RetryDeps = {
      queue,
      accounts,
      post: vi.fn().mockRejectedValue(new Error("401 unauthorized")),
      notify: vi.fn(),
      refresher: vi.fn(),
    };
    await runRetryTick(deps);
    const items = await queue.list();
    const item = items[0];
    if (!item) throw new Error("queue empty");
    expect(item.status).toBe("auth_needed");
    expect(deps.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "auth_needed" }));
  });

  it("removes item from queue + warns on permanent error (4xx not 401/429)", async () => {
    await queue.enqueue({ account: "rmendes.net", payload: { content: "hi" } });
    const deps: RetryDeps = {
      queue,
      accounts,
      post: vi.fn().mockRejectedValue(new Error("400 invalid")),
      notify: vi.fn(),
      refresher: vi.fn(),
    };
    await runRetryTick(deps);
    expect(await queue.count()).toBe(0);
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "permanent_failure" }),
    );
  });
});
