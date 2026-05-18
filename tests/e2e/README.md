# E2E tests

## Chromium

Standard Playwright with persistent context + `--load-extension`. Run:

```bash
bun run build
bun run test:e2e -- --project=chromium
```

Three specs cover the critical user paths:

- `compose-and-post.spec.ts` — toolbar click → compose note → submit → "Posted" toast
- `context-menu-bookmark.spec.ts` — pendingPrefill in `chrome.storage.session` → popup hydrates correctly
- `queue-visibility.spec.ts` — queued item in storage → QueueList renders it on the options page

### Why the helper patches the manifest

The extension declares `<all_urls>` in `optional_host_permissions` (not
`host_permissions`) so install-time permissions stay narrow. Plume's runtime
flow requests origin permissions per-account via `chrome.permissions.request`
when the user adds an account — which requires a user gesture Playwright cannot
synthesize reliably from automation.

`tests/e2e/helpers.ts` works around this by copying the built extension to a
temporary directory and patching the copy's `manifest.json` to promote the
mock-server origin (`http://localhost:18750/*`) into `host_permissions`.
Playwright loads the patched copy via `--load-extension`. The production
manifest is never touched.

## Firefox — v1.0 strategy: manual smoke

Firefox MV3 extension loading via Playwright is not natively supported. The
official browser-extension loading APIs in Playwright are Chromium-only.
For v1.0, Firefox coverage is a documented manual-smoke pass per release
candidate.

### Build the signed `.xpi`

```bash
bun run zip:firefox
# Produces .output/firefox-mv2.zip

bunx web-ext sign \
  --api-key=$AMO_API_KEY \
  --api-secret=$AMO_API_SECRET \
  --source-dir=.output/firefox-mv2 \
  --artifacts-dir=.output/firefox-signed \
  --channel=unlisted
```

(The release CI workflow in `.github/workflows/release.yml` will automate this
once Phase 10's T58 lands.)

### Smoke scenarios

Sideload the signed `.xpi` into a fresh Firefox Nightly profile. Walk through
the same three scenarios the Chromium E2E suite automates:

1. **Compose + post** — Add account against the mock server (run
   `bun tests/fixtures/mock-server.ts` in another terminal). Click toolbar →
   type a note → click Post → expect "Posted" toast within ~1s.
2. **Context-menu page-bookmark** — Right-click any page → Plume → Bookmark
   this page. Popup should open with target URL pre-filled and "bookmark" tab
   selected.
3. **Queue visibility** — Set `MOCK_FORCE_503=1` env var when starting the
   mock server. Submit a note. Open options → expect the failed post in
   "Retry queue" with status `pending`.

Track results in this file under "RC log" below.

## RC log

(Empty — first RC ships at v1.0.0.)
