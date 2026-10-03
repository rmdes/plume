import { CALLBACK_URL, isCallbackMessage } from "../core/auth-callback";
import { CLIENT_ID } from "../core/auth-config";
import { computeBadgeState } from "../core/badge";
import { applyComposerSurface, COMPOSER_TAB_KEY } from "../core/composer-surface";
import { log, setLogContext } from "../core/logger";
import { action, browser } from "../core/browser-api";
import { buildPrefillFromContextInfo, MENU_ITEMS, type Prefill } from "../core/context-menus";
import { fetchImageAsBlob, filenameFromUrl, ImageFetchError } from "../core/image-fetch";
import { refreshToken } from "../core/indieauth";
import { fetchAndCacheServerConfig } from "../core/server-config";
import { MicropubClient } from "../core/micropub-client";
import { fetchPageTitle } from "../core/page-title";
import { type NotifyEvent, runRetryTick } from "../core/retry-executor";
import { completeTabAuth } from "../core/tab-auth";
import {
  accountStore,
  defaultsStore,
  pendingAuthStore,
  queueStore as queueStoreFactory,
  sessionStorage,
} from "../storage";

const PREFILL_KEY = "pendingPrefill";

// Derived from CLIENT_ID so the two can never drift: both point at the same
// GitHub Pages site, which is also what IndieAuth servers fetch for client
// metadata.
const WELCOME_URL = new URL("welcome.html", CLIENT_ID).href;

export default defineBackground(() => {
  setLogContext("background");

  // The action's popup is in-memory browser state and resets whenever the
  // extension is unloaded (updates, disable/enable, reload), so the stored
  // choice is re-applied on every background start, not only on install.
  restoreComposerSurface().catch((e) => log.warn("restoreComposerSurface failed", e));

  // Serialize refreshMenus to prevent racing removeAll/create cycles
  // triggered by concurrent onInstalled + storage.onChanged events.
  // If a refresh is requested while one is running, queue one more
  // pass after it finishes (handles "state changed during refresh").
  let menuRefreshRunning = false;
  let menuRefreshPending = false;

  async function refreshMenus(): Promise<void> {
    if (menuRefreshRunning) {
      menuRefreshPending = true;
      return;
    }
    menuRefreshRunning = true;
    try {
      do {
        menuRefreshPending = false;
        await browser.contextMenus.removeAll();
        const active = await accountStore().getActive();
        const hasMedia = !!active?.media_endpoint;
        // Create the parent first (children reference it via parentId),
        // then children sequentially. Sequential creates avoid the
        // parallel race that occasionally hit duplicate-id on parent
        // when SW restarts interleaved refresh cycles.
        for (const item of MENU_ITEMS) {
          if (item.id === "plume-post-image" && !hasMedia) continue;
          await createMenuItem(item);
        }
      } while (menuRefreshPending);
    } finally {
      menuRefreshRunning = false;
    }
  }

  function createMenuItem(item: (typeof MENU_ITEMS)[number]): Promise<void> {
    return new Promise((resolve) => {
      browser.contextMenus.create(
        {
          id: item.id,
          title: item.title,
          contexts: item.contexts,
          parentId: item.parentId,
        },
        () => {
          // Explicit access marks lastError as "checked" so the runtime
          // doesn't log an "Unchecked runtime.lastError" warning.
          // Duplicate-id errors are expected during SW-restart races and
          // are functionally harmless (the item already exists).
          const err = browser.runtime.lastError;
          if (err && !/duplicate id/i.test(err.message ?? "")) {
            log.warn(`contextMenus.create(${item.id})`, err);
          }
          resolve();
        },
      );
    });
  }

  const QUEUE_ALARM = "plume-queue-tick";
  const TOKEN_ALARM = "plume-token-refresh";

  browser.runtime.onInstalled.addListener((details) => {
    refreshMenus();
    browser.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
    browser.alarms.create(TOKEN_ALARM, { periodInMinutes: 1440 });
    updateBadge();

    // Only on a genuine first install. This listener also fires for every
    // update and browser upgrade, and reopening this on each one would be
    // nagging rather than onboarding.
    if (details.reason === "install") {
      browser.tabs
        .create({ url: WELCOME_URL })
        .catch((e) => log.warn("opening welcome page failed", e));
    }
  });

  browser.runtime.onStartup.addListener(() => {
    updateBadge();
  });

  // Fires only while the action has no popup (see core/composer-surface.ts).
  action.onClicked.addListener(() => {
    openComposerTab().catch((e) => log.error("opening the composer tab failed", e));
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === QUEUE_ALARM) {
      await runRetryTick({
        queue: queueStoreFactory(),
        accounts: accountStore(),
        post: async (account, payload) => {
          const client = new MicropubClient({
            micropubEndpoint: account.micropub_endpoint,
            mediaEndpoint: account.media_endpoint,
            token: account.access_token,
          });
          return client.create(payload);
        },
        refresher: (existing) => refreshToken(existing, CLIENT_ID),
        notify: handleNotify,
      });
      await updateBadge();
    } else if (alarm.name === TOKEN_ALARM) {
      await proactiveRefreshAll();
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.accounts || changes.defaults) {
      refreshMenus().catch((e) => log.error("refreshMenus failed", e));
    }
    if (changes.queue) {
      updateBadge().catch((e) => log.error("updateBadge failed", e));
    }
  });

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
          // The user may have closed the tab already; the sign-in is complete either way.
          await browser.tabs
            .remove(sender.tab.id)
            .catch((e) => log.warn("closing callback tab failed", e));
        }
      })().catch((e) => {
        log.error("tab sign-in handler failed", e);
        sendResponse({ ok: false, error: "Plume hit an unexpected error. See the debug log." });
      });
      // Keeps the message channel open for the async reply, on both engines.
      return true;
    },
  );

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    const prefill = buildPrefillFromContextInfo(info, { title: tab?.title });
    if (!prefill) return;
    // Image-post flow handled in Phase 6 (fetch + media-upload before opening popup)
    if (prefill.type === "photo" && prefill._pending_media_fetch) {
      await handleImagePost(prefill);
      return;
    }
    // Link-bookmark/reply: opportunistically fetch linked-page title
    if (
      (info.menuItemId === "plume-bookmark-link" || info.menuItemId === "plume-reply-link") &&
      info.linkUrl &&
      !prefill.name
    ) {
      prefill.name = await fetchPageTitle(info.linkUrl);
    }
    await sessionStorage().set({ [PREFILL_KEY]: prefill });
    await openPopupSafe();
  });
});

