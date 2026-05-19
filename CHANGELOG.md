# Changelog

All notable changes to Plume are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — v1.1 (in development)

### Added

- **MediaPicker** modal in the Photo composer: "Or browse media already on your server →" opens a 3-column thumbnail grid of existing files fetched via `?q=source` on the media endpoint, with cursor-based pagination (`paging.after` / `paging.before`). Selecting a thumbnail fills `photo[]` for the post.
- **Server-side extension detection** via `?q=post-types`. Plume scans the union of all `post-types[].properties[]` for known extension property keys (e.g., `ai-text-level`). When an extension's required properties are all advertised by the server, ExtensionToggles renders a "✓ Server supports" badge next to it. Spec-compliant replacement for the earlier out-of-spec `mp-extensions` idea.
- **Keyboard shortcut** to open the composer popup: `Alt+Shift+P` by default. Users can rebind via `chrome://extensions/shortcuts` (Chrome) or `about:addons` → Manage Extension Shortcuts (Firefox).
- **Live refresh** of QueueList and DraftList on the options page. Both lists now subscribe to `chrome.storage.onChanged` so background mutations (queue executor running, popup composer auto-saving) update the UI without a manual reload.

### Fixed

- MediaPicker self-heals when `account.media_endpoint` is missing. Same `?q=config` lookup that the file uploader already uses; previously the picker threw "no media endpoint configured" even when the server advertised one.

### Chores

- E2E test fixtures: `/tmp/plume-ext-*` dirs are now cleaned up on process exit instead of accumulating across test runs.
- GitHub Actions bumped to Node 24-capable versions ahead of GitHub's Sep 2026 retirement of Node 20 actions: `actions/checkout@v5`, `actions/upload-artifact@v5`, `actions/upload-pages-artifact@v4`.

## [1.0.4] — 2026-05-19

### Fixed

- Mozilla AMO submission rejected v1.0.3 with "the `data_collection_permissions` property is required for all new Firefox extensions." Added `browser_specific_settings.gecko.data_collection_permissions: { required: ["none"] }` to declare that Plume collects no user data — consistent with the PRIVACY.md posture. Chrome ignores this field; Firefox now satisfies AMO validation.

### Known AMO validator warnings (not actionable; informational)

- `action.setBadgeText`, `action.setBadgeBackgroundColor`, `action.openPopup` flagged as "not supported by Firefox" by AMO's validator. All three ARE supported in Firefox 127+, which we already declare as `strict_min_version`. `openPopup` has a fallback to opening in a new tab via `openPopupSafe` for browsers where it's still missing.
- `Unsafe assignment to innerHTML` flagged in the bundled `micropub-client-*.js` chunk. The pattern is in Preact's HTML-injection handler — dead code that Plume's JSX components never reach (Plume renders only plain text and DOM children, never raw HTML strings).

## [1.0.3] — 2026-05-19

### Changed

- Dev-mode `manifest.key` now uses the Chrome Web Store production public key (assigned to the published extension after first upload). Unpacked dev installs and CWS-installed users now share the same extension ID (`hcphdjeoolimpjjekegpobkhoealiige`) and the same `chromiumapp.org` OAuth callback URL.
- Pages site simplified from four redirect_uri declarations to three — the orphaned self-generated dev pin (`kjfcmmliahijkokkhgellflmefpfglin.chromiumapp.org`) is removed since no install will ever derive that ID now.

## [1.0.2] — 2026-05-19

### Fixed

- Chrome Web Store first-upload rejection: `manifest.key` was being included in production zips, which CWS rejects with "the value of the 'key' field does not match the current item." The `key` field is now conditionally injected only in development mode (preserving the stable dev ID), and omitted from `wxt zip` outputs uploaded to stores. The wildcard `https://*.chromiumapp.org/` redirect URI on the Pages site covers whatever ID CWS eventually assigns.

## [1.0.1] — 2026-05-19

### Fixed

- Photo tab in the composer now has a file picker (was missing — only the post-upload preview rendered in v1.0).
- Media endpoint self-heals via `?q=config` when not advertised on the homepage's `<link rel="media-endpoint">` tag; account record gets updated on first server-config fetch.
- Background `refreshMenus` race condition that caused console errors on account add (duplicate context-menu IDs).
- `chrome.action.openPopup()` falls back to opening `popup.html` in a new tab when the calling window has no toolbar (Vivaldi side panels, dev-tools popouts).
- Image context menu now requests `chrome.permissions` for the image's origin per-domain (was failing CORS-blocked for any origin not in the active account's grant).

### Added

- Pinned Chrome extension key in manifest for stable dev ID (`kjfcmmliahijkokkhgellflmefpfglin`) — survives reinstalls and matches the URL declared on the GitHub Pages `client_id` site.
- Convention attribution links in the AI metadata UI — both the options-page extension toggle and the composer panel link to the convention author's rationale.
- GitHub Pages landing page with 4 screenshots (replaces the discovery-only stub).
- `bun run screenshots` script — reproducible Playwright capture of store-listing PNGs from a built extension + mock server.

### Changed

- Spec-honest framing in CHANGELOG's v1.1 plan: extension auto-detection will use the existing `?q=post-types` `properties[]` array (spec-compliant) rather than a vendor-invented `mp-extensions` discovery field.

### Removed

- `activeTab` permission. Declared in v1.0 but never exercised — the context-menu prefill flow uses `contextMenus` alone (`info.pageUrl` + `tab.title` are provided by the `onClicked` event, no scripting access needed).
- `mp-extensions` type slot in `ServerConfig` — aspirational interface for a never-shipped invention.

## [1.0.0] — 2026-05-18

### Planned for v1.1

- **MediaPicker**: browse and reuse existing files uploaded to the media endpoint, via `?q=source` paginated query. Saves re-uploading photos that already live on the server.
- **Spec-compliant extension auto-detection**: scan the `?q=post-types` response's `properties[]` arrays for known extension property names (e.g., `ai-text-level`); auto-enable matching toggles. Paired patch to `@rmdes/indiekit-endpoint-posts` to advertise the AI metadata fields in its `post-types` properties. Uses only spec-defined Micropub surface — no new discovery field invented.
- **Live refresh of QueueList / DraftList** when `chrome.storage.onChanged` fires (currently re-fetch only on mount + user actions).
- **Keyboard shortcut** to open the composer.
- **Playwright fixture cleanup** for `/tmp/plume-ext-*` directories left by extension-loader patches.

## [1.0.0] — 2026-05-18

### Added

- Toolbar popup composer with type tabs (Note, Article, Reply, Bookmark, Like, Repost, Quote, Photo)
- Context menus: page (Bookmark/Reply/Like), link (Bookmark/Reply), selection (Quote), image (Post)
- Multi-account IndieAuth + PKCE via `chrome.identity.launchWebAuthFlow`
- Per-(account, scope) draft autosave with 7-day TTL
- Retry queue with exponential backoff (30s → 24h) and abandonment after 10 attempts
- Toolbar badge: auth-needed / queue depth / clear
- Notifications for auth_needed, permanent failures, and background-retry success (opt-out)
- Server capability detection (`?q=config`, `?q=post-types`, `?q=category`) with 24h cache
- Per-account Tier 3 extension toggles with AI metadata panel (`ai-text-level`, `ai-code-level`, `ai-tools`, `ai-description`)
- AMO + Chrome Web Store-ready manifest with `optional_host_permissions` (no install-time `<all_urls>`)
