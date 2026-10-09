import { action } from "./browser-api";
import { log } from "./logger";

/** storage.session key holding the id of the open composer tab, if any. */
export const COMPOSER_TAB_KEY = "composerTabId";

/**
 * Sent by the background to the remembered composer tab before focusing it.
 * Only a live pop-out page answers; a tab the user navigated elsewhere has no
 * listener, so the send rejects and the background opens a fresh composer.
 */
export const COMPOSER_PING = "composer-ping";

/**
 * Phones and tablets match; a laptop with a mouse or trackpad does not, even
 * if it has a touch screen. This is the only device signal Plume uses — no
 * user-agent inspection.
 */
export const TOUCH_ONLY_QUERY = "(hover: none) and (pointer: coarse)";

/**
 * Whether this is a touch-only device: the media query says so, or the
 * extension platform says Android. The second signal exists because Vivaldi
 * 8.2 for Android hosts the popup in a frame that reports hover and a fine
 * pointer, so the query alone missed the phone (1.7.3). `runtime.getPlatformInfo`
 * is a standard WebExtension API on both engines; still no user-agent sniffing.
 */
export function isTouchOnlyDevice(mediaMatches: boolean, os: string | undefined): boolean {
  return mediaMatches || os === "android";
}

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
