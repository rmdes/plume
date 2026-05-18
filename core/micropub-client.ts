import type { CreateOptions, CreateResult, UpdateOptions } from "./types";

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

  async create(options: CreateOptions): Promise<CreateResult> {
    const properties: Record<string, unknown[]> = {};
    if (options.content) properties.content = [options.content];
    if (options.name) properties.name = [options.name];
    if (options.summary) properties.summary = [options.summary];
    if (options.published) properties.published = [options.published];
    if (options.category) properties.category = options.category;
    if (options.syndicateTo) properties["mp-syndicate-to"] = options.syndicateTo;
    if (options.inReplyTo) properties["in-reply-to"] = [options.inReplyTo];
    if (options.likeOf) properties["like-of"] = [options.likeOf];
    if (options.repostOf) properties["repost-of"] = [options.repostOf];
    if (options.bookmarkOf) properties["bookmark-of"] = [options.bookmarkOf];
    if (options.photo) properties.photo = options.photo;
    if (options.video) properties.video = options.video;
    if (options.audio) properties.audio = options.audio;
    if (options.slug) properties["mp-slug"] = [options.slug];
    if (options.postStatus) properties["post-status"] = [options.postStatus];
    if (options.extensionProperties) {
      for (const [key, value] of Object.entries(options.extensionProperties)) {
        properties[key] = value;
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
}
