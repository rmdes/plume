import { useEffect, useState } from "preact/hooks";
import { TypePicker } from "../../components/TypePicker";
import { MicropubClient } from "../../core/micropub-client";
import type { CreateOptions, PostType, TokenData } from "../../core/types";
import { useComposerState } from "./useComposerState";

interface Props {
  account: TokenData;
  seed?: Partial<CreateOptions & { type: PostType }>;
  onPosted: (location: string) => void;
  onError: (message: string) => void;
}

const TARGET_TYPES: PostType[] = ["reply", "bookmark", "like", "repost", "quote"];

function targetPlaceholder(type: PostType): string {
  switch (type) {
    case "reply":
      return "URL being replied to";
    case "quote":
      return "URL being quoted";
    case "bookmark":
      return "URL being bookmarked";
    case "like":
      return "URL being liked";
    case "repost":
      return "URL being reposted";
    default:
      return "URL";
  }
}

function targetFieldFor(type: PostType): keyof CreateOptions {
  if (type === "reply" || type === "quote") return "inReplyTo";
  if (type === "bookmark") return "bookmarkOf";
  if (type === "like") return "likeOf";
  return "repostOf";
}

export function Composer({ account, seed, onPosted, onError }: Props) {
  const { state, patch, setType } = useComposerState(seed);
  const [busy, setBusy] = useState(false);

  // Hydrate target URL field from seed when reply/bookmark/etc.
  const [targetUrl, setTargetUrl] = useState<string>(
    seed?.inReplyTo ?? seed?.bookmarkOf ?? seed?.likeOf ?? seed?.repostOf ?? "",
  );

  useEffect(() => {
    if (!TARGET_TYPES.includes(state.type)) return;
    const field = targetFieldFor(state.type);
    patch({ [field]: targetUrl } as Partial<typeof state>);
  }, [targetUrl, state.type, patch]);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      const client = new MicropubClient({
        micropubEndpoint: account.micropub_endpoint,
        mediaEndpoint: account.media_endpoint,
        token: account.access_token,
      });
      const payload: CreateOptions = { ...state };
      // type-tab "quote" is just a note with in-reply-to + blockquote content
      if (payload.type === "quote") payload.type = "note";
      const result = await client.create(payload);
      onPosted(result.location);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const needsTitle = state.type === "article";
  const needsTarget = TARGET_TYPES.includes(state.type);
  const allowsContent = state.type !== "like";

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, padding: 12 }}>
      <TypePicker value={state.type} onChange={setType} />

      {state.type === "photo" && state.photo?.[0] && (
        <figure style={{ margin: 0 }}>
          <img
            src={state.photo[0]}
            alt="Uploaded media preview"
            style={{
              maxWidth: "100%",
              maxHeight: 200,
              borderRadius: 4,
              objectFit: "cover",
            }}
          />
        </figure>
      )}

      {needsTarget && (
        <input
          type="url"
          required
          placeholder={targetPlaceholder(state.type)}
          value={targetUrl}
          onInput={(e) => setTargetUrl((e.currentTarget as HTMLInputElement).value)}
          style={{ width: "100%", padding: 8, fontSize: 13 }}
        />
      )}

      {needsTitle && (
        <input
          type="text"
          required
          placeholder="Title"
          value={state.name ?? ""}
          onInput={(e) => patch({ name: (e.currentTarget as HTMLInputElement).value })}
          style={{ width: "100%", padding: 8, fontSize: 16, fontWeight: 600 }}
        />
      )}

      {allowsContent && (
        <textarea
          placeholder="What's on your mind?"
          value={state.content ?? ""}
          onInput={(e) => patch({ content: (e.currentTarget as HTMLTextAreaElement).value })}
          rows={6}
          style={{
            width: "100%",
            padding: 8,
            fontSize: 14,
            fontFamily: "Lora, Georgia, serif",
            resize: "vertical",
          }}
        />
      )}

      <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#999", fontSize: 11 }}>{account.me}</span>
        <button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Post"}
        </button>
      </footer>
    </form>
  );
}
