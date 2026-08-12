/**
 * The WebExtension API namespace, promise-based on every browser we ship to.
 *
 * Firefox exposes two namespaces: `browser`, whose async methods return
 * promises, and `chrome`, kept for porting compatibility, whose async methods
 * are *callback-only* and return `undefined`. Reaching for the bare `chrome`
 * global therefore breaks silently on Firefox everywhere a return value is
 * awaited — `storage.local.get()` resolved to `undefined` (making the popup
 * hang on "Loading…" forever) and `permissions.request()` resolved to
 * `undefined`, which reads as a denial.
 *
 * Chrome has no `browser` global, and its `chrome` namespace is promise-based
 * under MV3, so it takes the fallback branch. This is the same resolution WXT
 * applies in its non-polyfill mode; done here in two lines rather than by
 * pulling `webextension-polyfill` into the runtime, because that module throws
 * on import outside an extension context and would break the unit tests.
 *
 * Typed as `typeof chrome` so call sites keep the MV3 promise signatures.
 */
const globals = globalThis as unknown as { browser?: typeof chrome; chrome?: typeof chrome };

export const browser: typeof chrome =
  globals.browser?.runtime?.id != null ? globals.browser : (globals.chrome as typeof chrome);

const ns = browser as (typeof chrome & { browserAction?: typeof chrome.action }) | undefined;

/**
 * The toolbar-button API, under whichever name this manifest version uses.
 *
 * MV3 renamed `browserAction` to `action`, and WXT rewrites the manifest key
 * accordingly — but not the API calls. The Firefox build is MV2 and so exposes
 * only `browserAction`, which made every `action.*` call throw there: badge
 * updates rejected on each queue change, and `openPopupSafe` fell through to
 * its tab fallback on every context-menu post.
 *
 * Optional chaining is load-bearing: this is evaluated at import time, and in
 * unit tests neither global exists.
 */
export const action: typeof chrome.action = (ns?.action ??
  ns?.browserAction) as typeof chrome.action;
