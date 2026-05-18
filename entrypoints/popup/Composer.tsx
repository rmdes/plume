import { useEffect, useState } from "preact/hooks";
import { AiMetadataPanel } from "../../components/AiMetadataPanel";
import { CategoryChips } from "../../components/CategoryChips";
import { SyndicateChips } from "../../components/SyndicateChips";
import { TypePicker } from "../../components/TypePicker";
import { MicropubClient } from "../../core/micropub-client";
import type { CreateOptions, PostType, ServerConfig, TokenData } from "../../core/types";
import { defaultsStore, queueStore } from "../../storage";
import { useComposerState } from "./useComposerState";
import { useDraftAutosave } from "./useDraftAutosave";

function classifyError(message: string): { retryable: boolean; authNeeded: boolean } {
  if (/^401\b/.test(message) || /unauthorized/i.test(message)) {
    return { retryable: false, authNeeded: true };
  }
  if (
    /network/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /^5\d\d/.test(message) ||
    /^429/.test(message)
  ) {
    return { retryable: true, authNeeded: false };
  }
  return { retryable: false, authNeeded: false };
}

interface Props {
  account: TokenData;
  seed?: Partial<CreateOptions & { type: PostType }>;
  serverConfig?: ServerConfig;
  enabledExtensions?: string[];
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

export function Composer({
  account,
  seed,
  serverConfig,
  enabledExtensions,
  onPosted,
  onError,
}: Props) {
  const { state, patch, setType } = useComposerState(seed);
  const [busy, setBusy] = useState(false);
  const [aiDefaults, setAiDefaults] = useState<Record<string, string | undefined>>({});
  useEffect(() => {
    defaultsStore()
      .get()
      .then((d) =>
        setAiDefaults({
          textLevel: d.aiMetadata?.textLevel,
          codeLevel: d.aiMetadata?.codeLevel,
          tools: d.aiMetadata?.tools,
          description: d.aiMetadata?.description,
        }),
      );
  }, []);

  const extProps = state.extensionProperties ?? {};
  const aiValues: Record<string, string> = {
    "ai-text-level": extProps["ai-text-level"]?.[0] ?? "",
    "ai-code-level": extProps["ai-code-level"]?.[0] ?? "",
    "ai-tools": extProps["ai-tools"]?.[0] ?? "",
    "ai-description": extProps["ai-description"]?.[0] ?? "",
  };

  // Hydrate target URL field from seed when reply/bookmark/etc.
  const [targetUrl, setTargetUrl] = useState<string>(
    seed?.inReplyTo ?? seed?.bookmarkOf ?? seed?.likeOf ?? seed?.repostOf ?? "",
  );

  useEffect(() => {
    if (!TARGET_TYPES.includes(state.type)) return;
    const field = targetFieldFor(state.type);
    patch({ [field]: targetUrl } as Partial<typeof state>);
  }, [targetUrl, state.type, patch]);

  const scope = state.bookmarkOf ?? state.inReplyTo ?? state.likeOf ?? state.repostOf ?? "general";
  useDraftAutosave({
    domain: new URL(account.me).hostname,
    scope,
    state,
  });

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
      if (payload.type === "quote") payload.type = "note";
      const result = await client.create(payload);
      onPosted(result.location);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const { retryable, authNeeded } = classifyError(msg);
      if (retryable || authNeeded) {
        const payload: CreateOptions = { ...state };
        if (payload.type === "quote") payload.type = "note";
        const id = await queueStore().enqueue({
          account: new URL(account.me).hostname,
          payload,
        });
        if (authNeeded) {
          await queueStore().recordAttempt(id, { error: msg, authNeeded: true });
        }
        onError(
          authNeeded
            ? `Auth expired. Saved to queue — reconnect in settings.`
            : `Network error — saved to retry queue.`,
        );
      } else {
        onError(`Failed: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  const needsTitle =
    state.type === "article" ||
    (state.type === "bookmark" && state.name !== undefined && state.name !== "");
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

      <CategoryChips
        values={state.category ?? []}
        suggestions={[]}
        onChange={(next) => patch({ category: next })}
      />
      <SyndicateChips
        targets={serverConfig?.["syndicate-to"] ?? []}
        values={state.syndicateTo ?? []}
        onChange={(next) => patch({ syndicateTo: next })}
      />

      {(enabledExtensions ?? []).includes("ai-metadata") && (
        <AiMetadataPanel
          values={aiValues}
          defaults={aiDefaults}
          onChange={(next) => {
            const ep: Record<string, string[]> = { ...(state.extensionProperties ?? {}) };
            for (const [k, v] of Object.entries(next)) {
              if (v) ep[k] = [v];
              else delete ep[k];
            }
            patch({ extensionProperties: ep });
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
