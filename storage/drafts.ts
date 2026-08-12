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
  domain: string;
  scope: string;
  draft: Draft;
}

/**
 * The scope half of a draft's storage key: the URL a post targets, or
 * "general" for standalone notes and articles.
 *
 * Must be `||`, not `??`. The composer patches the target field to `""` as
 * soon as the post type is a target type (reply/bookmark/like/repost/quote),
 * and an empty string is not nullish — so `??` filed those drafts under
 * "domain::". The popup then looked for them under "domain::general" and
 * never restored them, post-success cleanup never deleted them, and the
 * options list's delete button bailed on its own falsy-scope guard.
 *
 * Keep every call site on this helper: the save, load, and delete paths live
 * in different files and silently diverged when each computed its own.
 */
export function draftScope(
  post: Pick<CreateOptions, "bookmarkOf" | "inReplyTo" | "likeOf" | "repostOf">,
): string {
  return post.bookmarkOf || post.inReplyTo || post.likeOf || post.repostOf || "general";
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
    return Object.entries(all).map(([key, draft]) => {
      // First separator only. The scope is a URL and may contain "::" itself
      // (an IPv6 host, a query string), which split("::", 2) would truncate —
      // yielding a scope that no longer addresses the draft it came from.
      const at = key.indexOf("::");
      return {
        key,
        domain: at === -1 ? key : key.slice(0, at),
        scope: at === -1 ? "" : key.slice(at + 2),
        draft,
      };
    });
  }
}
