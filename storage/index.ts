import { browser } from "../core/browser-api";
import { AccountStore } from "./accounts";
import { ChromeBrowserStorage } from "./browser-storage";
import { DefaultsStore } from "./defaults";
import { DraftStore } from "./drafts";
import { LogStore } from "./logs";
import { QueueStore } from "./queue";

export type { AiMetadataDefaults, UserDefaults } from "./defaults";
export type { Draft, ListedDraft } from "./drafts";
export type { LogEntry, LogLevel } from "./logs";
export { draftScope } from "./drafts";
export type { EnqueueArgs, QueueItem, QueueStatus, RecordAttemptArgs } from "./queue";
export { AccountStore, DefaultsStore, DraftStore, LogStore, QueueStore };

let _local: ChromeBrowserStorage | null = null;
let _session: ChromeBrowserStorage | null = null;

export function localStorage(): ChromeBrowserStorage {
  if (!_local) _local = new ChromeBrowserStorage(browser.storage.local);
  return _local;
}

export function sessionStorage(): ChromeBrowserStorage {
  if (!_session) _session = new ChromeBrowserStorage(browser.storage.session);
  return _session;
}

export function accountStore(): AccountStore {
  return new AccountStore(localStorage());
}

export function defaultsStore(): DefaultsStore {
  return new DefaultsStore(localStorage());
}

export function draftStore(): DraftStore {
  return new DraftStore(localStorage());
}

export function queueStore(): QueueStore {
  return new QueueStore(localStorage());
}

export function logStore(): LogStore {
  return new LogStore(localStorage());
}
