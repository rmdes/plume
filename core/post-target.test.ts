import { beforeEach, describe, expect, it, vi } from "vitest";
import { MicropubClient } from "./micropub-client";
import { targetFields } from "./post-target";
import type { CreateOptions, PostType } from "./types";
import { draftScope } from "../storage/drafts";

type ComposerState = CreateOptions & { type: PostType };

/**
 * One type switch in the composer: `setType` patches the type and the effect
 * patches `targetFields`, both through `useComposerState`'s
 * `patch` → `{ ...prev, ...delta }`.
 */
function switchType(state: ComposerState, type: PostType, targetUrl: string): ComposerState {
  return { ...state, type, ...targetFields(type, targetUrl) };
}

const URL_A = "https://example.com/article";
const URL_B = "https://other.example/post";

describe("targetFields", () => {
  it("populates the one field each target type uses", () => {
    expect(targetFields("reply", URL_A).inReplyTo).toBe(URL_A);
    expect(targetFields("quote", URL_A).inReplyTo).toBe(URL_A);
    expect(targetFields("bookmark", URL_A).bookmarkOf).toBe(URL_A);
    expect(targetFields("like", URL_A).likeOf).toBe(URL_A);
    expect(targetFields("repost", URL_A).repostOf).toBe(URL_A);
  });

  it("clears every field the type does not use", () => {
    expect(targetFields("bookmark", URL_A)).toEqual({
      bookmarkOf: URL_A,
      inReplyTo: undefined,
      likeOf: undefined,
      repostOf: undefined,
    });
  });

  it("clears all four for types that target nothing", () => {
    const cleared = {
      inReplyTo: undefined,
      bookmarkOf: undefined,
      likeOf: undefined,
      repostOf: undefined,
    };
    for (const type of ["note", "article", "photo", "event"] as PostType[]) {
      expect(targetFields(type, URL_A)).toEqual(cleared);
    }
  });
});

describe("switching post type in the composer", () => {
  it("drops bookmarkOf when a bookmark becomes an article", () => {
    const bookmark = switchType({ type: "bookmark", content: "" }, "bookmark", URL_A);
    expect(bookmark.bookmarkOf).toBe(URL_A);

    const article = switchType({ ...bookmark, name: "Title", content: "body" }, "article", URL_A);
    expect(article.bookmarkOf).toBeFalsy();
    expect(article.inReplyTo).toBeFalsy();
    expect(article.likeOf).toBeFalsy();
    expect(article.repostOf).toBeFalsy();
    expect(article.name).toBe("Title");
    expect(article.content).toBe("body");
  });

  it("sets inReplyTo and drops bookmarkOf when a bookmark becomes a reply", () => {
    const bookmark = switchType({ type: "bookmark", content: "hi" }, "bookmark", URL_A);
    const reply = switchType(bookmark, "reply", URL_A);
    expect(reply.inReplyTo).toBe(URL_A);
    expect(reply.bookmarkOf).toBeFalsy();
  });

  it("leaks nothing across an article → bookmark → article round trip", () => {
    const article = switchType({ type: "article", name: "T", content: "c" }, "article", "");
    const bookmark = switchType(article, "bookmark", URL_A);
    expect(bookmark.bookmarkOf).toBe(URL_A);

    const back = switchType(bookmark, "article", URL_A);
    expect(back.bookmarkOf).toBeFalsy();
    expect(back.name).toBe("T");
  });

  it("re-populates the target when switching back, the URL being held elsewhere", () => {
    // `targetUrl` is the composer's own useState, untouched by clearing — so
    // the field comes back on the next switch.
    let state = switchType({ type: "bookmark" }, "bookmark", URL_A);
    state = switchType(state, "article", URL_A);
    expect(state.bookmarkOf).toBeFalsy();
    state = switchType(state, "bookmark", URL_A);
    expect(state.bookmarkOf).toBe(URL_A);
  });

  it("carries only the new target when the URL changes with the type", () => {
    let state = switchType({ type: "like" }, "like", URL_A);
    expect(state.likeOf).toBe(URL_A);
    state = switchType(state, "repost", URL_B);
    expect(state).toMatchObject({ repostOf: URL_B, likeOf: undefined });
  });

  it("re-scopes the draft to general once the target is gone", () => {
    const bookmark = switchType({ type: "bookmark", content: "c" }, "bookmark", URL_A);
    expect(draftScope(bookmark)).toBe(URL_A);
    expect(draftScope(switchType(bookmark, "article", URL_A))).toBe("general");
  });
});

describe("what reaches the Micropub server", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockPost() {
    return vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(null, { status: 201, headers: { Location: "https://me.example/p/1" } }),
      );
  }

  /** The composer posts its whole state (Composer.tsx `handleSubmit`). */
  async function post(state: ComposerState) {
    const fetchSpy = mockPost();
    const client = new MicropubClient({
      micropubEndpoint: "https://me.example/micropub",
      token: "t",
    });
    await client.create(state);
    return JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string).properties;
  }

  it("sends no bookmark-of for an article that started as a bookmark", async () => {
    const bookmark = switchType({ type: "bookmark" }, "bookmark", URL_A);
    const article = switchType({ ...bookmark, name: "Title", content: "body" }, "article", URL_A);
    const properties = await post(article);
    expect(properties).toEqual({ name: ["Title"], content: ["body"] });
  });

  it("sends in-reply-to only, not both, for a bookmark turned reply", async () => {
    const bookmark = switchType({ type: "bookmark" }, "bookmark", URL_A);
    const reply = switchType({ ...bookmark, content: "my reply" }, "reply", URL_A);
    const properties = await post(reply);
    expect(properties).toEqual({ content: ["my reply"], "in-reply-to": [URL_A] });
  });
});
