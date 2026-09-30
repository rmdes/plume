import type { AccountStore } from "../storage/accounts";
import type { PendingAuthStore } from "../storage/pending-auth";
import type { CallbackMessage, CallbackReply } from "./auth-callback";
import { exchangeCode } from "./indieauth";
import { log } from "./logger";

export interface TabAuthDeps {
  pending: PendingAuthStore;
  accounts: AccountStore;
  fetchConfig: (accounts: AccountStore, domain: string) => Promise<unknown>;
}

const NO_PENDING = "No sign-in in progress. Start again from Plume's settings.";

/**
 * States currently being exchanged. `PendingAuthStore.take()` is a get then
 * a remove across two awaits, so two callback messages for the same state
 * could otherwise both read the record before either deletes it; this set
 * serialises them so only the first proceeds.
 */
const inFlight = new Set<string>();

/**
 * Finish a tab-based sign-in from the callback page's message. Runs in the
 * background script so it survives the options tab being discarded, which
 * mobile browsers do while the user is away on the login tab.
 *
 * The pending record is taken (fetched and deleted) before anything else, so
 * a replayed message finds nothing; `inFlight` keeps a concurrent replay from
 * racing it, so a code is exchanged at most once.
 */
export async function completeTabAuth(
  message: CallbackMessage,
  deps: TabAuthDeps,
): Promise<CallbackReply> {
  if (message.state && inFlight.has(message.state)) {
    return { ok: false, error: NO_PENDING };
  }
  if (message.state) inFlight.add(message.state);
  try {
    const record = message.state ? await deps.pending.take(message.state) : undefined;
    if (!record) {
      // Expired, replayed, or never ours. The state is not a secret but is
      // useless to a reader, so only the fact is recorded.
      log.warn("tab sign-in callback with no pending record");
      if (message.state) {
        await deps.pending.setResult(message.state, { ok: false, error: NO_PENDING });
      }
      return { ok: false, error: NO_PENDING };
    }

    if (message.error) {
      const error = message.errorDescription || message.error;
      await deps.pending.setResult(record.state, { ok: false, error });
      return { ok: false, error };
    }
    if (!message.code) {
      const error = "Authorization response missing code";
      await deps.pending.setResult(record.state, { ok: false, error });
      return { ok: false, error };
    }

    try {
      const token = await exchangeCode({
        code: message.code,
        verifier: record.verifier,
        redirectUri: record.redirectUri,
        clientId: record.clientId,
        endpoints: record.endpoints,
      });
      await deps.accounts.add(token);
      const domain = new URL(token.me).hostname;
      log.info("account connected", { domain, flow: "tab" });
      // Non-fatal, as in the dialog: the account is usable and the popup
      // refetches config on every open.
      try {
        await deps.fetchConfig(deps.accounts, domain);
      } catch (e) {
        log.warn("server config fetch after tab sign-in failed", e);
      }
      await deps.pending.setResult(record.state, { ok: true, domain });
      return { ok: true, domain };
    } catch (e) {
      log.error("tab sign-in failed", e);
      const error = e instanceof Error ? e.message : String(e);
      await deps.pending.setResult(record.state, { ok: false, error });
      return { ok: false, error };
    }
  } finally {
    if (message.state) inFlight.delete(message.state);
  }
}
