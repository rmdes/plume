export const CLIENT_ID = "https://rmdes.github.io/plume/";
export const DEFAULT_SCOPE = "create update delete media";

/**
 * Computes the redirect URI for this extension. In Chrome this is
 * https://<extension-id>.chromiumapp.org/; in Firefox it's
 * https://<extension-uuid>.extensions.allizom.org/. The browser's identity
 * API computes it correctly via getRedirectURL().
 */
export function getRedirectUri(): string {
  return chrome.identity.getRedirectURL();
}
