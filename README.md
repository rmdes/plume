# 🪶 Plume

Cross-browser Micropub client extension. Post to your IndieWeb-compatible blog
from any page — toolbar composer or right-click context menus.

[![Latest release](https://img.shields.io/github/v/release/rmdes/plume?label=latest&sort=semver)](https://github.com/rmdes/plume/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[Latest release](https://github.com/rmdes/plume/releases/latest) ·
[Landing page](https://rmdes.github.io/plume/) ·
[Privacy](./PRIVACY.md)

---

## Quick composer

Click the toolbar feather. Type. Pick tags. Choose where to syndicate. Post.
The whole loop takes ~5 seconds and never leaves the page you were reading.
Keyboard shortcut: `Alt+Shift+P` (rebindable).

![Plume's toolbar popup composing a note with tags and syndication chips](docs/site/screenshots/1-compose-note.png)

## Right-click to bookmark, reply, quote, like

Right-click any page, link, image, or text selection. Plume opens with the
right fields pre-filled — URL of what you're bookmarking, page title, the
passage you highlighted as a Markdown blockquote with citation.

![Plume's bookmark composer pre-filled with URL and title from a context-menu click](docs/site/screenshots/2-bookmark-prefilled.png)

## Drafts, retry queue, multi-account

Auto-save while you write — drafts survive across popup closes. Posts that
hit a network blip get queued and retried in the background with exponential
backoff. Connect multiple Micropub blogs and switch between them.

![Plume's options page showing accounts, retry queue, and draft posts](docs/site/screenshots/3-options-accounts.png)

## Posted, with a link back

When the server confirms, Plume shows you the URL of your new post and
closes. Your content lands on your blog with whatever syndication targets
and metadata you chose.

![Plume's composer showing the successful post confirmation toast](docs/site/screenshots/4-posted-toast.png)

---

## Features

- **Quick composer** in the toolbar popup — notes, articles, replies, bookmarks, likes, reposts, quotes, photos, picked from a vertical rail so every type is one click away.
- **Markdown toolbar + preview** — bold/italic/link/list/quote/code/heading buttons above the textarea; toggle a live rendered preview pane (snarkdown + DOMPurify, lazy-loaded).
- **Pop-out composer** (`↗` button) opens the same composer in a tab at desk-width (480–720 px) for long-form article writing.
- **Capture from anywhere** — right-click any page, link, selection, or image to post.
- **MediaPicker** — browse files already on your server via `?q=source` and reuse them in new posts.
- **Multi-account** — connect multiple Micropub blogs, switch between them.
- **Drafts** auto-save while you type; restore on next popup open (7-day TTL).
- **Retry queue** with exponential backoff (30s → 24h) for failed posts.
- **Live-updating** queue and draft lists on the options page (subscribed to `chrome.storage.onChanged`).
- **Server-aware** — reads `?q=config`, `?q=post-types`, `?q=category` from your blog. Post types are labelled with your server's own names, types it doesn't advertise are dimmed, and detected extension properties get "✓ Server supports" badges.
- **AI transparency metadata** — optional per-post fields disclosing AI involvement.
- **Keyboard shortcut** — `Alt+Shift+P` opens the composer popup (rebindable in browser settings).
- **IndieAuth + PKCE** via `chrome.identity.launchWebAuthFlow`. Connecting an account shows each step as it happens — permission, endpoint discovery, token exchange, server config — so a failure says which part failed.
- **A debug log you can hand over** — errors are always recorded; tick one box to record the steps leading up to them. Access tokens and authorization codes are stripped before anything is written, so it's safe to paste into an issue.
- **A welcome page on first install** that explains Micropub and IndieAuth without assuming you already know them.
- **Narrow permissions** — install asks for nothing broad; host permissions requested per-account.
- **No telemetry** — your data stays in your browser. See [PRIVACY.md](./PRIVACY.md).

## Install

- **Chrome Web Store:** [Install on Chrome](https://chromewebstore.google.com/detail/hcphdjeoolimpjjekegpobkhoealiige/)
- **Mozilla AMO:** [Install on Firefox](https://addons.mozilla.org/en-US/firefox/addon/plume-micropub-client/)
- **Direct download:** [latest release](https://github.com/rmdes/plume/releases/latest) (Chrome zip + Firefox zip + source)

To load the Chrome build as an unpacked extension:

1. From the [latest release](https://github.com/rmdes/plume/releases/latest), download the Chrome zip asset (named `plume-<version>-chrome.zip`) and extract it.
2. Open `chrome://extensions`, enable "Developer mode" (top right).
3. Click "Load unpacked" and select the extracted directory.

## Build from source

```bash
bun install
bun run dev          # Chrome dev mode (hot reload)
bun run dev:firefox  # Firefox dev mode
bun run build        # Production build
bun run test         # Unit tests (vitest) — note `run`: bare `bun test` uses
                     # Bun's own runner, which doesn't understand vitest mocks
bun run test:e2e     # Playwright E2E (chromium)
bun run screenshots  # Regenerate the screenshots above
```

## Architecture

- `core/` — pure-logic modules (Micropub HTTP, IndieAuth + PKCE, retry executor, normalization, extension detection)
- `storage/` — `chrome.storage.local` abstractions (accounts, drafts, queue, defaults, logs, session)
- `entrypoints/` — extension surfaces (popup, options, background service worker)
- `components/` — shared Preact components (composer chips, AI metadata panel, MediaPicker)
- `tests/` — vitest unit tests and Playwright E2E (chromium)
- `scripts/` — capture-screenshots, lint-fetch privacy enforcement

Built with [WXT](https://wxt.dev) + [Preact](https://preactjs.com) +
[TypeScript](https://www.typescriptlang.org). Linted with ESLint + Prettier.

Project-specific conventions and gotchas are documented in [CLAUDE.md](./CLAUDE.md).

## License

MIT — see [LICENSE](./LICENSE).
