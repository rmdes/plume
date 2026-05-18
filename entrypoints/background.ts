import { buildPrefillFromContextInfo, MENU_ITEMS } from "../core/context-menus";
import { fetchPageTitle } from "../core/page-title";
import { sessionStorage } from "../storage";

const PREFILL_KEY = "pendingPrefill";

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      for (const item of MENU_ITEMS) {
        chrome.contextMenus.create({
          id: item.id,
          title: item.title,
          contexts: item.contexts,
          parentId: item.parentId,
        });
      }
    });
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

// Placeholder — full implementation in Phase 6
async function handleImagePost(prefill: { _pending_media_fetch?: string }): Promise<void> {
  await sessionStorage().set({
    [PREFILL_KEY]: { ...prefill, _media_error: "image-post not yet implemented (Phase 6)" },
  });
  await chrome.action.openPopup();
}
