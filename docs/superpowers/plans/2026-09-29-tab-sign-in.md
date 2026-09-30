# Tab-based sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Plume sign in through an ordinary browser tab on browsers whose `identity.launchWebAuthFlow` is missing (Firefox for Android) or unwanted, while desktop keeps the identity popup.

**Architecture:** The IndieAuth request building is split out of `startAuth` and shared. The tab flow persists a pending record in `storage.session`, opens the authorization URL in a tab, and a content script on the callback page hands the code to the background script, which finishes the exchange and stores the account. The options dialog only watches storage to reflect the result, so a discarded options tab loses nothing.

**Tech Stack:** WXT 0.19 (MV3 Chrome, MV2 Firefox), Preact, TypeScript, Vitest with jsdom, Playwright E2E against `tests/fixtures/mock-server.ts`, Bun.

Spec: `docs/superpowers/specs/2026-09-29-tab-sign-in-design.md`.

## Global Constraints

- **Do not commit.** The repository owner commits after reviewing diffs (their CLAUDE.md). Leave every task's changes in the working tree and report the diff.
- Run unit tests only via `bun run test` (never bare `bun test`).
- Never touch the bare `chrome` global at runtime; import `browser` from `core/browser-api.ts`. Type-only `chrome.*` references are fine.
- Timestamps in storage are ISO 8601 strings from `new Date().toISOString()`.
- Diagnostics go through `core/logger.ts` (`log.error` / `log.warn` / `log.info`), passing the thrown value, never `console`.
- No new runtime dependencies. The only new dev dependency is `web-ext` (Task 10).
- Callback URL is exactly `https://rmdes.github.io/plume/callback.html`, derived from `CLIENT_ID` in code.
- Pending records expire after 10 minutes (`PENDING_AUTH_TTL_MS = 10 * 60 * 1000`).
- Checkbox copy: "Sign in using a browser tab instead of a popup window".
- Token-step copy on the tab flow: "Finish signing in at <host> in the tab that opened".
- Firefox minimum for Android: `gecko_android.strict_min_version = "120.0"`.
- Working directory: `/home/rmdes/plume/.claude/worktrees/fix+permission-prompt-stall`. E2E runs need `CHROME_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome` and a prior `bun run build`. Never `pkill -f mock-server.ts` from inside a command that itself contains that string.

## File map

| File                                                             | Responsibility                                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `core/auth-flow.ts` (new)                                        | `pickAuthFlow`: identity or tab, from prefs and capability                   |
| `core/indieauth.ts`                                              | `prepareAuth` extracted from `startAuth`; `startAuth` unchanged in behaviour |
| `core/auth-callback.ts` (new)                                    | `CALLBACK_URL`, `CallbackMessage`, `parseCallback`, `isCallbackMessage`      |
| `core/tab-auth.ts` (new)                                         | `completeTabAuth`: pure completion logic used by the background script       |
| `storage/defaults.ts`                                            | `tabSignIn` preference                                                       |
| `storage/pending-auth.ts` (new)                                  | `PendingAuthStore` over session storage                                      |
| `storage/index.ts`                                               | `pendingAuthStore()` factory                                                 |
| `entrypoints/callback.content.ts` (new)                          | Content script on the callback page                                          |
| `entrypoints/background.ts`                                      | `runtime.onMessage` wiring, tab close                                        |
| `entrypoints/options/AddAccountDialog.tsx`                       | Tab branch of `authorize`                                                    |
| `entrypoints/options/AccountList.tsx`                            | Checkbox; storage subscription                                               |
| `entrypoints/popup/index.html`, `entrypoints/options/index.html` | viewport meta                                                                |
| `wxt.config.ts`                                                  | `gecko_android`                                                              |
| `docs/site/callback.html` (new), `docs/site/index.html`          | Callback page; `redirect_uri` link                                           |
| `tests/e2e/tab-sign-in.spec.ts` (new)                            | End-to-end tab flow on Chromium                                              |
| `CLAUDE.md`, `CHANGELOG.md`, `README.md`, `PRIVACY.md`           | Docs                                                                         |

---

### Task 1: Flow picker

**Files:**

- Create: `core/auth-flow.ts`
- Test: `core/auth-flow.test.ts`

**Interfaces:**

- Produces: `type AuthFlowKind = "identity" | "tab"`; `pickAuthFlow(prefs: { tabSignIn?: boolean }, identityAvailable: boolean): AuthFlowKind`.

- [ ] **Step 1: Write the failing test**

```ts
// core/auth-flow.test.ts
import { describe, expect, it } from "vitest";
import { pickAuthFlow } from "./auth-flow";

describe("pickAuthFlow", () => {
  it("uses the identity flow when it is available and not overridden", () => {
    expect(pickAuthFlow({}, true)).toBe("identity");
    expect(pickAuthFlow({ tabSignIn: false }, true)).toBe("identity");
  });

  it("uses the tab flow when the identity API is missing", () => {
    expect(pickAuthFlow({}, false)).toBe("tab");
  });

  it("uses the tab flow when the user asked for it, even with identity available", () => {
    expect(pickAuthFlow({ tabSignIn: true }, true)).toBe("tab");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- core/auth-flow.test.ts`
Expected: FAIL, "Failed to resolve import ./auth-flow".

- [ ] **Step 3: Write the implementation**

```ts
// core/auth-flow.ts
export type AuthFlowKind = "identity" | "tab";

/**
 * Which sign-in flow to run.
 *
 * `identity.launchWebAuthFlow` gives desktop browsers a self-closing auth
 * window, but it does not exist on Firefox for Android and misbehaves on some
 * desktop Chromium forks, so the tab flow is taken whenever the API is absent
 * or the user asked for it in settings. No user-agent sniffing: capability
 * plus preference is the whole rule.
 */
export function pickAuthFlow(
  prefs: { tabSignIn?: boolean },
  identityAvailable: boolean,
): AuthFlowKind {
  return prefs.tabSignIn || !identityAvailable ? "tab" : "identity";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- core/auth-flow.test.ts`
Expected: PASS, 3 tests.

---

### Task 2: Extract `prepareAuth`

**Files:**

- Modify: `core/indieauth.ts:26-56` (the `startAuth` function)
- Test: `core/indieauth.test.ts`

**Interfaces:**

