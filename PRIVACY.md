# Plume — Privacy Policy

Plume sends data **only** to the Micropub endpoints you explicitly connect via the
"Add account" flow in settings.

## What Plume stores

All data is held in `chrome.storage.local` on your device and never leaves your
browser unless you explicitly post:

- **Account tokens**: IndieAuth OAuth tokens for the blogs you connect.
- **Drafts**: in-progress composer content, auto-saved per blog and per target URL.
- **Retry queue**: posts that failed to send due to network errors, queued for
  later retry.
- **Cached server config**: the `?q=config`, `?q=post-types`, and `?q=category`
  responses from your blog(s), refreshed every 24 hours.

## What Plume does NOT do

- No analytics, telemetry, error reporting, or crash logs.
- No third-party services. The only network requests Plume makes are to the
  Micropub endpoints you connect, to your blog for endpoint discovery, and to
  the IndieAuth servers your blog points to.
- No data syncing across devices. Plume does not use `chrome.storage.sync`.
- The `client_id` page at `https://rmdes.github.io/plume/` is a static HTML
  file declaring redirect URIs for IndieAuth verification; it does not receive
  any user data. On the tab-based sign-in, though, the authorization server
  redirects the browser to `https://rmdes.github.io/plume/callback.html?code=…&state=…`,
  so the authorization code and state do pass through GitHub Pages in the
  query string and may appear in GitHub's server logs. That code is single-use
  and bound to a PKCE verifier that never leaves your browser, so it's useless
  on its own; nothing else is sent. Plume also runs a small script on that
  callback page to read the sign-in result from the page's address and hand it
  to the extension. It runs nowhere else.

## Permissions

- `storage` — local-only data (above).
- `contextMenus` — right-click capture entry points.
- `identity` — runs the IndieAuth OAuth flow via `chrome.identity.launchWebAuthFlow`.
- `notifications` — surface background retry outcomes.
- `alarms` — periodic retry queue tick and token refresh.
- `optional_host_permissions: ["<all_urls>"]` — requested **per-account** at
  account-add time, scoped to that blog's origin only.

## Contact

Plume is open source. Source code, issues, and questions:
https://github.com/rmdes/plume
