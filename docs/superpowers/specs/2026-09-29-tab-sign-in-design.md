# Tab-based sign-in for browsers without a usable identity API

Date: 2026-09-29
Status: approved design, not yet implemented
Branch context: builds on `worktree-fix+permission-prompt-stall` (stall hint in `AddAccountDialog`)

## Problem

Plume signs in through `browser.identity.launchWebAuthFlow`. That API does not
exist on Firefox for Android (MDN compat data: never supported), and desktop
Vivaldi has user reports of its auth window closing at once. Firefox for
Android is the one mobile platform with documented extension support and a
device testing loop, and Plume cannot log in there at all.

Separately, Vivaldi 8.2 for Android never settles `permissions.request()` for
a host origin. That is Vivaldi's bug and is out of scope here beyond the stall
hint already in `AddAccountDialog`; the host-permission model stays as it is.

## Goals

- Sign in on any browser Plume ships to, including Firefox for Android, using
  only standard WebExtension APIs and the IndieAuth flow as specified.
- Keep today's identity flow on desktop Chrome and Firefox unchanged.
- Survive the options tab being discarded while the user is on the login tab,
  which mobile browsers do routinely.
- Keep the tab flow testable in the Chromium E2E suite.

Non-goals: user-agent sniffing, changing the optional host permission model,
resuming a half-finished dialog after its tab was discarded (the account just
appears in the list), notifications on completion.

## 1. Flow selection

`UserDefaults` gains `tabSignIn?: boolean` (default off) with
`DefaultsStore.setTabSignIn(value)`. The options page shows a checkbox near
the account list: "Sign in using a browser tab instead of a popup window".

`core/auth-flow.ts` exports:

```ts
export type AuthFlowKind = "identity" | "tab";
export function pickAuthFlow(
  prefs: { tabSignIn?: boolean },
  identityAvailable: boolean,
): AuthFlowKind;
```

Tab when `prefs.tabSignIn` is true or `identityAvailable` is false, otherwise
identity. The caller passes `typeof browser.identity?.launchWebAuthFlow === "function"`.
Pure function, unit-tested.

## 2. Shared request building

`core/indieauth.ts` gets `prepareAuth(args): Promise<PreparedAuth>` extracted
from the first half of `startAuth`: endpoint check, PKCE, state, authorization
URL. `startAuth` becomes `prepareAuth` + launcher + `exchangeCode`, behaviour
unchanged, existing tests pass as they are.

```ts
interface PreparedAuth {
  authUrl: string;
  state: string;
  verifier: string;
}
```

## 3. Tab flow

### Pending record

Stored in `browser.storage.session` (via the existing `sessionStorage()`
wrapper) under key `pendingAuth:<state>`:

```ts
interface PendingAuth {
  state: string;
  verifier: string;
  siteUrl: string;
  endpoints: Endpoints;
  redirectUri: string;
  clientId: string;
  createdAt: string; // ISO 8601, per repo convention
}
```

Session storage is in-memory and dies with the browser, which is the right
lifetime for a PKCE verifier. Records older than `PENDING_AUTH_TTL_MS`
(10 minutes) are treated as absent and deleted when encountered.

### Redirect URI and callback page

Redirect URI: `https://rmdes.github.io/plume/callback.html`. It is on the
client_id origin (`https://rmdes.github.io/plume/`), which IndieAuth accepts
without allow-listing. `docs/site/index.html` also lists it in a
`<link rel="redirect_uri">` for servers that check the list regardless.

`docs/site/callback.html` is static: heading "Finishing sign-in to Plume…",
and an inline script that after 4 seconds, if the extension has not replaced
the text, shows "Plume didn't respond. Is the extension installed and
enabled?" No code or state is rendered into the page.

### Content script

`entrypoints/callback.content.ts`, WXT `defineContentScript` with
`matches: ["https://rmdes.github.io/plume/callback.html*"]`, `runAt: "document_end"`.
It reads `code`, `state`, `error`, `error_description` from `location.search`,
sends one message:

```ts
{ type: "indieauth-callback", code?: string; state?: string; error?: string; errorDescription?: string }
```

and writes the reply (`{ ok: true, domain }` or `{ ok: false, error }`) into the
page text. It touches nothing else on the page.

### Background handler

In `background.ts`, `runtime.onMessage` for `type === "indieauth-callback"`:

1. Reject unless `sender.id === browser.runtime.id` and `sender.url` starts
   with the callback URL.
2. Missing `state`, or no unexpired pending record for it: reply
   `{ ok: false, error: "No sign-in in progress. Start again from Plume's settings." }`.