- Produces: `interface PreparedAuth { authUrl: string; state: string; verifier: string; endpoints: Endpoints }` (endpoints returned so `startAuth` does not resolve them a second time; changed after Task 2 review); `prepareAuth(args: PrepareAuthArgs): Promise<PreparedAuth>` where `PrepareAuthArgs = { siteUrl: string; clientId: string; redirectUri: string; scope: string; endpoints?: Endpoints }`.
- Consumes: existing `generatePKCE`, `discoverEndpoints`, `exchangeCode`.

- [ ] **Step 1: Write the failing test**

Append to `core/indieauth.test.ts`:

```ts
describe("prepareAuth", () => {
  const endpoints: Endpoints = {
    micropub: "https://rmendes.net/micropub",
    token_endpoint: "https://rmendes.net/auth/token",
    authorization_endpoint: "https://rmendes.net/auth",
  };

  it("builds the authorization URL with PKCE and a fresh state", async () => {
    const prepared = await prepareAuth({
      siteUrl: "https://rmendes.net/",
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scope: "create",
      endpoints,
    });
    const url = new URL(prepared.authUrl);
    expect(url.origin + url.pathname).toBe("https://rmendes.net/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe("create");
    expect(url.searchParams.get("me")).toBe("https://rmendes.net/");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe(prepared.state);
    expect(prepared.state).toMatch(/^[0-9a-f]{32}$/);
    expect(prepared.verifier.length).toBeGreaterThan(20);
  });

  it("rejects endpoints without authorization or token endpoint", async () => {
    await expect(
      prepareAuth({
        siteUrl: "https://rmendes.net/",
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        scope: "create",
        endpoints: { micropub: "https://rmendes.net/micropub" },
      }),
    ).rejects.toThrow(/authorization or token endpoint/);
  });
});
```

Add `prepareAuth` to the import line at the top of the test file:

```ts
import { type AuthLauncher, exchangeCode, prepareAuth, refreshToken, startAuth } from "./indieauth";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- core/indieauth.test.ts`
Expected: FAIL, `prepareAuth` is not exported.

- [ ] **Step 3: Refactor `startAuth`**

Replace `StartAuthArgs` and `startAuth` in `core/indieauth.ts` with:

```ts
export interface PrepareAuthArgs {
  siteUrl: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  /**
   * Endpoints already discovered by the caller. Callers that must inspect the
   * endpoints before authorizing — e.g. to request host permissions for a
   * delegated token endpoint — pass them here to avoid a second fetch of the
   * site. Omit to discover from `siteUrl`.
   */
  endpoints?: Endpoints;
}

export interface StartAuthArgs extends PrepareAuthArgs {
  launcher: AuthLauncher;
}

export interface PreparedAuth {
  authUrl: string;
  state: string;
  verifier: string;
}

/**
 * Everything before the user sees a login page: endpoint check, PKCE, state,
 * authorization URL. Shared by the identity flow (which awaits the redirect in
 * place) and the tab flow (which persists `state` and `verifier` and finishes
 * in the background script).
 */
export async function prepareAuth(args: PrepareAuthArgs): Promise<PreparedAuth> {
  const endpoints = args.endpoints ?? (await discoverEndpoints(args.siteUrl));
  if (!endpoints.authorization_endpoint || !endpoints.token_endpoint) {
    throw new Error(
      `Could not find authorization or token endpoint at ${args.siteUrl}. ` +
        "Ensure the site supports IndieAuth.",
    );
  }

  const pkce = await generatePKCE();
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authUrl = new URL(endpoints.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", args.clientId);
  authUrl.searchParams.set("redirect_uri", args.redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", args.scope);
  authUrl.searchParams.set("code_challenge", pkce.challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("me", args.siteUrl);

  return { authUrl: authUrl.toString(), state, verifier: pkce.verifier };
}

export async function startAuth(args: StartAuthArgs): Promise<TokenData> {
  const endpoints = args.endpoints ?? (await discoverEndpoints(args.siteUrl));
  const prepared = await prepareAuth({ ...args, endpoints });

  const redirectResult = await args.launcher(prepared.authUrl);
  const redirectUrl = new URL(redirectResult);
  const code = redirectUrl.searchParams.get("code");
  const returnedState = redirectUrl.searchParams.get("state");

  if (!code) throw new Error("Authorization response missing code");
  if (returnedState !== prepared.state) throw new Error("State mismatch — possible CSRF");

  return exchangeCode({
    code,
    verifier: prepared.verifier,
    redirectUri: args.redirectUri,
    clientId: args.clientId,
    endpoints,
  });
}
```

- [ ] **Step 4: Run the whole suite to verify nothing regressed**

Run: `bun run test`
Expected: PASS, all files, including the existing `startAuth` tests untouched.

- [ ] **Step 5: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0.

---

### Task 3: `tabSignIn` preference and its checkbox

**Files:**

- Modify: `storage/defaults.ts:12-18` and `:50-56`
- Modify: `entrypoints/options/AccountList.tsx`
- Test: `storage/defaults.test.ts`

**Interfaces:**

