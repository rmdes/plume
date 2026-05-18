# Changelog

All notable changes to Plume are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned for v1.1

- **MediaPicker**: browse and reuse existing files uploaded to the media endpoint, via `?q=source` paginated query. Saves re-uploading photos that already live on the server.
- **`ai-code-level` field** in `AiMetadataPanel` (currently only text-level / tools / description render — code-level is defined in `KNOWN_EXTENSIONS` but not exposed in the UI).
- **`mp-extensions` server-advertised auto-detection**: paired patch to `@rmdes/indiekit-endpoint-posts` so accounts auto-enable known extensions when the server declares them.
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
- Per-account Tier 3 extension toggles (AI metadata supported in v1.0)
- AMO + Chrome Web Store-ready manifest with `optional_host_permissions` (no install-time `<all_urls>`)
