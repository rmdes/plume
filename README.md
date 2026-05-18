# 🪶 Plume

Cross-browser Micropub client extension. Post to your IndieWeb-compatible blog
from any page — toolbar composer or right-click context menus.

**Status:** v1.0 — in development. Implementation tracking the design at
[`documentation-central/plans/2026-05-17-plume-micropub-extension-design.md`](https://github.com/rmdes/plume/issues).

## Features

- **Quick composer** in the toolbar popup — notes, articles, replies, bookmarks, likes, reposts, quotes, photos.
- **Capture from anywhere** — right-click any page, link, selection, or image to post.
- **Multi-account** — connect multiple Micropub blogs, switch between them.
- **Drafts** auto-save while you type; restore on next popup open.
- **Retry queue** with exponential backoff for failed posts.
- **No telemetry** — your data stays in your browser. See [PRIVACY.md](./PRIVACY.md).

## Install

(Chrome Web Store + AMO links once published.)

## Build from source

```bash
bun install
bun run dev          # Chrome dev mode
bun run dev:firefox  # Firefox dev mode
bun test             # Unit tests
bun run test:e2e     # Playwright E2E
```

## Architecture

- `core/` — pure-logic modules (Micropub HTTP, IndieAuth + PKCE, retry executor, normalization)
- `storage/` — `chrome.storage.local` abstractions (accounts, drafts, queue, defaults)
- `entrypoints/` — extension surfaces (popup, options, background service worker)
- `components/` — shared Preact components (composer chips, AI metadata panel)
- `tests/` — vitest unit tests (102) and Playwright E2E (3 on chromium)

Built with [WXT](https://wxt.dev) + [Preact](https://preactjs.com) +
[TypeScript](https://www.typescriptlang.org). Linted with ESLint + Prettier.

## License

MIT — see [LICENSE](./LICENSE).
