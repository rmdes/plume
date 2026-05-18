import type { CreateOptions, PostType } from "./types";

export interface MenuItemDef {
  id: string;
  title: string;
  contexts: chrome.contextMenus.ContextType[];
  parentId?: string;
}

export const MENU_ITEMS: MenuItemDef[] = [
  // Parent menu
  { id: "plume", title: "Plume", contexts: ["page", "link", "selection", "image"] },
  // Page context
  {
    id: "plume-bookmark-page",
    title: "Bookmark this page",
    contexts: ["page"],
    parentId: "plume",
  },
  {
    id: "plume-reply-page",
    title: "Reply to this page",
    contexts: ["page"],
    parentId: "plume",
  },
  {
    id: "plume-like-page",
    title: "Like this page",
    contexts: ["page"],
    parentId: "plume",
  },
  // Link context
  {
    id: "plume-bookmark-link",
    title: "Bookmark this link",
    contexts: ["link"],
    parentId: "plume",
  },
  {
    id: "plume-reply-link",
    title: "Reply to this link",
    contexts: ["link"],
    parentId: "plume",
  },
  // Selection context
  {
    id: "plume-quote-selection",
    title: "Quote selection on Plume",
    contexts: ["selection"],
    parentId: "plume",
  },
  // Image context
  {
    id: "plume-post-image",
    title: "Post this image",
    contexts: ["image"],
    parentId: "plume",
  },
];

export interface ContextInfoLike {
  menuItemId: string | number;
  pageUrl?: string;
  linkUrl?: string;
  linkText?: string;
  selectionText?: string;
  srcUrl?: string;
}

export interface TabLike {
  title?: string;
}

export interface Prefill extends Partial<CreateOptions> {
  type: PostType;
  _pending_media_fetch?: string;
  _source_page?: string;
}

export function buildPrefillFromContextInfo(info: ContextInfoLike, tab: TabLike): Prefill | null {
  const id = String(info.menuItemId);
  const title = tab.title ?? "";
  switch (id) {
    case "plume-bookmark-page":
      return {
        type: "bookmark",
        bookmarkOf: info.pageUrl ?? "",
        name: title,
        content: "",
      };
    case "plume-reply-page":
      return {
        type: "reply",
        inReplyTo: info.pageUrl ?? "",
        content: "",
      };
    case "plume-like-page":
      return {
        type: "like",
        likeOf: info.pageUrl ?? "",
        content: "",
      };
    case "plume-bookmark-link":
      return {
        type: "bookmark",
        bookmarkOf: info.linkUrl ?? "",
        name: info.linkText ?? "",
        content: "",
      };
    case "plume-reply-link":
      return {
        type: "reply",
        inReplyTo: info.linkUrl ?? "",
        content: "",
      };
    case "plume-quote-selection": {
      const sel = info.selectionText ?? "";
      const quoted = sel
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      const cite = info.pageUrl ? `\n\n— [${title}](${info.pageUrl})` : "";
      return {
        type: "quote",
        inReplyTo: info.pageUrl ?? "",
        content: `${quoted}${cite}`,
      };
    }
    case "plume-post-image":
      return {
        type: "photo",
        _pending_media_fetch: info.srcUrl ?? "",
        _source_page: info.pageUrl,
      };
    default:
      return null;
  }
}
