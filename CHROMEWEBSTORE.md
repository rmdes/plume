# Chrome Web Store listing notes

Last updated: 2026-09-30 (v1.7.0). Not shipped in the zip; `bun run zip` packs `.output/` only.

Item ID: `hcphdjeoolimpjjekegpobkhoealiige`. AMO listing: `plume-micropub-client`.

## Single purpose

Plume posts to the user's own Micropub-compatible blog from the browser: a toolbar composer, right-click capture of selections, links and images, drafts, and a retry queue. It talks only to the site the user connects.

## Permission justifications

Copy these into the dashboard's fields. Each is specific on purpose; "needed for the extension to work" is rejected.

The dashboard has ONE "host permission" box covering every URL pattern in the manifest (both `content_scripts` matches and permission entries). Use this combined text there:

> Plume declares two host patterns. (1) `<all_urls>` is optional and never requested up front: when the user connects their own blog, Plume asks for that blog's origin only, plus its token or media endpoint if the site delegates those to another host. It needs this to discover the site's Micropub and IndieAuth endpoints and to publish the user's posts to it. (2) `https://rmdes.github.io/plume/callback.html*` is a content script on exactly one page Plume owns. When the browser has no extension sign-in window (Firefox for Android) or the user chooses "Sign in using a browser tab" in settings, the user's IndieAuth server returns them to that page after login; the script reads the sign-in result (an authorization code and a state value) from the page's address, passes it to the extension to finish connecting the user's site, and updates the page's status text. It runs on no other page, reads nothing else, and sends data nowhere except to the extension itself.

The per-pattern versions below are the same content split out, for AMO or for a future dashboard layout.

**Host permission: `https://rmdes.github.io/plume/callback.html*` (content script, added in 1.7.0)**
Plume runs a small script on exactly one page it owns, https://rmdes.github.io/plume/callback.html. When the browser has no extension sign-in window (Firefox for Android) or the user chooses "Sign in using a browser tab" in settings, the user's IndieAuth server returns them to that page after login. The script reads the sign-in result (an authorization code and a state value) from that page's address, passes it to the extension so it can finish connecting the user's own site, and updates the page's status text. It runs on no other page, reads nothing else, and sends data nowhere except to the extension itself.

**Optional host permission: `<all_urls>`**
Declared optional so Plume can ask, at the moment the user connects a blog, for access to that blog's own origin only (plus its token or media endpoint if the site delegates those to another host). Plume needs it to discover the site's Micropub and IndieAuth endpoints and to publish posts to it. Nothing is requested up front, and each grant is scoped to a site the user typed in.

**`storage`**
Keeps the connected accounts and their tokens, drafts, the retry queue, settings, and an opt-in debug log, all locally in the browser.

**`identity`**
Opens the sign-in window for IndieAuth on browsers that provide one (`identity.launchWebAuthFlow`) and derives the redirect URL for it.

**`contextMenus`**
Adds the right-click entries that bookmark a link, reply to it, quote a selection, or post an image to the user's blog.

**`notifications`**
Tells the user when a post that was queued for retry finally went through or failed permanently, since that happens in the background after the popup is closed.

**`alarms`**
Wakes the background script once a minute to retry queued posts and once a day to refresh tokens before they expire.

## Privacy

Plume sends data only to the site the user connected, and only what the user chose to post. On the tab-based sign-in the authorization code and state pass through the callback page on GitHub Pages in the query string; the code is single-use and bound to a PKCE verifier that never leaves the browser. No analytics, no telemetry. Full policy: https://rmdes.github.io/plume/privacy.html and PRIVACY.md.

## Version history

- 1.7.0 (2026-09-30): tab-based sign-in for browsers without the identity API; adds the callback-page content script (new host permission above). Existing installs are disabled until the user re-approves the new permission. Also: a hint when a browser never shows the site-access prompt (Vivaldi 8.2 for Android).
- 1.6.2 (2026-08-16): drafts reachable from the composer header.