3. `error` present: delete the record, reply with `error_description || error`.
4. Otherwise `exchangeCode({ code, verifier, redirectUri, clientId, endpoints })`,
   `accountStore().add(token)`, `fetchAndCacheServerConfig(...)` (failure is
   logged and non-fatal, as in the dialog today), delete the record, write
   `authResult:<state>` = `{ ok: true, domain }` to session storage, reply
   `{ ok: true, domain }`, then `tabs.remove(sender.tab.id)`.
5. On exchange failure: delete the record, `log.error("tab sign-in failed", e)`,
   write `authResult:<state>` = `{ ok: false, error, at }` to session storage so
   an open dialog can show it, reply with the error.

The listener returns `true` and does its work in an async block, per the
MV2/MV3 message-channel rule. The record is deleted before the reply in every
branch so a code can never be exchanged twice.

### Dialog

`AddAccountDialog.authorize()` branches on `pickAuthFlow`:

- identity: unchanged.
- tab: after `prepareAuth`, write the pending record, `tabs.create({ url: authUrl })`,
  set the token step to active with detail "Finish signing in at <host> in the
  tab that opened", and wait on a promise resolved by `storage.onChanged`:
  the background records the outcome under the sign-in's own state key,
  `session["authResult:<state>"]`, for both outcomes — appearing with
  `ok: true` resolves, `ok: false` rejects with its error. Resolving on that
  key rather than diffing `local.accounts` means re-adding an already-connected
  account resolves the same as a new one. When the account appears the dialog
  marks the token step done and the config step done as well: config now
  belongs to the background and is non-fatal there, exactly as it is non-fatal
  in the dialog today. The dialog then closes as today. Cancel remains enabled
  and just closes the dialog; the pending record expires on its own.

`AccountList` subscribes to `storage.onChanged` on `local.accounts`, like
`QueueList` and `DraftList`, so a login completed after the dialog is gone
appears without reloading.

## 4. Manifest, site, mobile

- Content script declared statically for the callback URL. Install prompt
  gains "read and change your data on rmdes.github.io" on all browsers.
- Firefox manifest: `browser_specific_settings.gecko_android.strict_min_version = "120.0"`
  (first version whose `permissions.request` works on Android). Chrome ignores it.
- `<meta name="viewport" content="width=device-width, initial-scale=1">` in
  `entrypoints/popup/index.html` and `entrypoints/options/index.html`.
- Optional host permission model unchanged.

## 5. Error handling summary

| Failure                                | Where it surfaces                                  |
| -------------------------------------- | -------------------------------------------------- |
| Unknown or expired state               | Callback page text; debug log                      |
| Authorization server returned `error`  | Callback page text; dialog step if open            |
| Token exchange failed                  | Callback page text; dialog step if open; debug log |
| Server config fetch failed             | Debug log only; account is still added (as today)  |
| Options tab discarded mid-flow         | Nothing lost; account appears in list on return    |
| Extension not running on callback page | Page's own 4-second fallback text                  |

## 6. Testing

Unit (vitest, existing fake storage):

- `pickAuthFlow` truth table.
- `prepareAuth` produces the same URL and state handling `startAuth` did.
- Callback query parsing (extracted as a pure function the content script calls).
- Background handler: unknown state, expired state, server error, success
  (exchange mocked with `fetch`), double delivery of the same code refused.

E2E (Playwright, Chromium, mock server):

- New spec: enable `tabSignIn` via the options checkbox, add the mock account,
  with `context.route` serving `docs/site/callback.html` at the real callback
  URL so the content script injects. The mock authorization endpoint
  auto-approves and redirects to any `redirect_uri`, so the login tab lands on
  the callback page at once. Assert the account appears in the list, the
  dialog's token and config steps go green, and the callback tab is closed.
  Session storage exists on both targets (Chrome MV3; Firefox 115+, minimum
  here is 127).
- Existing add-account spec unchanged (identity path, parks on the prompt).

Device:

- Firefox for Android: Firefox Nightly on the phone, USB debugging, `adb`
  installed, `web-ext` added as a dev dependency, run
  `bunx web-ext run -t firefox-android --source-dir .output/firefox-mv2 --android-device <id>`.
  Document in CLAUDE.md. This is the only new dependency and it is tooling.
- Vivaldi Android: only via a store release; expected to remain blocked on
  its permission prompt until Vivaldi fixes it.

## 7. Out of scope, deliberately

- Making the identity flow fall back to the tab flow on rejection.
- Any change to when host permissions are requested.
- Notifications on sign-in completion.
- Resuming the dialog's step list after its tab was discarded.
