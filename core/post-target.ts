import type { CreateOptions, PostType } from "./types";

/**
 * Post types that point at another URL. Everything else (note, article,
 * photo, event) stands alone and must carry no target property at all.
 */
export const TARGET_TYPES: PostType[] = ["reply", "bookmark", "like", "repost", "quote"];

/** Every Micropub target property the composer can populate. */
const TARGET_FIELDS = ["inReplyTo", "bookmarkOf", "likeOf", "repostOf"] as const;

export type TargetField = (typeof TARGET_FIELDS)[number];

function targetFieldFor(type: PostType): TargetField {
  if (type === "reply" || type === "quote") return "inReplyTo";
  if (type === "bookmark") return "bookmarkOf";
  if (type === "like") return "likeOf";
  return "repostOf";
}

/**
 * The whole target-field slice of composer state for a post type: the one
 * field that type uses carries `url`, every other is cleared.
 *
 * It must own all four, not just the active one. The composer ships its entire
 * state as the payload, so a field left behind by an earlier type is still
 * sent — and servers discover the post type from the properties. Pasting a URL
 * into the Bookmark composer, then switching to Article, posted a 26 KB
 * article that still carried `bookmark-of`, and the server filed it under
 * /bookmarks/. Bookmark → Reply sent both `bookmark-of` and `in-reply-to`.
 *
 * Clearing costs nothing: the composer keeps the typed URL in its own state
 * and re-populates whichever field the next type needs.
 */
export function targetFields(type: PostType, url: string): Pick<CreateOptions, TargetField> {
  const active = TARGET_TYPES.includes(type) ? targetFieldFor(type) : null;
  return Object.fromEntries(
    TARGET_FIELDS.map((field) => [field, field === active ? url : undefined]),
  ) as Pick<CreateOptions, TargetField>;
}
