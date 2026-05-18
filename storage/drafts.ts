import type { CreateOptions } from "../core/types";
import type { BrowserStorage } from "./browser-storage";

const DRAFTS_KEY = "drafts";
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

export interface Draft extends Partial<CreateOptions> {
  savedAt?: string; // ISO 8601 — set by store on save
}

export interface ListedDraft {
  key: string; // "${domain}::${scope}"
  draft: Draft;
}

export class DraftStore {
  constructor(private storage: BrowserStorage) {}

  private key(domain: string, scope: string): string {
    return `${domain}::${scope}`;
  }

  private async readAll(): Promise<Record<string, Draft>> {
    return (await this.storage.get<Record<string, Draft>>(DRAFTS_KEY)) ?? {};
  }

  async save(domain: string, scope: string, draft: Draft): Promise<void> {
    const all = await this.readAll();
    all[this.key(domain, scope)] = {
      ...draft,
      savedAt: new Date().toISOString(),
    };
    await this.storage.set({ [DRAFTS_KEY]: all });
  }

  async load(domain: string, scope: string): Promise<Draft | undefined> {
    const all = await this.readAll();
    return all[this.key(domain, scope)];
  }

  async remove(domain: string, scope: string): Promise<void> {
    const all = await this.readAll();
    delete all[this.key(domain, scope)];
    await this.storage.set({ [DRAFTS_KEY]: all });
  }

  async purgeExpired(): Promise<number> {
    const all = await this.readAll();
    const cutoff = Date.now() - TTL_MS;
    let removed = 0;
    for (const [key, draft] of Object.entries(all)) {
      if (!draft.savedAt) continue;
      if (new Date(draft.savedAt).getTime() < cutoff) {
        delete all[key];
        removed++;
      }
    }
    if (removed > 0) await this.storage.set({ [DRAFTS_KEY]: all });
    return removed;
  }

  async list(): Promise<ListedDraft[]> {
    const all = await this.readAll();
    return Object.entries(all).map(([key, draft]) => ({ key, draft }));
  }
}
