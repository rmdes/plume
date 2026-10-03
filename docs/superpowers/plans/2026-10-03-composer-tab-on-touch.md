# Composer in a tab on touch-only devices — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On touch-only devices the Plume icon opens the composer as a tab instead of the toolbar popup, which Chromium on Android dismisses when the keyboard appears; a settings checkbox forces either surface.

**Architecture:** A three-way preference (`undefined` / `true` / `false`) decides the surface via a pure function. Applying it means clearing or restoring the action's popup; with no popup the icon tap fires `action.onClicked` in the background, which opens the existing `popup.html?popout=1` tab. The popup redirects itself once on a touch-only device, the checkbox applies on change, and the background re-applies on install and startup so updates cannot undo it.

**Tech Stack:** WXT 0.19 (MV3 Chrome, MV2 Firefox), Preact, TypeScript, Vitest with jsdom, Playwright E2E, Bun.

Spec: `docs/superpowers/specs/2026-10-03-composer-tab-on-touch-design.md`.

## Global Constraints

- **Do not commit.** The repository owner commits. Leave each task's changes in the working tree.
- Unit tests only via `bun run test` (never bare `bun test`).
- Never touch the bare `chrome` global at runtime; import `browser` and `action` from `core/browser-api.ts`. Type-only `chrome.*` references are fine. E2E specs run in the page context and may use `chrome.*` inside `evaluate`, as the existing specs do.
- Diagnostics via `core/logger.ts` (`log.warn` etc.), never `console`.
- No new dependencies.
- Media query is exactly `(hover: none) and (pointer: coarse)`.
- Checkbox copy: "Open the composer in a tab instead of the toolbar popup", with the note "Plume does this on its own on touch-only devices, where the popup closes as soon as the keyboard appears."
- Preference: `UserDefaults.composerInTab?: boolean`; `undefined` = automatic, `true` = tab, `false` = popup.
- Working directory: `/home/rmdes/plume/.claude/worktrees/fix+composer-tab-on-touch`. E2E needs `bun run build` first and `CHROME_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`. If port 18750 is held by a stale process, find it with `lsof -i :18750` and kill that PID by number; never `pkill -f` with the server's filename.

## File map

| File                                       | Responsibility                                                        |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `core/composer-surface.ts` (new)           | `TOUCH_ONLY_QUERY`, `shouldOpenComposerInTab`, `applyComposerSurface` |
| `storage/defaults.ts`                      | `composerInTab` preference + setter                                   |
| `entrypoints/background.ts`                | `openComposerTab()`, `action.onClicked`, re-apply on install/startup  |
| `entrypoints/popup/main.tsx`               | One-time redirect on touch-only devices                               |
| `entrypoints/options/AccountList.tsx`      | Checkbox                                                              |
| `tests/e2e/composer-surface.spec.ts` (new) | Checkbox round-trip through `action.getPopup`                         |
| `CHANGELOG.md`, `CLAUDE.md`                | Docs                                                                  |

---

### Task 1: Decision function and surface applier

**Files:**

- Create: `core/composer-surface.ts`
- Test: `core/composer-surface.test.ts`

**Interfaces:**

- Produces: `TOUCH_ONLY_QUERY: string`; `shouldOpenComposerInTab(pref: boolean | undefined, touchOnly: boolean): boolean`; `applyComposerSurface(inTab: boolean): Promise<void>`.
- Consumes: `action` from `core/browser-api.ts`, `log` from `core/logger.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// core/composer-surface.test.ts
import { describe, expect, it } from "vitest";
import { shouldOpenComposerInTab, TOUCH_ONLY_QUERY } from "./composer-surface";

describe("shouldOpenComposerInTab", () => {
  it("follows the device when there is no preference", () => {
    expect(shouldOpenComposerInTab(undefined, true)).toBe(true);
    expect(shouldOpenComposerInTab(undefined, false)).toBe(false);
  });

  it("an explicit preference wins over the device", () => {
    expect(shouldOpenComposerInTab(true, false)).toBe(true);
    expect(shouldOpenComposerInTab(true, true)).toBe(true);
    expect(shouldOpenComposerInTab(false, true)).toBe(false);
    expect(shouldOpenComposerInTab(false, false)).toBe(false);
  });

  it("matches touch-only devices, not touch screens with a mouse", () => {
    expect(TOUCH_ONLY_QUERY).toBe("(hover: none) and (pointer: coarse)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- core/composer-surface.test.ts`
Expected: FAIL, cannot resolve `./composer-surface`.

- [ ] **Step 3: Write the module**

