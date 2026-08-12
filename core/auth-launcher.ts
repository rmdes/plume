import { browser } from "./browser-api";
import type { AuthLauncher } from "./indieauth";

/**
 * Production launcher backed by browser.identity.launchWebAuthFlow.
 * Resolves with the final redirect URL containing ?code=...&state=...
 */
export const chromeIdentityLauncher: AuthLauncher = async (authUrl) => {
  // Promise form, not the callback form: Firefox's `browser.*` namespace is
  // promise-only and silently ignores a trailing callback, which would leave
  // the auth flow hanging forever. Chrome MV3 returns a promise here too.
  const redirect = await browser.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  if (!redirect) throw new Error("Auth flow cancelled or failed");
  return redirect;
};
