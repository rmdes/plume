# CLAUDE.md — Plume Micropub Extension

## Overview

Plume is a cross-browser (Chrome + Firefox, Manifest V3) Micropub client
extension. Built with [WXT](https://wxt.dev) + [Preact](https://preactjs.com) +
TypeScript, runtime is Bun. Standalone repo at `~/code/plume` (separate from
the `~/code/indiekit-dev/` workspace, though it primarily targets
[rmendes.net](https://rmendes.net), an Indiekit deployment).

## Commands

```bash
bun install          # Install dependencies (uses bun.lockb)
bun run dev          # Chrome dev mode with hot reload (loads at .output/chrome-mv3)
bun run dev:firefox  # Firefox dev mode
bun run build        # Production build → .output/chrome-mv3
bun run build:firefox# Production build → .output/firefox-mv2
bun run zip          # Store-ready Chrome zip → .output/plume-X.Y.Z-chrome.zip
bun run zip:firefox  # Store-ready Firefox zip → .output/plume-X.Y.Z-firefox.zip
bun run test         # Vitest unit tests (113 tests, ~3s)
bun run test:e2e     # Playwright E2E against mock server (chromium only)
bun run typecheck    # tsc --noEmit
bun run lint         # eslint . && prettier --check .
bun run screenshots  # Regenerate docs/site/screenshots/* via scripts/
```

Critical: `bun test` (no `run`) uses Bun's built-in test runner which
doesn't understand vitest mocks. **Always go through `bun run test`.**

## Architecture

```
core/          Pure-logic modules — no chrome.* APIs, fully unit-testable
├── auth-config.ts        CLIENT_ID, redirect URI, default scope
├── auth-launcher.ts      chrome.identity.launchWebAuthFlow wrapper
├── badge.ts              Toolbar badge state (queue size etc.)
├── context-menus.ts      Right-click menu builders
├── discovery.ts          Parse Link headers + <link rel="..."> tags
├── extensions.ts         Known mf2 extension registry + detectExtensions()
├── image-fetch.ts        Cross-origin image fetch with permission gating
├── indieauth.ts          PKCE start/exchange/refresh
├── micropub-client.ts    HTTP client (create/update/delete/query/upload/listMedia)
├── normalize.ts          Selection → Markdown blockquote, URL → mf2 properties
├── page-title.ts         Fetch <title> from current page
├── pkce.ts               crypto.subtle SHA-256 challenge
├── retry-executor.ts     Queue runner with exponential backoff
└── server-config.ts      Cache ?q=config / ?q=post-types / ?q=category

storage/       chrome.storage.local abstractions
├── accounts.ts           AccountStore — multi-account + enabled/detected extensions
├── browser-storage.ts    BrowserStorage interface + FakeBrowserStorage for tests
├── defaults.ts           DefaultsStore — active account + AI metadata defaults
├── drafts.ts             DraftStore — auto-save / 7-day TTL
├── queue.ts              QueueStore — pending posts + attempt history
└── index.ts              Singleton factories (accountStore(), queueStore(), ...)

entrypoints/   Extension surfaces (one per HTML/JS bundle)
├── background.ts         Service worker — context menus + queue executor + openPopupSafe
├── popup/                Toolbar popup (360 px) + ?popout=1 tab mode (720 px)
│   ├── main.tsx          Popup component — owns server-config fetch + draft prefill
│   ├── Composer.tsx      Post composer — type picker, fields, submit/queue
│   ├── useComposerState.ts
│   └── useDraftAutosave.ts
└── options/              Full-tab options page
    ├── main.tsx
    ├── AccountList.tsx + AddAccountDialog.tsx
    ├── QueueList.tsx + DraftList.tsx (chrome.storage.onChanged subscribers)
    └── ExtensionToggles.tsx (renders detected/enabled extension state)

components/    Shared Preact components
├── AiMetadataPanel.tsx   AI transparency fields (text/code level, tools, description)
├── CategoryChips.tsx     Tag input with autocomplete from cached_categories
├── MediaPicker.tsx       Modal grid for browsing media endpoint via ?q=source
├── SyndicateChips.tsx    Syndication target multi-select from ?q=syndicate-to
└── TypePicker.tsx        Post-type dropdown (note/article/reply/...)

tests/
├── e2e/                  Playwright with launchWithExtension helper
└── fixtures/             Mock Micropub + IndieAuth server (Bun.serve)
```

### Data flow on popup open

```
popup/main.tsx mounts
  ├── accountStore().getActiveRefreshed(refreshToken)   ← uses cached token, refreshes if expired
  ├── fetchAndCacheServerConfig(accountStore(), domain) ← ?q=config + ?q=post-types + ?q=category
  ├── accountStore().getEnabledExtensions(domain)
  ├── sessionStorage().get("pendingPrefill")            ← context-menu seed (URL of bookmarked page, etc.)
  └── draftStore().load(domain, scope)                  ← hydrate textarea from autosaved draft
```

## MV3 specifics

### `manifest.key` is dev-only

`wxt.config.ts` injects `manifest.key` only when `mode === "development"` so
unpacked dev installs derive the same extension ID as the published CWS item
(`hcphdjeoolimpjjekegpobkhoealiige`). Production zips MUST omit this field:

- CWS rejects first-upload zips with `manifest.key` set.
- CWS rejects subsequent zips where `manifest.key` doesn't match the recorded value.

### `openPopupSafe` fallback

`chrome.action.openPopup()` throws in browsers where the current window has
no toolbar (Vivaldi side panels, dev-tools popouts). `background.ts` wraps it
in `openPopupSafe()` which falls back to `chrome.tabs.create({url: "popup.html?popout=1"})`.

### `?popout=1` mode

Same `popup.html` entry — query-param flag at the top of `popup/main.tsx`
switches the layout from 360 px toolbar to 480–720 px centered card with a
roomier textarea (rows=20 vs rows=6). The `↗` button in the popup header
triggers this and closes the toolbar popup. The `openPopupSafe` fallback
also passes `?popout=1` so sidebar users get the better layout for free.

### Permissions

- **At install:** `storage`, `contextMenus`, `identity`, `notifications`, `alarms`. No host permissions.
- **Per-account:** `<all_urls>` is in `optional_host_permissions`. `AddAccountDialog` requests `chrome.permissions.request({origins: [account_origin + "/*"]})` before kicking off IndieAuth, so the user grants access scoped to each blog they connect.

### Firefox `data_collection_permissions`

Required by Mozilla AMO since early 2026. Plume declares `{required: ["none"]}`
under `browser_specific_settings.gecko`. Chrome ignores the field.

## Conventions

### Date handling

All timestamps in storage are ISO 8601 strings (`new Date().toISOString()`),
never `Date` objects. Match `@indiekit/util`'s convention so dates flow
cleanly into post payloads via `published`.

### AI transparency metadata

When the user has the `ai-metadata` extension toggled on, the composer
includes four mf2 fields in the post properties:
`ai-text-level`, `ai-code-level`, `ai-tools`, `ai-description`. Values map
to a documented convention at https://rmendes.net/articles/2026/03/03/.

### Extension detection vs enablement

Two separate concerns kept in different storage fields per account:

- `detected_extensions[]` — set by `fetchAndCacheServerConfig` from
  scanning `?q=post-types[].properties[]` for known property keys.
  Informational; surfaces a "✓ Server supports" badge.
- `enabled_extensions[]` — set by user toggling in ExtensionToggles. Only
  enabled extensions render their fields in the composer.

Never auto-enable from detection; the user opts in.

### Storage self-heal pattern

`account.media_endpoint` is populated at IndieAuth login from
`<link rel="media-endpoint">` discovery. If the server's homepage doesn't
expose that tag, the field is empty even though `?q=config` advertises it.
MediaPicker and the photo uploader both self-heal: call
`fetchAndCacheServerConfig` (which writes the discovered endpoint back to
the account record) before the first request needing it.

### Dynamic vs static imports

Avoid `await import("...")` when the same module is already statically
imported elsewhere in the bundle. Vite warns about this — the dynamic
import resolves instantly from cache (no code-split) and the wrapper
code is dead weight. Keep static unless you have a real reason to lazy-load.

## Store publishing checklist

For each new release:

1. Bump `package.json` version.
2. Finalize CHANGELOG `[X.Y.Z] — DATE` section (release workflow extracts these notes via awk).
3. Merge feature branch into main with `--no-ff`.
4. Tag `vX.Y.Z` and push the tag → triggers `.github/workflows/release.yml`.
5. Release workflow drafts a GitHub release with `plume-X.Y.Z-chrome.zip` + `plume-X.Y.Z-firefox.zip` + sources.
6. Smoke-test the zips by loading them as unpacked extensions.
7. Publish the draft release on GitHub.
8. Upload Chrome zip to CWS dashboard (item ID `hcphdjeoolimpjjekegpobkhoealiige`) as an update.
9. Upload Firefox zip to AMO dashboard (`plume-micropub-client`).
10. Firefox signing via `web-ext sign` is skipped in CI when `AMO_API_KEY` is unset (current state).

## Known gotchas

- **`bun test` ≠ `bun run test`.** Bun's built-in runner doesn't understand vitest mocks.
- **MV3 service workers don't run in Playwright headless mode.** `launchWithExtension` sets `headless: false`.
- **`/tmp/plume-ext-*` cleanup.** `tests/e2e/helpers.ts` registers a `process.on('exit')` rm handler — without it, E2E runs would leak ~88 KB per launch.
- **`refreshMenus` race.** `background.ts` uses a mutex (`menuRefreshRunning` / `menuRefreshPending`) so concurrent `onInstalled` + `storage.onChanged` events don't create duplicate context-menu IDs.
- **CSP and OAuth redirect.** Indiekit's nginx CSP `form-action 'self' https:` blocks HTTP redirects to `localhost:19750` (MCP) or `https://*.chromiumapp.org/` (Plume). The `/auth` location block overrides this. See `indiekit-mcp-micropub/CLAUDE.md` for the original incident report.

## Related repos

- `~/code/indiekit-dev/indiekit-mcp-micropub` — MCP server with the same Micropub HTTP shape; Plume's `core/micropub-client.ts` is a TS port of that codebase.
- `~/code/indiekit-dev/indiekit-cloudron` — Cloudron deployment of rmendes.net (Plume's primary test target).
- `~/code/indiekit-dev/indiekit-endpoint-files` — `@rmdes/indiekit-endpoint-files` fork. Its `?q=source` response shape is what MediaPicker consumes.
- `~/code/indiekit-dev/indiekit-endpoint-auth` — `@rmdes/indiekit-endpoint-auth` fork. Patched `validateRedirect` to accept Plume's wildcard `https://*.chromiumapp.org/` callback declared on https://rmdes.github.io/plume/.