async function updateBadge(): Promise<void> {
  const queue = queueStoreFactory();
  const state = computeBadgeState({
    hasAuthNeeded: await queue.hasAuthNeeded(),
    queueCount: await queue.count(),
  });
  await action.setBadgeText({ text: state.text });
  await action.setBadgeBackgroundColor({ color: state.color });
}

/**
 * The action's popup resets to the manifest default whenever the extension is
 * unloaded, so the stored choice is re-applied on every background start. Only an
 * explicit preference is applied; unset leaves the manifest default and lets
 * the popup decide on its first open.
 */
async function restoreComposerSurface(): Promise<void> {
  const { composerInTab } = await defaultsStore().get();
  if (composerInTab !== undefined) await applyComposerSurface(composerInTab);
}

async function handleNotify(event: NotifyEvent): Promise<void> {
  const defaults = await defaultsStore().get();
  const shouldNotifySuccess = defaults.notifyOnBackgroundSuccess ?? true;
  switch (event.kind) {
    case "success":
      if (shouldNotifySuccess) {
        browser.notifications.create({
          type: "basic",
          iconUrl: browser.runtime.getURL("/icon/128.png"),
          title: "Plume",
          message: `Posted to ${event.domain}`,
        });
      }
      break;
    case "auth_needed":
      browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("/icon/128.png"),
        title: "Plume — reconnect required",
        message: event.message,
      });
      break;
    case "permanent_failure":
      browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("/icon/128.png"),
        title: "Plume — post failed",
        message: event.message,
      });
      break;
    case "retry_scheduled":
      // Silent — badge will reflect queue depth (Phase 7 T42).
      break;
  }
}

async function proactiveRefreshAll(): Promise<void> {
  const list = await accountStore().list();
  for (const account of list) {
    if (!account.refresh_token || !account.expires_at) continue;
    const msLeft = new Date(account.expires_at).getTime() - Date.now();
    if (msLeft > 24 * 60 * 60 * 1000) continue;
    try {
      const refreshed = await refreshToken(account, CLIENT_ID);
      await accountStore().update(new URL(refreshed.me).hostname, refreshed);
    } catch {
      // Will be flagged as auth_needed on next post.
    }
  }
}

