import type { CreateOptions } from "../core/types";
import type { BrowserStorage } from "./browser-storage";

const QUEUE_KEY = "queue";

// 30s, 2m, 10m, 30m, 2h, 24h
export const BACKOFF_SCHEDULE_MS = [
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  24 * 60 * 60_000,
];

export const MAX_ATTEMPTS = 10;

export type QueueStatus = "pending" | "auth_needed" | "abandoned";

export interface QueueAttempt {
  at: string; // ISO 8601
  error: string;
}

export interface QueueItem {
  id: string;
  account: string;
  createdAt: string; // ISO 8601
  payload: CreateOptions;
  status: QueueStatus;
  attempts: QueueAttempt[];
  nextAttempt: string; // ISO 8601
}

export interface EnqueueArgs {
  account: string;
  payload: CreateOptions;
}

export interface RecordAttemptArgs {
  error: string;
  retryable?: boolean;
  authNeeded?: boolean;
}

function ulid(): string {
  // Tiny ulid-ish: timestamp prefix + random suffix.
  // Good enough for queue IDs; production extensions can swap in a real ulid lib.
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class QueueStore {
  constructor(private storage: BrowserStorage) {}

  private async readAll(): Promise<QueueItem[]> {
    return (await this.storage.get<QueueItem[]>(QUEUE_KEY)) ?? [];
  }

  private async writeAll(items: QueueItem[]): Promise<void> {
    await this.storage.set({ [QUEUE_KEY]: items });
  }

  async list(): Promise<QueueItem[]> {
    return this.readAll();
  }

  async count(): Promise<number> {
    return (await this.readAll()).length;
  }

  async hasAuthNeeded(): Promise<boolean> {
    const items = await this.readAll();
    return items.some((i) => i.status === "auth_needed");
  }

  async enqueue(args: EnqueueArgs): Promise<string> {
    const now = new Date().toISOString();
    const item: QueueItem = {
      id: ulid(),
      account: args.account,
      createdAt: now,
      payload: args.payload,
      status: "pending",
      attempts: [],
      nextAttempt: now,
    };
    const items = await this.readAll();
    items.push(item);
    await this.writeAll(items);
    return item.id;
  }

  async dueNow(): Promise<QueueItem[]> {
    const items = await this.readAll();
    const now = Date.now();
    return items.filter((i) => i.status === "pending" && new Date(i.nextAttempt).getTime() <= now);
  }

  async recordAttempt(id: string, args: RecordAttemptArgs): Promise<void> {
    const items = await this.readAll();
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const now = new Date();
    item.attempts.push({ at: now.toISOString(), error: args.error });

    if (args.authNeeded) {
      item.status = "auth_needed";
    } else if (item.attempts.length >= MAX_ATTEMPTS) {
      item.status = "abandoned";
    } else if (args.retryable) {
      const step = Math.min(item.attempts.length - 1, BACKOFF_SCHEDULE_MS.length - 1);
      const delayMs = BACKOFF_SCHEDULE_MS[step];
      if (delayMs !== undefined) {
        item.nextAttempt = new Date(now.getTime() + delayMs).toISOString();
      }
    }
    await this.writeAll(items);
  }

  async remove(id: string): Promise<void> {
    const items = (await this.readAll()).filter((i) => i.id !== id);
    await this.writeAll(items);
  }
}
