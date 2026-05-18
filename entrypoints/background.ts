import { CLIENT_ID } from "../core/auth-config";
import { computeBadgeState } from "../core/badge";
import { buildPrefillFromContextInfo, MENU_ITEMS, type Prefill } from "../core/context-menus";
import { fetchImageAsBlob, filenameFromUrl, ImageFetchError } from "../core/image-fetch";
import { refreshToken } from "../core/indieauth";
import { MicropubClient } from "../core/micropub-client";
import { fetchPageTitle } from "../core/page-title";
import { type NotifyEvent, runRetryTick } from "../core/retry-executor";
import {
  accountStore,
  defaultsStore,
  queueStore as queueStoreFactory,
  sessionStorage,
} from "../storage";

const PREFILL_KEY = "pendingPrefill";

export default defineBackground(() => {
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
        await chrome.contextMenus.removeAll();
        const active = await accountStore().getActive();
        const hasMedia = !!active?.media_endpoint;
        await Promise.all(
          MENU_ITEMS.filter((item) => !(item.id === "plume-post-image" && !hasMedia)).map(
            (item) =>
              new Promise<void>((resolve) => {
                chrome.contextMenus.create(
                  {
                    id: item.id,
                    title: item.title,
                    contexts: item.contexts,
                    parentId: item.parentId,
                  },
                  () => {
                    // Swallow duplicate-id errors silently — they only
                    // happen if a concurrent path somehow slipped through.
                    void chrome.runtime.lastError;
                    resolve();
                  },
                );
              }),
          ),
        );
      } while (menuRefreshPending);
    } finally {
      menuRefreshRunning = false;
    }
  }

  const QUEUE_ALARM = "plume-queue-tick";
  const TOKEN_ALARM = "plume-token-refresh";

  chrome.runtime.onInstalled.addListener(() => {
    refreshMenus();
    chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
    chrome.alarms.create(TOKEN_ALARM, { periodInMinutes: 1440 });
    updateBadge();
  });

  chrome.runtime.onStartup.addListener(() => {
    updateBadge();
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.accounts || changes.defaults) {
      refreshMenus().catch((e) => console.error("refreshMenus failed", e));
    }
    if (changes.queue) {
      updateBadge().catch((e) => console.error("updateBadge failed", e));
    }
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
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
    await chrome.action.openPopup();
  });
});

async function updateBadge(): Promise<void> {
  const queue = queueStoreFactory();
  const state = computeBadgeState({
    hasAuthNeeded: await queue.hasAuthNeeded(),
    queueCount: await queue.count(),
  });
  await chrome.action.setBadgeText({ text: state.text });
  await chrome.action.setBadgeBackgroundColor({ color: state.color });
}

async function handleNotify(event: NotifyEvent): Promise<void> {
  const defaults = await defaultsStore().get();
  const shouldNotifySuccess = defaults.notifyOnBackgroundSuccess ?? true;
  switch (event.kind) {
    case "success":
      if (shouldNotifySuccess) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL("/icon/128.png"),
          title: "Plume",
          message: `Posted to ${event.domain}`,
        });
      }
      break;
    case "auth_needed":
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("/icon/128.png"),
        title: "Plume — reconnect required",
        message: event.message,
      });
      break;
    case "permanent_failure":
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("/icon/128.png"),
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
    await chrome.action.openPopup();
    return;
  }
  if (!account.media_endpoint) {
    await sessionStorage().set({
      [PREFILL_KEY]: {
        ...prefill,
        _media_error: `Account ${new URL(account.me).hostname} has no media endpoint configured.`,
      },
    });
    await chrome.action.openPopup();
    return;
  }
  const srcUrl = prefill._pending_media_fetch;
  if (!srcUrl) {
    // Shouldn't happen — buildPrefillFromContextInfo always sets this for photo prefills
    await chrome.action.openPopup();
    return;
  }
  try {
    const blob = await fetchImageAsBlob(srcUrl);
    const filename = filenameFromUrl(srcUrl);
    const client = new MicropubClient({
      micropubEndpoint: account.micropub_endpoint,
      mediaEndpoint: account.media_endpoint,
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
    await chrome.action.openPopup();
  } catch (e) {
    const message =
      e instanceof ImageFetchError ? e.message : e instanceof Error ? e.message : String(e);
    await sessionStorage().set({
      [PREFILL_KEY]: { ...prefill, _media_error: message },
    });
    await chrome.action.openPopup();
  }
}