```ts
// core/composer-surface.ts
import { action } from "./browser-api";
import { log } from "./logger";

/**
 * Phones and tablets match; a laptop with a mouse or trackpad does not, even
 * if it has a touch screen. This is the only device signal Plume uses — no
 * user-agent inspection.
 */
export const TOUCH_ONLY_QUERY = "(hover: none) and (pointer: coarse)";

/**
 * Where the composer opens when the toolbar icon is tapped.
 *
 * Chromium dismisses an action popup the moment focus leaves it, and on
 * Android the soft keyboard appearing counts, so the popup closes as soon as
 * the textarea is touched. The pop-out tab is not dismissed, so touch-only
 * devices get it by default. An explicit preference (the settings checkbox)
 * wins either way.
 */
export function shouldOpenComposerInTab(pref: boolean | undefined, touchOnly: boolean): boolean {
  return pref ?? touchOnly;
}

/**
 * Clearing the action's popup makes the icon tap (and the `_execute_action`
 * shortcut) fire `action.onClicked` in the background, which opens the tab.
 * Restoring it brings the toolbar popup back. Failure is logged and
 * otherwise ignored: the worst case is the previous surface.
 */
export async function applyComposerSurface(inTab: boolean): Promise<void> {
  try {
    await action.setPopup({ popup: inTab ? "" : "popup.html" });
  } catch (e) {
    log.warn("could not switch the composer surface", e);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- core/composer-surface.test.ts`
Expected: PASS, 3 tests. (`action` is `undefined` under jsdom but is only touched inside `applyComposerSurface`, which the test does not call.)

- [ ] **Step 5: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0.

---

### Task 2: `composerInTab` preference

**Files:**

- Modify: `storage/defaults.ts` (interface and class)
- Test: `storage/defaults.test.ts`

**Interfaces:**

