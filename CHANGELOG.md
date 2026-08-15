# Changelog

All notable changes to Plume are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.1] — 2026-08-15

### Fixed

- **Posting failed with `syndicateTo?.includes is not a function` whenever no syndication target was selected.** Reported against a reply, which is the post type least likely to be syndicated, but it applied to every type. Three things combined: `[]` is truthy in JavaScript, so `if (options.syndicateTo)` sent `"mp-syndicate-to": []` on every post where nothing was picked; `mf2tojf2` collapses an empty array to an empty _object_ (a single-element array becomes a string, longer arrays stay arrays); and the receiving server then called `.includes` on that object. It only surfaced on servers that have syndication targets configured, which is why it looked intermittent — selecting one target made it work, selecting none broke it.
- Property values sent to the Micropub endpoint are now checked rather than trusted. `category`, `mp-syndicate-to`, `photo`, `video`, `audio` and extension properties were passed through from composer state unwrapped, though Micropub's JSON syntax requires every value to be an array. `mp-syndicate-to` is additionally reduced to uid strings and omitted when empty, since wrapping alone does not survive the server-side collapse to JF2. A coerced value is recorded in the debug log so the source of a bad shape can be found.

## [1.5.0] — 2026-08-15

Onboarding and diagnostics. Two user reports this cycle each cost a
round-trip that Plume had no way to shorten: it shipped no first-run
guidance and kept no log a user could hand over. Both are fixed here.

### Added

