import type { AccountStore } from "../storage/accounts";
import type { QueueStore } from "../storage/queue";
import type { CreateOptions, CreateResult, TokenData } from "./types";

export interface NotifyEvent {
  kind: "success" | "auth_needed" | "permanent_failure" | "retry_scheduled";
  domain: string;
  message: string;
  location?: string;
}

export interface RetryDeps {
  queue: QueueStore;
  accounts: AccountStore;
  post: (account: TokenData, payload: CreateOptions) => Promise<CreateResult>;
  refresher: (existing: TokenData) => Promise<TokenData>;
  notify: (event: NotifyEvent) => void;
}

function classify(message: string): {
  retryable: boolean;
  authNeeded: boolean;
  permanent: boolean;
} {
  if (/^401\b/.test(message) || /unauthorized/i.test(message)) {
    return { retryable: false, authNeeded: true, permanent: false };
  }
  if (
    /network/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /^5\d\d/.test(message) ||
    /^429/.test(message)
  ) {
    return { retryable: true, authNeeded: false, permanent: false };
  }
  return { retryable: false, authNeeded: false, permanent: true };
}

export async function runRetryTick(deps: RetryDeps): Promise<void> {
  const due = await deps.queue.dueNow();
  for (const item of due) {
    const account = await deps.accounts.get(item.account);
    if (!account) {
      // Account removed; drop the item.
      await deps.queue.remove(item.id);
      continue;
    }
    try {
      const result = await deps.post(account, item.payload);
      await deps.queue.remove(item.id);
      deps.notify({
        kind: "success",
        domain: item.account,
        message: "Post sent",
        location: result.location,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const cls = classify(message);
      if (cls.permanent) {
        await deps.queue.remove(item.id);
        deps.notify({
          kind: "permanent_failure",
          domain: item.account,
          message,
        });
      } else if (cls.authNeeded) {
        await deps.queue.recordAttempt(item.id, { error: message, authNeeded: true });
        deps.notify({
          kind: "auth_needed",
          domain: item.account,
          message: `Reconnect to ${item.account} required`,
        });
      } else {
        await deps.queue.recordAttempt(item.id, { error: message, retryable: true });
        deps.notify({
          kind: "retry_scheduled",
          domain: item.account,
          message,
        });
      }
    }
  }
}