- Produces: `UserDefaults.composerInTab?: boolean`; `DefaultsStore.setComposerInTab(value: boolean): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Append inside the `describe("DefaultsStore")` block in `storage/defaults.test.ts`:

```ts
it("composerInTab is automatic (undefined) until set", async () => {
  expect((await store.get()).composerInTab).toBeUndefined();
  await store.setComposerInTab(true);
  expect((await store.get()).composerInTab).toBe(true);
  await store.setComposerInTab(false);
  expect((await store.get()).composerInTab).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- storage/defaults.test.ts`
Expected: FAIL, `store.setComposerInTab is not a function`.

- [ ] **Step 3: Add the field and setter**

In `storage/defaults.ts`, add to `UserDefaults` after `tabSignIn`:

```ts
  /**
   * Where the toolbar icon opens the composer: `true` a tab, `false` the
   * popup, unset means "decide from the device" (touch-only → tab).
   */
  composerInTab?: boolean;
```

and after `setTabSignIn`:

```ts
  async setComposerInTab(value: boolean): Promise<void> {
    await this.patch({ composerInTab: value });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- storage/defaults.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0.

---

### Task 3: Background — icon click opens the tab, preference survives updates

**Files:**

- Modify: `entrypoints/background.ts` (imports; `onInstalled`; `onStartup`; new `action.onClicked` listener; `openPopupSafe`)

**Interfaces:**

- Consumes: `applyComposerSurface` (Task 1); `defaultsStore().get().composerInTab` (Task 2); `action`, `browser` from `core/browser-api.ts`.
- Produces: module-level `openComposerTab(): Promise<void>` used by `openPopupSafe` and `action.onClicked`.

- [ ] **Step 1: Add the import**

In `entrypoints/background.ts` add, keeping the import block alphabetical by path:

```ts
import { applyComposerSurface } from "../core/composer-surface";
```

- [ ] **Step 2: Extract the tab opener**

Replace the existing `openPopupSafe` function (near the end of the file) with:

```ts
/**
 * The composer as a full tab. Used when the toolbar popup is switched off
 * (touch-only devices, or the settings checkbox) and as the fallback when the
 * browser cannot show a popup at all.
 */
async function openComposerTab(): Promise<void> {
  // ?popout=1 renders the composer at desk-width instead of the cramped
  // toolbar layout. Same flag the explicit pop-out button uses — see
  // entrypoints/popup/main.tsx.
  await browser.tabs.create({ url: browser.runtime.getURL("popup.html?popout=1") });
}

/**
 * Opens the extension popup, falling back to a tab if the current browser
 * window doesn't support `action.openPopup()` (e.g., Vivaldi side panels,
 * dev-tools popouts, or browser windows without a normal toolbar). The popup
 * reads its prefill from browser.storage.session the same way regardless of
 * how it's opened.
 */
async function openPopupSafe(): Promise<void> {
  try {
    await action.openPopup();
  } catch {
    await openComposerTab();
  }
}
```

- [ ] **Step 3: Re-apply the preference and handle the icon click**

Add a module-level function next to `updateBadge`:

```ts
/**
 * An extension update resets the action's popup to the manifest default, so
 * the stored choice is re-applied whenever the background starts. Only an
 * explicit preference is applied; unset leaves the manifest default and lets
 * the popup decide on its first open.
 */
async function restoreComposerSurface(): Promise<void> {
  const { composerInTab } = await defaultsStore().get();
  if (composerInTab !== undefined) await applyComposerSurface(composerInTab);
}
```

Inside `defineBackground`, in the `onInstalled` listener, add after `updateBadge();`:

```ts
restoreComposerSurface().catch((e) => log.warn("restoreComposerSurface failed", e));
```

In the `onStartup` listener, add the same line after `updateBadge();`.

After the `onStartup` listener, add:

```ts
// Fires only while the action has no popup (see core/composer-surface.ts).
action.onClicked.addListener(() => {
  openComposerTab().catch((e) => log.error("opening the composer tab failed", e));
});
```

- [ ] **Step 4: Typecheck, lint, build, unit suite**

Run: `bun run typecheck && bun run lint && bun run test && bun run build`
Expected: all exit 0; unit count 192 (188 + 3 + 1).

---

### Task 4: Popup one-time redirect and the settings checkbox

**Files:**

- Modify: `entrypoints/popup/main.tsx` (imports; mount code at the bottom)
- Modify: `entrypoints/options/AccountList.tsx` (imports; state; checkbox)

**Interfaces:**

- Consumes: `TOUCH_ONLY_QUERY`, `applyComposerSurface` (Task 1); `defaultsStore().setComposerInTab` (Task 2).

- [ ] **Step 1: Popup imports**

In `entrypoints/popup/main.tsx` add:

```tsx
import {
  applyComposerSurface,
  shouldOpenComposerInTab,
  TOUCH_ONLY_QUERY,
} from "../../core/composer-surface";
```

and add `defaultsStore` to the `../../storage` import list.

- [ ] **Step 2: Redirect once on a touch-only device**

Replace the mount code at the bottom of `entrypoints/popup/main.tsx`:

```tsx
setLogContext("popup");

const root = document.getElementById("app");
if (root) {
  render(<Popup />, root);
}
```

with:

```tsx
setLogContext("popup");

/**
 * First open on a touch-only device: Chromium on Android closes this popup
 * as soon as the keyboard appears, so switch the icon to the tab surface and
 * open the tab now. The stored preference means this runs once per profile;
 * afterwards the icon tap goes straight to the tab via the background. Not
 * in pop-out mode, which is already the tab.
 */
async function redirectTouchDeviceToTab(): Promise<boolean> {
  if (isPopout) return false;
  const { composerInTab } = await defaultsStore().get();
  // Only the automatic case is decided here; an explicit choice was already
  // applied by the background, so the popup being open means "popup".
  if (composerInTab !== undefined) return false;
  const touchOnly = window.matchMedia(TOUCH_ONLY_QUERY).matches;
  if (!shouldOpenComposerInTab(composerInTab, touchOnly)) return false;
  try {
    await defaultsStore().setComposerInTab(true);
    await applyComposerSurface(true);
  } catch (e) {
    // Still open the tab: the user must never be stuck. The next tap retries.
    log.warn("could not remember the tab composer preference", e);
  }
  await browser.tabs.create({ url: browser.runtime.getURL("popup.html?popout=1") });
  window.close();
  return true;
}

const root = document.getElementById("app");
if (root) {
  redirectTouchDeviceToTab()
    .catch((e) => {
      log.warn("touch-device check failed", e);
      return false;
    })
    .then((redirected) => {
      if (!redirected) render(<Popup />, root);
    });
}
```

- [ ] **Step 3: Checkbox state in AccountList**

In `entrypoints/options/AccountList.tsx` add the import:

```tsx
import { applyComposerSurface } from "../../core/composer-surface";
```

Add state next to `tabSignIn`:

```tsx
const [composerInTab, setComposerInTab] = useState(false);
```

In `refresh()`, read both preferences with one `get()`:

```tsx
const defaults = await defaultsStore().get();
setTabSignIn(defaults.tabSignIn ?? false);
setComposerInTab(defaults.composerInTab ?? false);
```

(replacing the existing `setTabSignIn((await defaultsStore().get()).tabSignIn ?? false);` line), and add next to `toggleTabSignIn`:

```tsx
async function toggleComposerInTab(value: boolean) {
  setComposerInTab(value);
  await defaultsStore().setComposerInTab(value);
  await applyComposerSurface(value);
}
```

- [ ] **Step 4: Render the checkbox**

Directly after the sign-in `<label>…</label>` block, add:

```tsx
<label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
  <input
    type="checkbox"
    checked={composerInTab}
    onChange={(e) => void toggleComposerInTab((e.currentTarget as HTMLInputElement).checked)}
  />{" "}
  Open the composer in a tab instead of the toolbar popup
  <span style={{ display: "block", color: "#666", fontSize: 12 }}>
    Plume does this on its own on touch-only devices, where the popup closes as soon as the keyboard
    appears.
  </span>
</label>
```

- [ ] **Step 5: Typecheck, lint, unit suite, build, and the existing E2E that opens the popup**

Run: `bun run typecheck && bun run lint && bun run test && bun run build`
Expected: all exit 0.
Then: `CHROME_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome bun run test:e2e -- tests/e2e/compose-and-post.spec.ts tests/e2e/debug-log.spec.ts`
Expected: all chromium tests pass (Playwright's Chromium is not touch-only, so the popup still renders), firefox skipped.

---

### Task 5: E2E, changelog, CLAUDE.md

**Files:**

- Create: `tests/e2e/composer-surface.spec.ts`
- Modify: `CHANGELOG.md` (Unreleased)
- Modify: `CLAUDE.md` (`?popout=1` section; Known gotchas)

- [ ] **Step 1: Write the E2E**

```ts
// tests/e2e/composer-surface.spec.ts
import { expect, test } from "@playwright/test";
import { getExtensionId, launchWithExtension } from "./helpers";

test("the composer checkbox switches the icon between popup and tab", async ({ browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox extension loading uses different harness — see tests/e2e/README.md",
  );
  const ctx = await launchWithExtension("chromium");
  const extId = await getExtensionId(ctx);

  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  const box = opts.getByLabel("Open the composer in a tab instead of the toolbar popup");

  // Playwright cannot click the toolbar icon, so the surface is read back
  // from the action itself: no popup means the tap goes to the background.
  const popup = () => opts.evaluate(() => chrome.action.getPopup({}));
  expect(await popup()).toMatch(/popup\.html$/);

  await box.check();
  await expect.poll(popup).toBe("");

  await box.uncheck();
  await expect.poll(popup).toMatch(/popup\.html$/);

  // The choice is stored, so a reload shows it and the background can
  // re-apply it after an update.
  await box.check();
  await opts.reload();
  await expect(
    opts.getByLabel("Open the composer in a tab instead of the toolbar popup"),
  ).toBeChecked();

  await ctx.close();
});
```

- [ ] **Step 2: Build and run it**

Run: `bun run build && CHROME_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome bun run test:e2e -- tests/e2e/composer-surface.spec.ts`
Expected: 1 passed (chromium), 1 skipped (firefox).

- [ ] **Step 3: Full E2E suite**

Run: `CHROME_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome bun run test:e2e`
Expected: every chromium test passes; firefox skipped.

- [ ] **Step 4: Changelog**

Under `## [Unreleased]` in `CHANGELOG.md`, add:

```markdown
### Fixed

- **On phones and tablets the toolbar popup closed the moment the text area was touched.** Chromium dismisses an extension popup whenever focus leaves it, and on Android the keyboard appearing counts, so on Vivaldi for Android the composer vanished before a word could be typed; only the pop-out tab was usable. The icon now opens the composer as a tab on touch-only devices: the first tap still shows the popup for an instant while Plume records the choice, every later tap goes straight to the tab. A new settings checkbox, "Open the composer in a tab instead of the toolbar popup", forces either surface on any device, and the choice survives extension updates. Desktop behaviour is unchanged.
```

- [ ] **Step 5: CLAUDE.md**

At the end of the `### \`?popout=1\` mode` section, add:

```markdown
The surface is also a stored choice: `defaults.composerInTab` (`true` tab,
`false` popup, unset = decide from `(hover: none) and (pointer: coarse)`).
`applyComposerSurface()` in `core/composer-surface.ts` clears or restores the
action's popup; with it cleared the icon tap fires `action.onClicked` in the
background, which opens the pop-out tab. The popup redirects itself once on a
touch-only device, the settings checkbox applies on change, and the background
re-applies the stored choice on `onInstalled`/`onStartup` because an update
resets the popup to the manifest default.
```

In Known gotchas, after the Vivaldi Android bullet, add:

```markdown
- **Chromium on Android dismisses the action popup when the keyboard opens.** The popup is closed on any focus loss, and the soft keyboard counts, so a textarea in the popup is unusable there. Touch-only devices get the composer as a tab (see `?popout=1` mode); never add popup-only UI without checking the tab renders it too.
```

- [ ] **Step 6: Format and final checks**

Run: `bun run lint:fix && bun run typecheck && bun run test && bun run build && bun run build:firefox`
Expected: all exit 0; unit count 192.

- [ ] **Step 7: Report**

Show `git status --short` and `git diff --stat`. Do not commit.
