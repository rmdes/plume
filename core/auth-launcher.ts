import type { AuthLauncher } from "./indieauth";

/**
 * Production launcher backed by chrome.identity.launchWebAuthFlow.
 * Resolves with the final redirect URL containing ?code=...&state=...
 */
export const chromeIdentityLauncher: AuthLauncher = (authUrl) =>
  new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirect) => {
      if (chrome.runtime.lastError || !redirect) {
        reject(new Error(chrome.runtime.lastError?.message ?? "Auth flow cancelled or failed"));
        return;
      }
      resolve(redirect);
    });
  });
