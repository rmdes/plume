import { CLIENT_ID } from "../core/auth-config";
import { buildPrefillFromContextInfo, MENU_ITEMS, type Prefill } from "../core/context-menus";
import { fetchImageAsBlob, filenameFromUrl, ImageFetchError } from "../core/image-fetch";
import { refreshToken } from "../core/indieauth";
import { MicropubClient } from "../core/micropub-client";
import { fetchPageTitle } from "../core/page-title";
import { accountStore, sessionStorage } from "../storage";

const PREFILL_KEY = "pendingPrefill";

export default defineBackground(() => {
  async function refreshMenus() {
    await chrome.contextMenus.removeAll();
    const active = await accountStore().getActive();
    const hasMedia = !!active?.media_endpoint;
    for (const item of MENU_ITEMS) {
      if (item.id === "plume-post-image" && !hasMedia) continue;
      chrome.contextMenus.create({
        id: item.id,
        title: item.title,
        contexts: item.contexts,
        parentId: item.parentId,
      });
    }
  }

  chrome.runtime.onInstalled.addListener(() => {
    refreshMenus();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.accounts || changes.defaults) {
      // biome-ignore lint/suspicious/noConsole: legitimate background error logging
      refreshMenus().catch((e) => console.error("refreshMenus failed", e));
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
