import type { Endpoints } from "../core/types";
import type { BrowserStorage } from "./browser-storage";

/** A sign-in that has left for the browser tab and not yet come back. */
export interface PendingAuth {
  state: string;
  verifier: string;
  siteUrl: string;
  endpoints: Endpoints;
  redirectUri: string;
  clientId: string;
  createdAt: string; // ISO 8601
}

export type AuthOutcome = { ok: true; domain: string } | { ok: false; error: string };
export type AuthResult = AuthOutcome & { at: string };

/** A login the user has not finished within this long is abandoned. */
export const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;

export const pendingAuthKey = (state: string): string => `pendingAuth:${state}`;
export const authResultKey = (state: string): string => `authResult:${state}`;

/**
 * Lives in `storage.session`: in-memory, gone when the browser closes, which
 * is the right lifetime for a PKCE verifier. Keyed by `state` so the callback
 * can find its own record and nothing else.
 */
export class PendingAuthStore {
  constructor(
    private storage: BrowserStorage,
    private now: () => number = Date.now,
  ) {}

  async put(record: Omit<PendingAuth, "createdAt">): Promise<void> {
    const createdAt = new Date(this.now()).toISOString();
    await this.storage.set({ [pendingAuthKey(record.state)]: { ...record, createdAt } });
  }

  /**
   * Fetch and delete in one step. `completeTabAuth` serialises concurrent
   * callbacks for the same state, so this alone isn't what keeps a code from
   * being exchanged twice. Expired records are deleted on sight rather than
   * by a sweeper; an unparsable `createdAt` counts as expired (fail closed).
   */
  async take(state: string): Promise<PendingAuth | undefined> {
    const key = pendingAuthKey(state);
    const record = await this.storage.get<PendingAuth>(key);
    if (!record) return undefined;
    await this.storage.remove(key);
    const age = this.now() - new Date(record.createdAt).getTime();
    return age <= PENDING_AUTH_TTL_MS ? record : undefined;
  }

  /** Lets a still-open options page show why a tab sign-in failed. */
  async setResult(state: string, result: AuthOutcome): Promise<void> {
    const at = new Date(this.now()).toISOString();
    await this.storage.set({ [authResultKey(state)]: { ...result, at } });
  }
}
