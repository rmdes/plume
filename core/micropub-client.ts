import { log } from "./logger";
import type {
  CreateOptions,
  CreateResult,
  ListMediaOptions,
  MediaListResponse,
  QueryOptions,
  UpdateOptions,
} from "./types";

export interface MicropubClientConfig {
  micropubEndpoint: string;
  mediaEndpoint?: string;
  token: string;
}

export class MicropubClient {
  private endpoint: string;
  protected mediaEndpoint?: string;
  private token: string;

  constructor(config: MicropubClientConfig) {
    this.endpoint = config.micropubEndpoint;
    this.mediaEndpoint = config.mediaEndpoint;
    this.token = config.token;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
  }

  private async checkError(response: Response): Promise<void> {
    if (response.ok) return;
    let message = `Micropub error (${response.status})`;
    try {
      const body = (await response.json()) as Record<string, string>;
      if (body.error) {
        message = body.error;
        if (body.error_description) message += `: ${body.error_description}`;
      }
    } catch {
      // not JSON, keep default message
    }
    throw new Error(message);
  }

  /**
   * Micropub's JSON syntax requires every property value to be an array, and
   * the fields below are the ones passed through from composer state rather
   * than wrapped here. TypeScript types them as arrays but cannot enforce that
   * on values restored from storage, and a server handed the wrong shape fails
   * in its own terms — one reply-to-a-post report surfaced as
   * `syndicateTo?.includes is not a function` thrown inside Indiekit.
   *
   * Coerce rather than throw: the post is what the user asked for, and losing
   * it to a malformed optional field would be worse than sending it. The
   * coercion is logged, since a non-array arriving here means something
   * upstream stored the wrong shape and that is worth finding.
   */
  private static toValues(name: string, value: unknown): unknown[] {
    if (Array.isArray(value)) return value;

    log.warn(`coerced non-array "${name}" property`, {
      message: `expected an array, got ${value === null ? "null" : typeof value}`,
    });
    return [value];
  }

  /**
   * Like `toValues`, but drops anything that is not a string.
   *
   * Wrapping alone is not enough for `mp-syndicate-to`: servers convert mf2 to
   * JF2 before reading it, and that collapses a single-element array back to a
   * bare value — so `[{…}]` arrives as an object again and `.includes` throws.
   * Syndication targets are always uid strings, so anything else is dropped
   * rather than forwarded.
   */
  private static toStringValues(name: string, value: unknown): string[] {
    const values = Array.isArray(value) ? value : [value];
    const strings = values.filter((v): v is string => typeof v === "string");

    if (strings.length !== values.length || !Array.isArray(value)) {
      log.warn(`dropped unusable "${name}" values`, {
        message: `expected an array of strings, got ${
          Array.isArray(value)
            ? `array containing ${values.length - strings.length} non-string`
            : typeof value
        }`,
      });
    }
    return strings;
  }

  async create(options: CreateOptions): Promise<CreateResult> {
    const toValues = MicropubClient.toValues;
    const properties: Record<string, unknown[]> = {};
    if (options.content) properties.content = [options.content];
    if (options.name) properties.name = [options.name];
    if (options.summary) properties.summary = [options.summary];
    if (options.published) properties.published = [options.published];
    if (options.category) properties.category = toValues("category", options.category);
    if (options.syndicateTo) {
      // Omitted entirely when nothing usable survives, rather than sent empty
      const syndicateTo = MicropubClient.toStringValues("mp-syndicate-to", options.syndicateTo);
      if (syndicateTo.length > 0) properties["mp-syndicate-to"] = syndicateTo;
    }
    if (options.inReplyTo) properties["in-reply-to"] = [options.inReplyTo];
    if (options.likeOf) properties["like-of"] = [options.likeOf];
    if (options.repostOf) properties["repost-of"] = [options.repostOf];
    if (options.bookmarkOf) properties["bookmark-of"] = [options.bookmarkOf];
    if (options.photo) properties.photo = toValues("photo", options.photo);
    if (options.video) properties.video = toValues("video", options.video);
    if (options.audio) properties.audio = toValues("audio", options.audio);
    if (options.slug) properties["mp-slug"] = [options.slug];
    if (options.postStatus) properties["post-status"] = [options.postStatus];
    if (options.extensionProperties) {
      for (const [key, value] of Object.entries(options.extensionProperties)) {
        properties[key] = toValues(key, value);
      }
    }

    const hType = options.type === "event" ? "h-event" : "h-entry";
    const body = { type: [hType], properties };

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    await this.checkError(response);

    const location = response.headers.get("Location");
    if (!location) {
      throw new Error("Server returned success but no Location header");
    }
    return { location, status: response.status };
  }

  async update(options: UpdateOptions): Promise<void> {
    const body: Record<string, unknown> = { action: "update", url: options.url };
    if (options.replace) body.replace = options.replace;
    if (options.add) body.add = options.add;
    if (options.delete) body.delete = options.delete;
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    await this.checkError(response);
  }

  async delete(url: string): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ action: "delete", url }),
    });
    await this.checkError(response);
  }

  async undelete(url: string): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ action: "undelete", url }),
    });
    await this.checkError(response);
  }

  async query(options: QueryOptions): Promise<unknown> {
    const url = new URL(this.endpoint);
    url.searchParams.set("q", options.q);
    if (options.url) url.searchParams.set("url", options.url);
    if (options.limit !== undefined) url.searchParams.set("limit", String(options.limit));
    if (options.offset !== undefined) url.searchParams.set("offset", String(options.offset));
    if (options.properties) {
      for (const prop of options.properties) {
        url.searchParams.append("properties[]", prop);
      }
    }
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
    });
    await this.checkError(response);
    return response.json();
  }

  async uploadMedia(blob: Blob, filename: string): Promise<string> {
    if (!this.mediaEndpoint) {
      throw new Error("No media endpoint configured. Query ?q=config to check.");
    }
    const formData = new FormData();
    formData.append("file", blob, filename);
    const response = await fetch(this.mediaEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: formData,
    });
    await this.checkError(response);
    const location = response.headers.get("Location");
    if (!location) {
      throw new Error("Media endpoint returned success but no Location header");
    }
    return location;
  }

  /**
   * List existing media files on the server via `?q=source` on the media endpoint.
   *
   * This is a Micropub extension (not in the core W3C spec) that Indiekit and
   * several other servers implement. Returns a paginated `items` array with
   * `url`, `uid`, `media-type`, `published`, plus optional `paging.after` /
   * `paging.before` cursors for navigation.
   */
  async listMedia(options: ListMediaOptions = {}): Promise<MediaListResponse> {
    if (!this.mediaEndpoint) {
      throw new Error("No media endpoint configured. Query ?q=config to check.");
    }
    const url = new URL(this.mediaEndpoint);
    url.searchParams.set("q", "source");
    if (options.limit !== undefined) url.searchParams.set("limit", String(options.limit));
    if (options.after) url.searchParams.set("after", options.after);
    if (options.before) url.searchParams.set("before", options.before);
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });
    await this.checkError(response);
    return response.json() as Promise<MediaListResponse>;
  }
}
