import { action } from "./browser-api";
import { log } from "./logger";

/** storage.session key holding the id of the open composer tab, if any. */
export const COMPOSER_TAB_KEY = "composerTabId";

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
