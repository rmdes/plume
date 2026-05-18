# Changelog

All notable changes to Plume are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
