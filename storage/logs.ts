import type { BrowserStorage } from "./browser-storage";

const LOGS_KEY = "logs";
const MAX_ENTRIES = 100;

export type LogLevel = "error" | "warn" | "info";

export interface LogEntry {
  at: string; // ISO 8601
  level: LogLevel;
  /** Where it came from: "background", "popup", "options". */
  context: string;
  message: string;
  /** Already sanitised by the caller — see `sanitizeForLog`. */
  data?: unknown;
}

export class LogStore {
  constructor(private storage: BrowserStorage) {}

  async list(): Promise<LogEntry[]> {
    return (await this.storage.get<LogEntry[]>(LOGS_KEY)) ?? [];
  }

  /**
   * Append an entry, keeping only the most recent `MAX_ENTRIES`.
   *
   * ponytail: read-modify-write, so two contexts logging in the same instant
   * can lose an entry. Serialising would need a lock the extension has no
   * natural home for, and a dropped diagnostic line is cheaper than that
   * machinery. Revisit only if logs turn out to arrive with holes.
   */
  async append(entry: LogEntry): Promise<void> {
    const entries = await this.list();
    entries.push(entry);
    await this.storage.set({
      [LOGS_KEY]: entries.slice(-MAX_ENTRIES),
    });
  }

  async clear(): Promise<void> {
    await this.storage.remove(LOGS_KEY);
  }
}
