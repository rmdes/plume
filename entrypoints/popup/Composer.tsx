import { useEffect, useRef, useState } from "preact/hooks";
import { AiMetadataPanel } from "../../components/AiMetadataPanel";
import { CategoryChips } from "../../components/CategoryChips";
import { MarkdownPreview } from "../../components/MarkdownPreview";
import { MarkdownToolbar } from "../../components/MarkdownToolbar";
import { MediaPicker } from "../../components/MediaPicker";
import { SyndicateChips } from "../../components/SyndicateChips";
import { TypePicker } from "../../components/TypePicker";
import { MicropubClient } from "../../core/micropub-client";
import { fetchAndCacheServerConfig } from "../../core/server-config";
import type { CreateOptions, PostType, ServerConfig, TokenData } from "../../core/types";
import { accountStore, defaultsStore, queueStore } from "../../storage";
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
  // When rendered in a tab (via the pop-out button or openPopupSafe's
  // fallback), give the textarea more vertical room so article writing
  // doesn't feel cramped.
  isPopout?: boolean;
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
  isPopout = false,
  onPosted,
  onError,
}: Props) {
  const { state, patch, setType } = useComposerState(seed);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [aiDefaults, setAiDefaults] = useState<Record<string, string | undefined>>({});
  // Ref handed to the markdown toolbar so it can read the current selection
  // when applying wrap/prefix actions and restore the cursor afterward.
  const contentRef = useRef<HTMLTextAreaElement>(null);
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

      {state.type === "photo" && !state.photo?.[0] && (
        <div style={{ display: "grid", gap: 6 }}>
          <label
            style={{
              display: "grid",
              gap: 4,
              padding: 12,
              border: "1px dashed #ccc",
              borderRadius: 4,
              fontSize: 13,
              textAlign: "center",
              cursor: uploading ? "wait" : "pointer",
            }}
          >
            {uploading ? "Uploading…" : "Choose an image to upload"}
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              style={{ display: "none" }}
              onChange={async (e) => {
                const target = e.currentTarget as HTMLInputElement;
                const file = target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  // Self-heal: if account.media_endpoint is missing (server didn't
                  // advertise it via <link> tag on the homepage), look it up via
                  // ?q=config which fetchAndCacheServerConfig will write back to
                  // the account record for next time.
                  let mediaEndpoint = account.media_endpoint;
                  if (!mediaEndpoint) {
                    const domain = new URL(account.me).hostname;
                    const config = await fetchAndCacheServerConfig(accountStore(), domain);
                    mediaEndpoint = config["media-endpoint"];
                    if (!mediaEndpoint) {
                      throw new Error(
                        `Server at ${domain} has no media-endpoint configured. ` +
                          "Add one to your Indiekit config or check ?q=config response.",
                      );
                    }
                  }
                  const client = new MicropubClient({
                    micropubEndpoint: account.micropub_endpoint,
                    mediaEndpoint,
                    token: account.access_token,
                  });
                  const url = await client.uploadMedia(file, file.name);
                  patch({ photo: [url] });
                } catch (err) {
                  onError(err instanceof Error ? err.message : String(err));
                } finally {
                  setUploading(false);
                  target.value = "";
                }
              }}
            />
          </label>
          <button
            type="button"
            disabled={uploading}
            onClick={() => setShowMediaPicker(true)}
            style={{
              background: "none",
              border: "none",
              color: "#3b82f6",
              cursor: "pointer",
              fontSize: 12,
              padding: 0,
              textAlign: "center",
            }}
          >
            Or browse media already on your server →
          </button>
        </div>
      )}

      {showMediaPicker && (
        <MediaPicker
          account={account}
          onSelect={(item) => {
            patch({ photo: [item.url] });
            setShowMediaPicker(false);
          }}
          onClose={() => setShowMediaPicker(false)}
        />
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
        <div style={{ display: "grid", gap: 4 }}>
          <MarkdownToolbar
            textareaRef={contentRef}
            value={state.content ?? ""}
            onChange={(next) => patch({ content: next })}
            preview={showPreview}
            onTogglePreview={() => setShowPreview((v) => !v)}
            compact={!isPopout}
          />
          {showPreview ? (
            <MarkdownPreview
              source={state.content ?? ""}
              minHeight={isPopout ? 360 : state.type === "article" ? 220 : 120}
            />
          ) : (
            <textarea
              ref={contentRef}
              placeholder="What's on your mind? Markdown supported."
              value={state.content ?? ""}
              onInput={(e) => patch({ content: (e.currentTarget as HTMLTextAreaElement).value })}
              // Article writing needs vertical room. In popout mode use a much
              // larger default so long-form drafts don't feel cramped on first
              // sight; the textarea is still vertically resizable either way.
              rows={isPopout ? 20 : state.type === "article" ? 12 : 6}
              style={{
                width: "100%",
                padding: 8,
                fontSize: isPopout ? 15 : 14,
                fontFamily: "Lora, Georgia, serif",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          )}
        </div>
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
