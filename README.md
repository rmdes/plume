# 🪶 Plume

Cross-browser Micropub client extension. Post to your IndieWeb-compatible blog
from any page — toolbar composer or right-click context menus.

**Status:** v1.0 — released 2026-05-19.
[Download v1.0](https://github.com/rmdes/plume/releases/latest) ·
[Landing page](https://rmdes.github.io/plume/) ·
[Privacy](./PRIVACY.md)

---

## Quick composer

Click the toolbar feather. Type. Pick tags. Choose where to syndicate. Post.
The whole loop takes ~5 seconds and never leaves the page you were reading.

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

- **Quick composer** in the toolbar popup — notes, articles, replies, bookmarks, likes, reposts, quotes, photos.
- **Capture from anywhere** — right-click any page, link, selection, or image to post.
- **Multi-account** — connect multiple Micropub blogs, switch between them.
- **Drafts** auto-save while you type; restore on next popup open (7-day TTL).
- **Retry queue** with exponential backoff (30s → 24h) for failed posts.
- **Server-aware** — reads `?q=config`, `?q=post-types`, `?q=category` from your blog.
- **AI transparency metadata** — optional per-post fields disclosing AI involvement.
- **IndieAuth + PKCE** via `chrome.identity.launchWebAuthFlow`.
- **Narrow permissions** — install asks for nothing broad; host permissions requested per-account.
- **No telemetry** — your data stays in your browser. See [PRIVACY.md](./PRIVACY.md).

## Install

- **Direct download:** [v1.0 release](https://github.com/rmdes/plume/releases/latest) (Chrome zip + Firefox zip + source)
- **Chrome Web Store:** pending review
- **Mozilla AMO:** pending review

To load the Chrome build as an unpacked extension:

1. Download `plume-1.0.0-chrome.zip` from the release page and extract it.
2. Open `chrome://extensions`, enable "Developer mode" (top right).
3. Click "Load unpacked" and select the extracted directory.

## Build from source

```bash
bun install
bun run dev          # Chrome dev mode (hot reload)
bun run dev:firefox  # Firefox dev mode
bun run build        # Production build
bun test             # Unit tests (vitest)
bun run test:e2e     # Playwright E2E (chromium)
bun run screenshots  # Regenerate the screenshots above
```

## Architecture

- `core/` — pure-logic modules (Micropub HTTP, IndieAuth + PKCE, retry executor, normalization)
- `storage/` — `chrome.storage.local` abstractions (accounts, drafts, queue, defaults)
- `entrypoints/` — extension surfaces (popup, options, background service worker)
- `components/` — shared Preact components (composer chips, AI metadata panel)
- `tests/` — vitest unit tests (102) and Playwright E2E (3 on chromium)
- `scripts/` — capture-screenshots, lint-fetch privacy enforcement

Built with [WXT](https://wxt.dev) + [Preact](https://preactjs.com) +
[TypeScript](https://www.typescriptlang.org). Linted with ESLint + Prettier.

## License

MIT — see [LICENSE](./LICENSE).