async function handleImagePost(prefill: Prefill): Promise<void> {
  const account = await accountStore().getActiveRefreshed((tok) => refreshToken(tok, CLIENT_ID));
  if (!account) {
    await sessionStorage().set({
      [PREFILL_KEY]: { ...prefill, _media_error: "No account connected." },
    });
    await openPopupSafe();
    return;
  }
  // Self-heal: if account.media_endpoint is missing, look it up via ?q=config.
  // The site may not declare <link rel="media-endpoint"> on its homepage but
  // advertises it in the Micropub config response.
  let mediaEndpoint = account.media_endpoint;
  if (!mediaEndpoint) {
    try {
      const domain = new URL(account.me).hostname;
      const config = await fetchAndCacheServerConfig(accountStore(), domain);
      mediaEndpoint = config["media-endpoint"];
    } catch {
      // fall through to the missing-media-endpoint error path
    }
  }
  if (!mediaEndpoint) {
    await sessionStorage().set({
      [PREFILL_KEY]: {
        ...prefill,
        _media_error: `Account ${new URL(account.me).hostname} has no media endpoint configured.`,
      },
    });
    await openPopupSafe();
    return;
  }
  const srcUrl = prefill._pending_media_fetch;
  if (!srcUrl) {
    // Shouldn't happen — buildPrefillFromContextInfo always sets this for photo prefills
    await openPopupSafe();
    return;
  }
  // Request host permission for the image's origin if not already granted.
  // The contextMenus.onClicked event qualifies as a user gesture, so
  // browser.permissions.request can prompt the user.
  try {
    const imageOrigin = `${new URL(srcUrl).origin}/*`;
    const hasOrigin = await browser.permissions.contains({ origins: [imageOrigin] });
    if (!hasOrigin) {
      const granted = await browser.permissions.request({ origins: [imageOrigin] });
      if (!granted) {
        await sessionStorage().set({
          [PREFILL_KEY]: {
            ...prefill,
            _media_error: `Permission denied for ${new URL(srcUrl).hostname}. Image not uploaded.`,
          },
        });
        await openPopupSafe();
        return;
      }
    }
  } catch {
    // permission API failure — fall through and let the fetch fail with its own error
  }
  try {
    const blob = await fetchImageAsBlob(srcUrl);
    const filename = filenameFromUrl(srcUrl);
    const client = new MicropubClient({
      micropubEndpoint: account.micropub_endpoint,
      mediaEndpoint,
      token: account.access_token,
    });
    const uploadedUrl = await client.uploadMedia(blob, filename);
    await sessionStorage().set({
      [PREFILL_KEY]: {
        type: "photo",
        photo: [uploadedUrl],
        _source_page: prefill._source_page,
      },
    });
    await openPopupSafe();
  } catch (e) {
    const message =
      e instanceof ImageFetchError ? e.message : e instanceof Error ? e.message : String(e);
    await sessionStorage().set({
      [PREFILL_KEY]: { ...prefill, _media_error: message },
    });
    await openPopupSafe();
  }
}

/**
 * The composer as a full tab. Used when the toolbar popup is switched off
 * (touch-only devices, or the settings checkbox) and as the fallback when the
 * browser cannot show a popup at all.
 * `reload` re-mounts an existing tab so it picks up a pending prefill from a
 * context-menu post; the icon tap leaves it alone so unsaved typing survives.
 */
async function openComposerTab(reload = false): Promise<void> {
  // ?popout=1 renders the composer at desk-width instead of the cramped
  // toolbar layout. Same flag the explicit pop-out button uses — see
  // entrypoints/popup/main.tsx.
  const url = browser.runtime.getURL("popup.html?popout=1");
  // One composer tab at a time: two of them would hydrate the same draft and
  // overwrite each other. Chrome hides tab URLs without the `tabs` permission
  // even for an extension's own pages (query({ url }) matches nothing), so the
  // tab is remembered by id and checked with tabs.get, which needs no permission.
  const knownId = await sessionStorage().get<number>(COMPOSER_TAB_KEY);
  const existing =
    knownId === undefined ? undefined : await browser.tabs.get(knownId).catch(() => undefined);
  if (existing?.id !== undefined) {
    await browser.tabs.update(existing.id, reload ? { url, active: true } : { active: true });
    if (existing.windowId !== undefined) {
      // Firefox for Android has no `windows` API; the tab is already active.
      await browser.windows?.update(existing.windowId, { focused: true }).catch(() => undefined);
    }
    return;
  }
  const tab = await browser.tabs.create({ url });
  if (tab.id !== undefined) await sessionStorage().set({ [COMPOSER_TAB_KEY]: tab.id });
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
    await openComposerTab(true);
  }
}