- Produces: `UserDefaults.tabSignIn?: boolean`; `DefaultsStore.setTabSignIn(value: boolean): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Append inside the `describe("DefaultsStore")` block in `storage/defaults.test.ts`:

```ts
it("tabSignIn is off until set", async () => {
  expect((await store.get()).tabSignIn).toBeUndefined();
  await store.setTabSignIn(true);
  expect((await store.get()).tabSignIn).toBe(true);
  await store.setTabSignIn(false);
  expect((await store.get()).tabSignIn).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- storage/defaults.test.ts`
Expected: FAIL, `store.setTabSignIn is not a function`.

- [ ] **Step 3: Add the field and setter**

In `storage/defaults.ts`, add to `UserDefaults`:

```ts
  /** Force the tab-based sign-in even where `identity.launchWebAuthFlow` exists. */
  tabSignIn?: boolean;
```

and after `setDebugLogging`:

```ts
  async setTabSignIn(value: boolean): Promise<void> {
    await this.patch({ tabSignIn: value });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- storage/defaults.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the checkbox to the accounts section**

In `entrypoints/options/AccountList.tsx`, change the imports to:

```tsx
import { useEffect, useState } from "preact/hooks";
import type { TokenData } from "../../core/types";
import { accountStore, defaultsStore } from "../../storage";
import { ExtensionToggles } from "./ExtensionToggles";
```

Add state and loading next to the existing state:

```tsx
const [tabSignIn, setTabSignIn] = useState(false);

async function refresh() {
  const store = accountStore();
  setAccounts(await store.list());
  setActiveDomain(await store.getDefaultDomain());
  setTabSignIn((await defaultsStore().get()).tabSignIn ?? false);
}

async function toggleTabSignIn(value: boolean) {
  setTabSignIn(value);
  await defaultsStore().setTabSignIn(value);
}
```

Render the checkbox directly after the `<header>` element, before the accounts list:

```tsx
<label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
  <input
    type="checkbox"
    checked={tabSignIn}
    onChange={(e) => void toggleTabSignIn((e.currentTarget as HTMLInputElement).checked)}
  />{" "}
  Sign in using a browser tab instead of a popup window
  <span style={{ display: "block", color: "#666", fontSize: 12 }}>
    Plume does this on its own where the browser has no sign-in window, such as Firefox for Android.
    Turn it on if the popup window never appears or closes at once.
  </span>
</label>
```

- [ ] **Step 6: Typecheck, lint, build**

Run: `bun run typecheck && bun run lint && bun run build`
Expected: all exit 0.

---

### Task 4: Pending-auth store

**Files:**

- Create: `storage/pending-auth.ts`
- Modify: `storage/index.ts`
- Test: `storage/pending-auth.test.ts`

**Interfaces:**

- Produces:
  ```ts
  interface PendingAuth { state: string; verifier: string; siteUrl: string; endpoints: Endpoints; redirectUri: string; clientId: string; createdAt: string }
  type AuthResult = { ok: true; domain: string; at: string } | { ok: false; error: string; at: string }
  class PendingAuthStore {
    constructor(storage: BrowserStorage, now?: () => number)
    put(record: Omit<PendingAuth, "createdAt">): Promise<void>
    take(state: string): Promise<PendingAuth | undefined>   // removes it; undefined if missing or expired
    setResult(state: string, result: Omit<AuthResult, "at">): Promise<void>
  }
  const PENDING_AUTH_TTL_MS = 10 * 60 * 1000
  pendingAuthKey(state) => `pendingAuth:${state}`; authResultKey(state) => `authResult:${state}`
  ```
- Factory: `pendingAuthStore(): PendingAuthStore` in `storage/index.ts`, backed by `sessionStorage()`.

- [ ] **Step 1: Write the failing test**

```ts
// storage/pending-auth.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { FakeBrowserStorage } from "./browser-storage";
import {
  authResultKey,
  PENDING_AUTH_TTL_MS,
  PendingAuthStore,
  pendingAuthKey,
} from "./pending-auth";

const record = {
  state: "abc",
  verifier: "v",
  siteUrl: "https://rmendes.net/",
  endpoints: {
    micropub: "https://rmendes.net/micropub",
    token_endpoint: "https://rmendes.net/auth/token",
  },
  redirectUri: "https://rmdes.github.io/plume/callback.html",
  clientId: "https://rmdes.github.io/plume/",
};

describe("PendingAuthStore", () => {
  let storage: FakeBrowserStorage;
  let now: number;
  let store: PendingAuthStore;

  beforeEach(() => {
    storage = new FakeBrowserStorage();
    now = Date.parse("2026-09-29T10:00:00Z");
    store = new PendingAuthStore(storage, () => now);
  });

  it("take returns the record once and then nothing", async () => {
    await store.put(record);
    const taken = await store.take("abc");
    expect(taken?.verifier).toBe("v");
    expect(taken?.createdAt).toBe("2026-09-29T10:00:00.000Z");
    expect(await store.take("abc")).toBeUndefined();
    expect(await storage.get(pendingAuthKey("abc"))).toBeUndefined();
  });

  it("take treats an expired record as absent and deletes it", async () => {
    await store.put(record);
    now += PENDING_AUTH_TTL_MS + 1;
    expect(await store.take("abc")).toBeUndefined();
    expect(await storage.get(pendingAuthKey("abc"))).toBeUndefined();
  });

  it("take returns nothing for an unknown state", async () => {
    expect(await store.take("nope")).toBeUndefined();
  });

  it("setResult records the outcome under its own key", async () => {
    await store.setResult("abc", { ok: false, error: "denied" });
    expect(await storage.get(authResultKey("abc"))).toEqual({
      ok: false,
      error: "denied",
      at: "2026-09-29T10:00:00.000Z",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- storage/pending-auth.test.ts`
Expected: FAIL, cannot resolve `./pending-auth`.

- [ ] **Step 3: Write the store**

```ts
// storage/pending-auth.ts
import type { Endpoints } from "../core/types";
import type { BrowserStorage } from "./browser-storage";

/** A sign-in that has left for the browser tab and not yet come back. */
export interface PendingAuth {
  state: string;
  verifier: string;
  siteUrl: string;
  endpoints: Endpoints;
  redirectUri: string;
  clientId: string;
  createdAt: string; // ISO 8601
}

export type AuthResult =
  | { ok: true; domain: string; at: string }
  | { ok: false; error: string; at: string };

/** A login the user has not finished within this long is abandoned. */
export const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;

export const pendingAuthKey = (state: string): string => `pendingAuth:${state}`;
export const authResultKey = (state: string): string => `authResult:${state}`;

/**
 * Lives in `storage.session`: in-memory, gone when the browser closes, which
 * is the right lifetime for a PKCE verifier. Keyed by `state` so the callback
 * can find its own record and nothing else.
 */
export class PendingAuthStore {
  constructor(
    private storage: BrowserStorage,
    private now: () => number = Date.now,
  ) {}

  async put(record: Omit<PendingAuth, "createdAt">): Promise<void> {
    const createdAt = new Date(this.now()).toISOString();
    await this.storage.set({ [pendingAuthKey(record.state)]: { ...record, createdAt } });
  }

  /**
   * Fetch and delete in one step, so a code can be exchanged at most once.
   * Expired records are deleted on sight rather than by a sweeper.
   */
  async take(state: string): Promise<PendingAuth | undefined> {
    const key = pendingAuthKey(state);
    const record = await this.storage.get<PendingAuth>(key);
    if (!record) return undefined;
    await this.storage.remove(key);
    const age = this.now() - new Date(record.createdAt).getTime();
    return age > PENDING_AUTH_TTL_MS ? undefined : record;
  }

  /** Lets a still-open options page show why a tab sign-in failed. */
  async setResult(state: string, result: Omit<AuthResult, "at">): Promise<void> {
    const at = new Date(this.now()).toISOString();
    await this.storage.set({ [authResultKey(state)]: { ...result, at } });
  }
}
```

- [ ] **Step 4: Add the factory**

In `storage/index.ts`, import the class alongside the others and add:

```ts
export { PendingAuthStore } from "./pending-auth";
export type { AuthResult, PendingAuth } from "./pending-auth";

let _pendingAuth: PendingAuthStore | null = null;
export function pendingAuthStore(): PendingAuthStore {
  if (!_pendingAuth) _pendingAuth = new PendingAuthStore(sessionStorage());
  return _pendingAuth;
}
```

Match how the other singletons in that file are declared (read it first; the pattern is a module-level `let _x` plus a factory function). Ensure `PendingAuthStore` is imported with a value import so the factory can construct it.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test -- storage/pending-auth.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0.

---

### Task 5: Callback parsing, content script, callback page

**Files:**

- Create: `core/auth-callback.ts`
- Create: `entrypoints/callback.content.ts`
- Create: `docs/site/callback.html`
- Modify: `docs/site/index.html:25-33` (redirect_uri links)
- Test: `core/auth-callback.test.ts`

**Interfaces:**

- Produces:

  ```ts
  const CALLBACK_URL: string   // new URL("callback.html", CLIENT_ID).href
  interface CallbackMessage { type: "indieauth-callback"; code?: string; state?: string; error?: string; errorDescription?: string }
  type CallbackReply = { ok: true; domain: string } | { ok: false; error: string }
  parseCallback(search: string): CallbackMessage
  isCallbackMessage(value: unknown): value is CallbackMessage
  ```

- [ ] **Step 1: Write the failing test**

```ts
// core/auth-callback.test.ts
import { describe, expect, it } from "vitest";
import { CALLBACK_URL, isCallbackMessage, parseCallback } from "./auth-callback";

describe("auth callback", () => {
  it("derives the callback URL from the client id", () => {
    expect(CALLBACK_URL).toBe("https://rmdes.github.io/plume/callback.html");
  });

  it("parses a successful redirect", () => {
    expect(parseCallback("?code=abc&state=xyz")).toEqual({
      type: "indieauth-callback",
      code: "abc",
      state: "xyz",
    });
  });

  it("parses an error redirect", () => {
    expect(
      parseCallback("?error=access_denied&error_description=User%20said%20no&state=xyz"),
    ).toEqual({
      type: "indieauth-callback",
      state: "xyz",
      error: "access_denied",
      errorDescription: "User said no",
    });
  });

  it("recognises its own messages and nothing else", () => {
    expect(isCallbackMessage({ type: "indieauth-callback" })).toBe(true);
    expect(isCallbackMessage({ type: "something-else" })).toBe(false);
    expect(isCallbackMessage(null)).toBe(false);
    expect(isCallbackMessage("indieauth-callback")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- core/auth-callback.test.ts`
Expected: FAIL, cannot resolve `./auth-callback`.

- [ ] **Step 3: Write the module**

```ts
// core/auth-callback.ts
import { CLIENT_ID } from "./auth-config";

/**
 * Where the tab-based sign-in lands. It sits on the client_id origin, which
 * IndieAuth accepts as a redirect target without allow-listing; the client_id
 * page lists it anyway for servers that check.
 */
export const CALLBACK_URL = new URL("callback.html", CLIENT_ID).href;

export interface CallbackMessage {
  type: "indieauth-callback";
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export type CallbackReply = { ok: true; domain: string } | { ok: false; error: string };

/** The authorization server's answer, read off the callback page's address. */
export function parseCallback(search: string): CallbackMessage {
  const params = new URLSearchParams(search);
  const message: CallbackMessage = { type: "indieauth-callback" };
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");
  if (code) message.code = code;
  if (state) message.state = state;
  if (error) message.error = error;
  if (errorDescription) message.errorDescription = errorDescription;
  return message;
}

export function isCallbackMessage(value: unknown): value is CallbackMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "indieauth-callback"
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- core/auth-callback.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the content script**

```ts
// entrypoints/callback.content.ts
import { type CallbackReply, CALLBACK_URL, parseCallback } from "../core/auth-callback";
import { browser } from "../core/browser-api";

/**
 * Runs only on Plume's own callback page. Hands the authorization server's
 * answer to the background script, which owns the pending sign-in, and
 * reports back into the page. It reads the address and writes one element;
 * nothing else on the page is touched.
 */
export default defineContentScript({
  matches: [`${CALLBACK_URL}*`],
  runAt: "document_end",
  async main() {
    const status = document.getElementById("status");
    const say = (text: string): void => {
      if (status) status.textContent = text;
    };
    try {
      const reply = (await browser.runtime.sendMessage(
        parseCallback(location.search),
      )) as CallbackReply;
      say(
        reply.ok
          ? `Connected ${reply.domain}. You can close this tab.`
          : `Sign-in failed: ${reply.error}`,
      );
    } catch (e) {
      say(`Plume could not finish signing in: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
});
```

`defineContentScript` is a WXT auto-import global, like `defineBackground` in `entrypoints/background.ts`; no import is needed.

- [ ] **Step 6: Write the callback page**

```html
<!-- docs/site/callback.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Plume — finishing sign-in</title>
    <meta name="robots" content="noindex" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family:
          system-ui,
          -apple-system,
          "Segoe UI",
          sans-serif;
        color: #1e293b;
        background: #f8fafc;
        padding: 24px;
        box-sizing: border-box;
      }
      main {
        max-width: 28rem;
        text-align: center;
      }
      h1 {
        font-size: 1.25rem;
        margin: 0 0 8px;
      }
      p {
        margin: 0;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>🪶 Plume</h1>
      <p id="status">Finishing sign-in…</p>
    </main>
    <!--
      The extension's content script replaces #status with the outcome. If it
      has not by now, the extension is not running on this page. The address
      carries the authorization code, so nothing from it is ever rendered.
    -->
    <script>
      setTimeout(function () {
        var status = document.getElementById("status");
        if (status && status.textContent === "Finishing sign-in…") {
          status.textContent = "Plume didn't respond. Is the extension installed and enabled?";
        }
      }, 4000);
    </script>
  </body>
</html>
```

- [ ] **Step 7: List the callback as a redirect URI on the client_id page**

In `docs/site/index.html`, directly after the Firefox `<link rel="redirect_uri" …allizom.org/" />` element, add:

```html
<!-- Tab-based sign-in (Firefox for Android, or "Sign in using a browser
         tab" in settings). Same origin as the client_id, so IndieAuth accepts
         it without this entry; listed for servers that check anyway. -->
<link rel="redirect_uri" href="https://rmdes.github.io/plume/callback.html" />
```

- [ ] **Step 8: Build and check the content script landed in both manifests**

Run: `bun run build && bun run build:firefox`
Then: `python3 -c "import json; [print(t, json.load(open(f'.output/{t}/manifest.json')).get('content_scripts')) for t in ('chrome-mv3','firefox-mv2')]"`
Expected: both print a list with one entry whose `matches` is `["https://rmdes.github.io/plume/callback.html*"]` and `run_at` is `document_end`.

- [ ] **Step 9: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0. If Prettier reformats `docs/site/callback.html`, accept its formatting.

---

### Task 6: Background completion

**Files:**

- Create: `core/tab-auth.ts`
- Modify: `entrypoints/background.ts` (imports; new listener after the `storage.onChanged` listener; `handleImagePost` dynamic import)
- Test: `core/tab-auth.test.ts`

**Interfaces:**

- Consumes: `PendingAuthStore` (Task 4), `CallbackMessage` / `CallbackReply` (Task 5), `exchangeCode` (existing), `AccountStore`, `fetchAndCacheServerConfig`.
- Produces:

  ```ts
  interface TabAuthDeps { pending: PendingAuthStore; accounts: AccountStore; fetchConfig: (accounts: AccountStore, domain: string) => Promise<unknown> }
  completeTabAuth(message: CallbackMessage, deps: TabAuthDeps): Promise<CallbackReply>
  ```

- [ ] **Step 1: Write the failing test**

```ts
// core/tab-auth.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "../storage/accounts";
import { FakeBrowserStorage } from "../storage/browser-storage";
import { PendingAuthStore } from "../storage/pending-auth";
import { completeTabAuth } from "./tab-auth";

const record = {
  state: "st",
  verifier: "ver",
  siteUrl: "https://rmendes.net/",
  endpoints: {
    micropub: "https://rmendes.net/micropub",
    token_endpoint: "https://rmendes.net/auth/token",
    authorization_endpoint: "https://rmendes.net/auth",
  },
  redirectUri: "https://rmdes.github.io/plume/callback.html",
  clientId: "https://rmdes.github.io/plume/",
};

function tokenResponse() {
  return new Response(
    JSON.stringify({
      me: "https://rmendes.net/",
      access_token: "tok",
      scope: "create",
      expires_in: 3600,
    }),
  );
}

describe("completeTabAuth", () => {
  let session: FakeBrowserStorage;
  let local: FakeBrowserStorage;
  let pending: PendingAuthStore;
  let accounts: AccountStore;
  let fetchConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    session = new FakeBrowserStorage();
    local = new FakeBrowserStorage();
    pending = new PendingAuthStore(session);
    accounts = new AccountStore(local);
    fetchConfig = vi.fn().mockResolvedValue({});
  });

  it("exchanges the code, stores the account, fetches config, and replies with the domain", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(tokenResponse());
    await pending.put(record);

    const reply = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "st" },
      { pending, accounts, fetchConfig },
    );

    expect(reply).toEqual({ ok: true, domain: "rmendes.net" });
    expect((await accounts.get("rmendes.net"))?.access_token).toBe("tok");
    expect(fetchConfig).toHaveBeenCalledWith(accounts, "rmendes.net");
    const body = (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string;
    expect(body).toContain("code=CODE");
    expect(body).toContain("code_verifier=ver");
  });

  it("refuses an unknown state without touching the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const reply = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "unknown" },
      { pending, accounts, fetchConfig },
    );
    expect(reply.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a message with no state", async () => {
    const reply = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE" },
      { pending, accounts, fetchConfig },
    );
    expect(reply.ok).toBe(false);
  });

  it("refuses the same code a second time", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(tokenResponse());
    await pending.put(record);
    const first = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "st" },
      { pending, accounts, fetchConfig },
    );
    const second = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "st" },
      { pending, accounts, fetchConfig },
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it("surfaces the server's error and records it for the dialog", async () => {
    await pending.put(record);
    const reply = await completeTabAuth(
      {
        type: "indieauth-callback",
        state: "st",
        error: "access_denied",
        errorDescription: "You said no",
      },
      { pending, accounts, fetchConfig },
    );
    expect(reply).toEqual({ ok: false, error: "You said no" });
    expect(await session.get("authResult:st")).toMatchObject({ ok: false, error: "You said no" });
    expect(await session.get("pendingAuth:st")).toBeUndefined();
  });

  it("reports a failed exchange and records it for the dialog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );
    await pending.put(record);
    const reply = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "st" },
      { pending, accounts, fetchConfig },
    );
    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.error).toMatch(/invalid_grant/);
    expect(await session.get("authResult:st")).toMatchObject({ ok: false });
    expect(await accounts.get("rmendes.net")).toBeUndefined();
  });

  it("still succeeds when the config fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(tokenResponse());
    fetchConfig.mockRejectedValue(new Error("config down"));
    await pending.put(record);
    const reply = await completeTabAuth(
      { type: "indieauth-callback", code: "CODE", state: "st" },
      { pending, accounts, fetchConfig },
    );
    expect(reply).toEqual({ ok: true, domain: "rmendes.net" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- core/tab-auth.test.ts`
Expected: FAIL, cannot resolve `./tab-auth`.

- [ ] **Step 3: Write the completion logic**

```ts
// core/tab-auth.ts
import type { AccountStore } from "../storage/accounts";
import type { PendingAuthStore } from "../storage/pending-auth";
import type { CallbackMessage, CallbackReply } from "./auth-callback";
import { exchangeCode } from "./indieauth";
import { log } from "./logger";

export interface TabAuthDeps {
  pending: PendingAuthStore;
  accounts: AccountStore;
  fetchConfig: (accounts: AccountStore, domain: string) => Promise<unknown>;
}

const NO_PENDING = "No sign-in in progress. Start again from Plume's settings.";

/**
 * Finish a tab-based sign-in from the callback page's message. Runs in the
 * background script so it survives the options tab being discarded, which
 * mobile browsers do while the user is away on the login tab.
 *
 * The pending record is taken (fetched and deleted) before anything else, so
 * a replayed message finds nothing and a code is exchanged at most once.
 */
export async function completeTabAuth(
  message: CallbackMessage,
  deps: TabAuthDeps,
): Promise<CallbackReply> {
  const record = message.state ? await deps.pending.take(message.state) : undefined;
  if (!record) {
    // Expired, replayed, or never ours. The state is not a secret but is
    // useless to a reader, so only the fact is recorded.
    log.warn("tab sign-in callback with no pending record");
    return { ok: false, error: NO_PENDING };
  }

  if (message.error) {
    const error = message.errorDescription || message.error;
    await deps.pending.setResult(record.state, { ok: false, error });
    return { ok: false, error };
  }
  if (!message.code) {
    const error = "Authorization response missing code";
    await deps.pending.setResult(record.state, { ok: false, error });
    return { ok: false, error };
  }

  try {
    const token = await exchangeCode({
      code: message.code,
      verifier: record.verifier,
      redirectUri: record.redirectUri,
      clientId: record.clientId,
      endpoints: record.endpoints,
    });
    await deps.accounts.add(token);
    const domain = new URL(token.me).hostname;
    log.info("account connected", { domain, flow: "tab" });
    // Non-fatal, as in the dialog: the account is usable and the popup
    // refetches config on every open.
    try {
      await deps.fetchConfig(deps.accounts, domain);
    } catch (e) {
      log.warn("server config fetch after tab sign-in failed", e);
    }
    return { ok: true, domain };
  } catch (e) {
    log.error("tab sign-in failed", e);
    const error = e instanceof Error ? e.message : String(e);
    await deps.pending.setResult(record.state, { ok: false, error });
    return { ok: false, error };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- core/tab-auth.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire the listener into the background script**

In `entrypoints/background.ts`:

Add imports:

```ts
import { CALLBACK_URL, isCallbackMessage } from "../core/auth-callback";
import { fetchAndCacheServerConfig } from "../core/server-config";
import { completeTabAuth } from "../core/tab-auth";
```

and add `pendingAuthStore` to the `../storage` import list.

Inside `defineBackground`, after the `browser.storage.onChanged.addListener(...)` block, add:

```ts
// Tab-based sign-in: the callback page's content script sends the
// authorization server's answer here. Only Plume's own content script on
// Plume's own callback page is heard; anything else is ignored.
browser.runtime.onMessage.addListener(
  (message: unknown, sender: chrome.runtime.MessageSender, sendResponse) => {
    if (!isCallbackMessage(message)) return false;
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(CALLBACK_URL)) {
      return false;
    }
    (async () => {
      const reply = await completeTabAuth(message, {
        pending: pendingAuthStore(),
        accounts: accountStore(),
        fetchConfig: fetchAndCacheServerConfig,
      });
      sendResponse(reply);
      if (reply.ok && sender.tab?.id !== undefined) {
        await browser.tabs.remove(sender.tab.id);
      }
    })().catch((e) => {
      log.error("tab sign-in handler failed", e);
      sendResponse({ ok: false, error: "Plume hit an unexpected error. See the debug log." });
    });
    // Keeps the message channel open for the async reply, on both engines.
    return true;
  },
);
```

Then in `handleImagePost`, replace the dynamic import:

```ts
const { fetchAndCacheServerConfig } = await import("../core/server-config");
const domain = new URL(account.me).hostname;
const config = await fetchAndCacheServerConfig(accountStore(), domain);
```

with the static import already added:

```ts
const domain = new URL(account.me).hostname;
const config = await fetchAndCacheServerConfig(accountStore(), domain);
```

(The CLAUDE.md rule: no `await import()` of a module the same bundle now imports statically.)

- [ ] **Step 6: Typecheck, lint, build**

Run: `bun run typecheck && bun run lint && bun run build`
Expected: all exit 0 and no Vite warning about a mixed dynamic/static import of `server-config`.

---

### Task 7: Dialog tab branch and live account list

**Files:**

- Modify: `entrypoints/options/AddAccountDialog.tsx` (imports; `authorize`)
- Modify: `entrypoints/options/AccountList.tsx` (storage subscription)

**Interfaces:**

- Consumes: `pickAuthFlow` (Task 1), `prepareAuth` (Task 2), `defaultsStore().get().tabSignIn` (Task 3), `pendingAuthStore()` and `authResultKey` (Task 4), `CALLBACK_URL` (Task 5).

- [ ] **Step 1: Add imports to `AddAccountDialog.tsx`**

Change the import block to:

```tsx
import { useState } from "preact/hooks";
import { CALLBACK_URL } from "../../core/auth-callback";
import { CLIENT_ID, DEFAULT_SCOPE, getRedirectUri } from "../../core/auth-config";
import { pickAuthFlow } from "../../core/auth-flow";
import { chromeIdentityLauncher } from "../../core/auth-launcher";
import { browser } from "../../core/browser-api";
import { log } from "../../core/logger";
import { discoverEndpoints, endpointOrigins } from "../../core/discovery";
import { prepareAuth, startAuth } from "../../core/indieauth";
import { fetchAndCacheServerConfig } from "../../core/server-config";
import type { Endpoints } from "../../core/types";
import { accountStore, defaultsStore, pendingAuthStore } from "../../storage";
import { authResultKey, type AuthResult } from "../../storage/pending-auth";
```

- [ ] **Step 2: Add the wait helper above the component**

Place after the `PROMPT_STALL_HINT` constant:

```tsx
/**
 * Resolves when the background script has stored a new account, rejects when
 * it has recorded a failure for this sign-in. Watches storage rather than
 * holding a promise across the tab switch, because on mobile this page may
 * be discarded meanwhile — in which case nobody is waiting and the account
 * simply appears in the list on return.
 */
function waitForTabAuth(state: string): Promise<void> {
  return new Promise((resolve, reject) => {
    function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string): void {
      if (area === "local" && changes.accounts) {
        const before = Object.keys((changes.accounts.oldValue as object | undefined) ?? {});
        const after = Object.keys((changes.accounts.newValue as object | undefined) ?? {});
        if (after.some((domain) => !before.includes(domain))) {
          browser.storage.onChanged.removeListener(onChanged);
          resolve();
        }
      }
      if (area === "session") {
        const result = changes[authResultKey(state)]?.newValue as AuthResult | undefined;
        if (result && !result.ok) {
          browser.storage.onChanged.removeListener(onChanged);
          reject(new Error(result.error));
        }
      }
    }
    browser.storage.onChanged.addListener(onChanged);
  });
}
```

- [ ] **Step 3: Branch `authorize`**

Replace the `authorize` function with:

```tsx
async function authorize(siteUrl: string, endpoints: Endpoints) {
  const identityAvailable = typeof browser.identity?.launchWebAuthFlow === "function";
  const flow = pickAuthFlow(await defaultsStore().get(), identityAvailable);
  if (flow === "tab") {
    await authorizeInTab(siteUrl, endpoints);
    return;
  }

  const token = await runStep("token", () =>
    startAuth({
      siteUrl,
      clientId: CLIENT_ID,
      redirectUri: getRedirectUri(),
      scope: DEFAULT_SCOPE,
      launcher: chromeIdentityLauncher,
      endpoints,
    }),
  );
  await accountStore().add(token);
  log.info("account connected", { domain: new URL(token.me).hostname });
  onAdded();

  // Non-fatal: the account is already usable, and the popup refetches config
  // on every open. Surfacing the failure beats blocking sign-in on it.
  let configOk = true;
  try {
    await runStep("config", () =>
      fetchAndCacheServerConfig(accountStore(), new URL(token.me).hostname),
    );
  } catch {
    configOk = false;
  }

  setFinished(true);
  if (configOk) {
    setTimeout(onClose, 700);
  }
}

/**
 * The login happens in an ordinary tab and is finished by the background
 * script (see core/tab-auth.ts), which also loads server config. This page
 * only prepares the request and watches for the outcome.
 */
async function authorizeInTab(siteUrl: string, endpoints: Endpoints) {
  const host = new URL(siteUrl).hostname;
  await runStep("token", async () => {
    const prepared = await prepareAuth({
      siteUrl,
      clientId: CLIENT_ID,
      redirectUri: CALLBACK_URL,
      scope: DEFAULT_SCOPE,
      endpoints,
    });
    await pendingAuthStore().put({
      state: prepared.state,
      verifier: prepared.verifier,
      siteUrl,
      endpoints,
      redirectUri: CALLBACK_URL,
      clientId: CLIENT_ID,
    });
    // Subscribe before the tab opens so a fast server cannot beat us to it.
    const outcome = waitForTabAuth(prepared.state);
    patchStep("token", { detail: `Finish signing in at ${host} in the tab that opened` });
    await browser.tabs.create({ url: prepared.authUrl });
    await outcome;
  });
  // Config is the background's job on this flow and non-fatal there, as
  // it is non-fatal here on the identity flow.
  patchStep("config", { state: "done" });
  onAdded();
  setFinished(true);
  setTimeout(onClose, 700);
}
```

Note `runStep` sets `detail: undefined` when a step starts, so the `patchStep` for the detail must come after `runStep` has begun, which it does here.

- [ ] **Step 4: Subscribe the account list to storage**

In `entrypoints/options/AccountList.tsx`, add the `browser` import:

```tsx
import { browser } from "../../core/browser-api";
```

and replace the `useEffect` with:

```tsx
useEffect(() => {
  refresh();
  // A tab-based sign-in is completed by the background script, possibly
  // after this page was discarded and reopened, so the list must follow
  // storage rather than wait for the dialog to tell it.
  function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string): void {
    if (area === "local" && ("accounts" in changes || "defaults" in changes)) void refresh();
  }
  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
}, []);
```

- [ ] **Step 5: Typecheck, lint, unit tests, build**

Run: `bun run typecheck && bun run lint && bun run test && bun run build`
Expected: all exit 0.

- [ ] **Step 6: Run the existing add-account E2E to confirm the identity path is unchanged**

Run: `CHROME_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome bun run test:e2e -- tests/e2e/add-account-steps.spec.ts`
Expected: 1 passed (chromium), 1 skipped (firefox).

---

### Task 8: Manifest and viewport

**Files:**

- Modify: `wxt.config.ts:83-95` (`browser_specific_settings`)
- Modify: `entrypoints/popup/index.html`, `entrypoints/options/index.html`

- [ ] **Step 1: Add `gecko_android`**

In `wxt.config.ts`, inside `browser_specific_settings`, after the `gecko: { ... }` object:

```ts
      // Lists Plume as Android-compatible on AMO. 120 is the first Firefox for
      // Android whose permissions.request works; identity does not exist
      // there at all, which is what the tab sign-in is for.
      gecko_android: {
        strict_min_version: "120.0",
      },
```

- [ ] **Step 2: Add the viewport meta tags**

In both `entrypoints/popup/index.html` and `entrypoints/options/index.html`, directly after `<meta charset="utf-8" />`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

- [ ] **Step 3: Build both targets and inspect the manifests**

Run: `bun run build && bun run build:firefox`
Then: `python3 -c "import json; m=json.load(open('.output/firefox-mv2/manifest.json')); print(m['browser_specific_settings']); print(m.get('content_scripts'))"`
Expected: `browser_specific_settings` contains both `gecko` (with `id`, `strict_min_version`, `data_collection_permissions`) and `gecko_android` with `strict_min_version: '120.0'`; `content_scripts` lists the callback script.
Then: `python3 -c "import json; m=json.load(open('.output/chrome-mv3/manifest.json')); print(m.get('content_scripts')); print(m.get('optional_host_permissions'))"`
Expected: the callback content script, and `['<all_urls>']` unchanged.

- [ ] **Step 4: Lint**

Run: `bun run lint`
Expected: exit 0.

---

### Task 9: End-to-end test of the tab flow

**Files:**

- Create: `tests/e2e/tab-sign-in.spec.ts`

**Interfaces:**

- Consumes: `launchWithExtension`, `getExtensionId` from `tests/e2e/helpers.ts`; the mock server on `http://localhost:18750` (auto-approves `/auth` and redirects to any `redirect_uri`); the checkbox label from Task 3.

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/tab-sign-in.spec.ts
import { expect, test } from "@playwright/test";
import { getExtensionId, launchWithExtension } from "./helpers";

const CALLBACK = "https://rmdes.github.io/plume/callback.html";

test("tab sign-in connects an account without the identity window", async ({ browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox extension loading uses different harness — see tests/e2e/README.md",
  );
  const ctx = await launchWithExtension("chromium");
  const extId = await getExtensionId(ctx);

  // The real callback page is on GitHub Pages; serve the checked-in copy at
  // that address so the content script (matched by URL) injects offline.
  await ctx.route(`${CALLBACK}*`, (route) =>
    route.fulfill({ path: "docs/site/callback.html", contentType: "text/html" }),
  );

  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await opts.getByLabel("Sign in using a browser tab instead of a popup window").check();

  await opts.getByRole("button", { name: "+ Add account" }).click();
  await opts.getByLabel("Your site URL").fill("http://localhost:18750/");
  const loginTab = ctx.waitForEvent("page");
  await opts.getByRole("button", { name: "Authorize" }).click();

  // The mock authorization endpoint auto-approves, so the tab lands on the
  // callback page at once; the background finishes the exchange and closes it.
  const tab = await loginTab;
  await expect.poll(() => tab.isClosed(), { timeout: 10_000 }).toBe(true);

  const dialog = opts.getByRole("dialog", { name: "Add Micropub account" });
  await expect(dialog).toBeHidden({ timeout: 5000 });
  await expect(opts.getByText("localhost")).toBeVisible();

  await ctx.close();
});
```

- [ ] **Step 2: Build and run it**

Run: `bun run build && CHROME_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome bun run test:e2e -- tests/e2e/tab-sign-in.spec.ts`
Expected: 1 passed (chromium), 1 skipped (firefox).

If it fails at the permission step: the helper already adds `http://localhost:18750/*` to `host_permissions`, so `permissions.request` for that origin resolves without a prompt. If it fails because the tab never closes, open the options page's debug log (turn on "Record everything" first) or run with `PWDEBUG=1` and read the callback tab's `#status` text; it carries the background's reply.

- [ ] **Step 3: Run the full E2E suite**

Run: `CHROME_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome bun run test:e2e`
Expected: every chromium test passes; firefox tests skipped.

---

### Task 10: Docs, changelog, device-test tooling

**Files:**

- Modify: `CHANGELOG.md` (Unreleased)
- Modify: `CLAUDE.md` (architecture tree, a "Tab-based sign-in" section under MV3 specifics, Known gotchas, commands)
- Modify: `README.md`, `PRIVACY.md`, `docs/site/privacy.html` where they list permissions or data access
- Modify: `package.json` (dev dependency)

- [ ] **Step 1: Changelog**

Under `## [Unreleased]`, add an `### Added` section above the existing `### Fixed`:

```markdown
### Added

- **Sign in through a browser tab where the browser has no sign-in window.** Firefox for Android has no `identity` API at all, so Plume could not log in there. Sign-in now runs in an ordinary tab whenever that API is missing, or when "Sign in using a browser tab instead of a popup window" is turned on in settings, which also helps on desktop browsers whose sign-in window closes at once. The login lands on `https://rmdes.github.io/plume/callback.html`, on the same origin as Plume's client id, where a content script scoped to that one page hands the result to the extension; the exchange finishes in the background so a discarded settings tab loses nothing, and the new account is in the list when you return. Desktop Chrome and Firefox keep the popup window they had. The install prompt gains one line for that page. The Firefox listing now declares Android compatibility (Firefox 120 or later).
```

- [ ] **Step 2: CLAUDE.md**

In the architecture tree under `core/`, add lines (keep the alphabetical order and column alignment used there):

```
├── auth-callback.ts      Callback URL, message shape, parseCallback (tab sign-in)
├── auth-flow.ts          pickAuthFlow: identity window vs browser tab
├── tab-auth.ts           completeTabAuth — background half of the tab sign-in
```

Under `storage/`: `├── pending-auth.ts       PendingAuthStore — in-flight tab sign-ins in storage.session`.

Under `entrypoints/`: `├── callback.content.ts   Content script on the callback page (tab sign-in only)`.

Add a section after "### `?popout=1` mode":

```markdown
### Tab-based sign-in

`identity.launchWebAuthFlow` does not exist on Firefox for Android and is
flaky on some desktop Chromium forks, so `AddAccountDialog` picks a flow with
`pickAuthFlow(defaults, identityAvailable)`: the identity window when the API
exists and the user has not turned on "Sign in using a browser tab", otherwise
a plain tab. The tab flow is split across contexts on purpose:

1. Options page: `prepareAuth` builds the URL, `pendingAuthStore().put()` saves
   state + verifier in `storage.session`, `tabs.create` opens the login. The
   page only watches storage afterwards; mobile browsers discard it freely.
2. `docs/site/callback.html` (redirect URI, same origin as `CLIENT_ID`):
   `entrypoints/callback.content.ts` reads the query and messages the
   background.
3. Background: `completeTabAuth` takes the pending record (get + delete, so a
   code is exchanged once), exchanges, stores the account, fetches config,
   replies, closes the tab.

Never hold the login across the tab switch in page memory. Spec:
`docs/superpowers/specs/2026-09-29-tab-sign-in-design.md`.
```

Under Known gotchas, add:

```markdown
- **Testing on Firefox for Android needs a phone and web-ext.** Install Firefox Nightly on the device, enable USB debugging and "Remote debugging via USB" in Firefox settings, have `adb` on the machine, then `bun run build:firefox && bunx web-ext run -t firefox-android --source-dir .output/firefox-mv2 --android-device <adb device id> --firefox-apk org.mozilla.fenix`. Inspect via `about:debugging` on desktop Firefox. Vivaldi Android can only be tried through a store release.
```

- [ ] **Step 3: README, PRIVACY, privacy page**

Run: `grep -n -i "permission\|identity\|redirect" README.md PRIVACY.md docs/site/privacy.html | head -40`
Wherever install permissions or data access are enumerated, add one sentence: "Plume also runs a small script on its own sign-in callback page, `https://rmdes.github.io/plume/callback.html`, to read the sign-in result from that page's address and hand it to the extension. It runs nowhere else." If none of the three files enumerates permissions, change nothing and say so in the task report.

- [ ] **Step 4: Add web-ext as a dev dependency**

Run: `bun add -d web-ext`
Expected: `package.json` gains `"web-ext"` under `devDependencies` and the lockfile updates. Do not run it; the device loop is manual.

- [ ] **Step 5: Format and final checks**

Run: `bun run lint:fix && bun run typecheck && bun run test && bun run build && bun run build:firefox`
Expected: all exit 0; unit test count is the previous total (164) plus 21 new tests (3 + 2 + 1 + 4 + 4 + 7), so 185.

- [ ] **Step 6: Report**

Show `git status --short` and `git diff --stat`. Do not commit.
