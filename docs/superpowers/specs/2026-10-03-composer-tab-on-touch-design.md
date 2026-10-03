# Open the composer in a tab on touch-only devices

Date: 2026-10-03
Status: approved design, not yet implemented

## Problem

On Chromium-based Android browsers (reported on Vivaldi 8.2), tapping the
Plume icon shows the toolbar popup at the right size, but the moment the
textarea is touched the popup closes. Chromium dismisses an action popup
whenever focus leaves it; on Android the soft keyboard appearing counts as
that. Plume's own code has no focus or blur handler that closes the popup.
The existing pop-out tab (`popup.html?popout=1`) is not dismissed and works
fully, so the fix is to route touch devices there by default.

## Goals

- On a touch-only device the icon tap opens the composer as a tab, with no
  popup flash after the first time.
- A settings checkbox forces either surface on any device.
- Only standard WebExtension APIs and a CSS media query; no user-agent
  inspection.
- The preference survives extension updates, which reset the manifest's
  default popup.

Non-goals: changing the popup's layout, side panels, Firefox-specific work
(Firefox for Android already renders popups as full pages and the tab path
also works there).

## 1. Preference and decision

`UserDefaults` gains `composerInTab?: boolean`:

- `undefined` — decide automatically from the device.
- `true` — always open the composer in a tab.
- `false` — always use the toolbar popup.

`DefaultsStore.setComposerInTab(value: boolean)` writes it.

`core/composer-surface.ts` exports:

```ts
export function shouldOpenComposerInTab(pref: boolean | undefined, touchOnly: boolean): boolean;
// returns pref ?? touchOnly
export const TOUCH_ONLY_QUERY = "(hover: none) and (pointer: coarse)";
```

The caller passes `window.matchMedia(TOUCH_ONLY_QUERY).matches`. Phones and
tablets match; laptops with a mouse or trackpad do not. Pure, unit-tested.

## 2. Applying the surface

`core/composer-surface.ts` also exports:

```ts
export async function applyComposerSurface(inTab: boolean): Promise<void>;
// action.setPopup({ popup: inTab ? "" : "popup.html" })
```

With the popup cleared, an icon tap (and the `_execute_action` shortcut) fires
`action.onClicked` in the background, which opens the pop-out tab. With it
restored, the browser shows the popup as before.

It is applied from three places:

1. **Popup, first run on a touch-only device.** In `popup/main.tsx`, before
   rendering, when not already in pop-out mode: read `defaults.composerInTab`;
   if it is `undefined` and the media query matches, store `true`, apply the
   surface, open the pop-out tab, and `window.close()`. This is the one and
   only popup flash a touch user sees. If the preference is already set,
   nothing happens here (the background has applied it).
2. **Settings checkbox** on every change: store, then apply.
3. **Background** on `runtime.onInstalled` and `runtime.onStartup`: read the
   stored preference and apply `shouldOpenComposerInTab(pref, false)` — the
   background has no `window`, so it applies only an explicit preference and
   leaves the manifest default when unset. This is what keeps the choice
   across updates.

`background.ts` gains `action.onClicked.addListener(() => openComposerTab())`
where `openComposerTab()` is the existing tab fallback extracted from
`openPopupSafe()` so both share it.

## 3. Settings

In the accounts section, directly under the sign-in checkbox, same markup:

> Open the composer in a tab instead of the toolbar popup
> Plume does this on its own on touch-only devices, where the popup closes as soon as the keyboard appears.

Checked ⇒ `true`; unchecked ⇒ `false`. The checkbox renders `pref ?? false`.
Once set there is no way back to automatic; automatic only exists to get the
first answer right.

## 4. Error handling

- `action.setPopup` rejecting (not expected on either engine) is logged with
  `log.warn` and otherwise ignored; the worst case is the previous surface.
- If the preference write fails in the popup's first-run branch, the popup
  still opens the tab and closes, so the user is never stuck; the next tap
  repeats the attempt.

## 5. Testing

Unit: `shouldOpenComposerInTab` truth table (6 cases); `setComposerInTab`
round trip in `storage/defaults.test.ts`.

E2E (Chromium, existing harness): open options, tick the checkbox, then from
the options page evaluate `chrome.action.getPopup({})` and expect `""`;
untick and expect it to end with `popup.html`. Playwright cannot click the
toolbar icon, so `action.onClicked` is covered by inspection; the tab it
opens is the same `popup.html?popout=1` the existing pop-out test already
exercises.

Device: the Vivaldi Android report is the acceptance test — after the
update, the first tap flashes the popup and lands in the tab; later taps go
straight to the tab. Firefox for Android matches the touch-only query, so it moves to the tab as well; the tab works there, and the checkbox restores the popup.

## 6. Docs

CHANGELOG Unreleased "Fixed" entry; CLAUDE.md: extend the `?popout=1`
section with the surface rule, and a Known gotcha: "Chromium on Android
dismisses the action popup when the keyboard opens; touch-only devices get
the composer as a tab, `composerInTab` in defaults."