- **A welcome page on first install.** Plume previously installed in silence, leaving people to work out that an account has to be connected before anything happens. [welcome.html](https://rmdes.github.io/plume/welcome.html) explains Micropub and IndieAuth in plain language rather than assuming IndieWeb familiarity, states the one real prerequisite up front — your site must support Micropub — and walks through connecting an account. Opens once, gated on a genuine install, so updates don't reopen it.
- **A debug log you can hand over.** A 100-entry ring buffer, shown newest-first in settings with Copy and Clear. Errors are always recorded; everything quieter is behind a checkbox, so an enabled log stays readable while a disabled one still explains a failure. Entries are stripped to `name`, `message`, `status`, `statusText`, `method` and `url`, and `access_token`, `code`, `code_verifier`, `refresh_token` and `state` are redacted wherever they appear in a URL — a Micropub error can carry the request that produced it, including the `Authorization` header, and these logs exist to be pasted in public.
- **The add-account flow now narrates itself.** Instead of one opaque "Authorizing…" spanning a permission prompt, endpoint discovery, a possible second prompt, a token exchange and an account write, every step is listed up front and marked waiting, active, done or failed. The extra grant step that delegated-IndieAuth servers need is added once discovery reports it.
- **Post types now use your server's own names.** The `?q=post-types` response finally reaches the type picker, so a server that calls articles "Journal entry" shows that.

### Fixed

- **The type picker ignored server configuration entirely.** `TypePicker` accepted an `availableTypes` prop and filtered on it, but the composer never passed one, so a response Plume already fetched and cached was thrown away. Types a server doesn't advertise are now dimmed with a tooltip rather than hidden or disabled: Indiekit only advertises types it has fields configured for, so absence means "not configured for that server's own UI", not "this post will be rejected".
- **Endpoint discovery had no timeout**, so a site that never answered hung the add-account flow indefinitely. Both fetches now give up after 10 seconds.
- **Cancel was disabled while the add-account flow was busy**, which combined with the above left no way out of the dialog. It is never disabled now.
- Loading server configuration is a deliberately non-fatal step: a server with a broken `?q=config` is reported in red but the account is still added, and the popup opens with a warm cache.

### Changed

- **The client_id page declares literal redirect URIs instead of wildcards.** The OAuth working group's position is that wildcards in redirect URLs open up attack vectors, and neither browser needs one — Chrome derives its callback host from the extension ID, and Firefox uses `sha1(browser_specific_settings.gecko.id)`, so both are fixed and declarable. Measured from `browser.identity.getRedirectURL()` and confirmed against that hash.

## [1.4.0] — 2026-08-12

Drafts release. A single `??`-vs-`||` mistake in the draft key had made every
draft saved from a reply/bookmark/like/repost/quote composer unreachable —
never restored, never cleaned up after posting, and impossible to delete.
Reported from the options page, where the delete button appeared inert.

### Added

- **Edit button on each draft** in the options page. Opens the draft in the pop-out composer, switching the active account to the blog the draft belongs to first so it can't be published to whichever account happened to be active. Previously a saved draft could only be viewed and deleted from this list, never reopened.
- Each draft row now shows the blog it belongs to, and its target URL for replies/bookmarks.

### Fixed

- **Drafts saved from a reply/bookmark/like/repost/quote composer were unreachable.** The scope half of a draft's storage key was built with `??`, but the composer patches the target field to `""` as soon as one of those types is selected with a blank URL — and `""` is not nullish. Those drafts were filed under `"domain::"`, where the popup's restore looked under `"domain::general"` and never found them, post-success cleanup never deleted them (so they accumulated after posting), and the options list's delete button silently did nothing because it bailed on its own falsy-scope guard. All three paths now share one `draftScope()` helper. Existing orphaned drafts are deletable again.
- `DraftStore.list()` now returns each draft's parsed `domain` and `scope`, splitting on the first separator only. Callers were re-splitting the key with `split("::", 2)`, which truncates any scope containing `::` (an IPv6 host, a query string) into a value that no longer addresses the draft it came from.
- Dropped Vite's `<link rel="modulepreload">` hints from `popup.html` and `options.html` (`build.modulePreload: false`). On a `chrome-extension://` page the emitted `crossorigin` attribute made Chrome fetch the hint under different credentials than the module import that followed, so the cached entry never matched and was discarded — logging "cross-world extension resource mismatch" and then "preloaded but not used within a few seconds". Cosmetic only: the chunk is a static import at the top of both entries and always loaded regardless. Code splitting is unchanged, including the lazy markdown chunks.

## [1.3.1] — 2026-08-12

Bug-fix release for cross-browser account connection, from a report by
[@srijan](https://github.com/srijan) against a Kirby Micropub server that
delegates IndieAuth to indieauth.com. Every Firefox fix below affected _all_
Firefox users, not only delegated setups.

### Fixed

- **Sites that delegate IndieAuth to another origin can now be connected.** `AddAccountDialog` requested host permissions for the blog's origin only, so servers whose `token_endpoint` lives elsewhere (e.g. `tokens.indieauth.com` while micropub stays on the blog) had their token exchange blocked by CORS, surfacing as an opaque "Failed to fetch" right after login. The dialog now discovers the endpoints first and requests every origin it will actually fetch. Same-origin servers are unaffected and still see a single prompt; delegated setups get a second, explicit "Grant access & continue" step, which is required because `permissions.request()` only works inside a user gesture.
- **Firefox: adding an account no longer fails with "Permission denied".** `optional_host_permissions` is an MV3-only manifest key and was silently dropped from the MV2 Firefox build, leaving it with no optional origins at all — so `permissions.request({origins})` could never be granted for any site. MV2 builds now emit the equivalent `optional_permissions`.
- **Firefox: the popup no longer hangs forever on "Loading…".** Plume called the bare `chrome.*` global, whose async methods are callback-only on Firefox and return `undefined`. `storage.local.get()` therefore threw, the popup's init effect rejected, and neither state setter ever ran. All runtime calls now go through `core/browser-api.ts`, which resolves to the promise-based `browser` namespace on Firefox and `chrome` on Chrome.
- **Firefox: the toolbar badge no longer throws on every queue change.** MV3 renamed `browserAction` to `action`; WXT rewrites the manifest key for the MV2 Firefox build but not the API calls, so `action.setBadgeText` was undefined there and `updateBadge()` rejected on each queue mutation (and `openPopupSafe` always took its tab fallback). Calls now go through an accessor that resolves whichever name the build exposes. This also resolves the three `action.*` warnings AMO's validator raised in 1.0.4, recorded there as "not actionable; informational" — the validator was right. Those APIs do exist in Firefox 127+, but only under MV3 as `action`; the Firefox build is MV2, where the namespace is `browserAction`.
- Popup init failures are now caught and displayed instead of leaving the popup on "Loading…" with nothing to report.
- `identity.launchWebAuthFlow` now uses its promise form rather than a callback, which Firefox's promise-only namespace would have ignored.

## [1.3.0] — 2026-07-17

### Added

- **Account switcher in the popup.** With more than one account connected, the hostname in the popup header becomes a dropdown. Picking an account makes it the active posting identity (same effect as "Set default" on the options page) and reloads the composer with that account's server config, enabled extensions, and per-domain draft. Context-menu prefills (bookmark/reply/like/repost seeds) survive the switch. With a single account the header is unchanged.
- **E2E: `CHROME_PATH` env override** in `launchWithExtension` for machines where Playwright's pinned Chromium is unavailable (e.g. OS releases newer than the pin supports). CI behavior unchanged.

## [1.2.0] — 2026-05-19

### Added

- **Markdown toolbar + preview** in the composer. New toolbar above the textarea with buttons for bold, italic, link, bulleted list, numbered list, blockquote, inline code, and heading. Toolbar actions wrap the current selection (or insert a placeholder that becomes the next selection — VS Code pattern) and restore the cursor after Preact's re-render via a microtask scheduler.
- **👁 Preview toggle** swaps the textarea for a rendered Markdown pane. Parsing uses `snarkdown` for the practical Micropub subset (paragraphs, headings, bold/italic, links, lists, code spans, blockquotes) and `DOMPurify` to neutralize any raw `<script>` / `<iframe>` / on\*-handlers that might survive — important because the preview renders inside the privileged extension popup.
- **Lazy-loaded markdown machinery**: snarkdown + DOMPurify (~27 kB combined) only download when the user clicks Preview. Cold popup-open cost grew by ~5.75 kB (toolbar component code) instead of the +32 kB that eager-loading would have cost.

## [1.1.0] — 2026-05-19

### Added

- **MediaPicker** modal in the Photo composer: "Or browse media already on your server →" opens a 3-column thumbnail grid of existing files fetched via `?q=source` on the media endpoint, with cursor-based pagination (`paging.after` / `paging.before`). Selecting a thumbnail fills `photo[]` for the post.
- **Pop-out composer** for long-form writing: new "↗" button in the popup header opens `popup.html?popout=1` in a tab where the same composer renders at desk-width (min 480px, max 720px — capped at ~75ch for readable line length). Textarea jumps from `rows=6` to `rows=20` with a slightly larger font. Article-type posts also get a roomier `rows=12` textarea even in the toolbar popup. `openPopupSafe`'s tab fallback now also passes `?popout=1`, so Vivaldi side-panel users get the wider layout for free.
- **Server-side extension detection** via `?q=post-types`. Plume scans the union of all `post-types[].properties[]` for known extension property keys (e.g., `ai-text-level`). When an extension's required properties are all advertised by the server, ExtensionToggles renders a "✓ Server supports" badge next to it. Spec-compliant replacement for the earlier out-of-spec `mp-extensions` idea.
- **Keyboard shortcut** to open the composer popup: `Alt+Shift+P` by default. Users can rebind via `chrome://extensions/shortcuts` (Chrome) or `about:addons` → Manage Extension Shortcuts (Firefox).
- **Live refresh** of QueueList and DraftList on the options page. Both lists now subscribe to `chrome.storage.onChanged` so background mutations (queue executor running, popup composer auto-saving) update the UI without a manual reload.

### Fixed

- MediaPicker self-heals when `account.media_endpoint` is missing. Same `?q=config` lookup that the file uploader already uses; previously the picker threw "no media endpoint configured" even when the server advertised one.
- AddAccountDialog now uses fluid width (`min(440px, 92vw)`) instead of a rigid `minWidth: 400`. On narrow viewports (popup-sized surfaces, sidebars, small windows) the modal was sticking out past the centered backdrop, clipping the right-justified "Authorize" button. Button row also gets `flexWrap` for the extreme-narrow case.

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
