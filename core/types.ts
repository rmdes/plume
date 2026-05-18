export interface Endpoints {
  micropub: string;
  media_endpoint?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  microsub?: string;
}

export interface TokenData {
  me: string;
  access_token: string;
  token_type: "Bearer";
  scope: string;
  refresh_token?: string;
  expires_at?: string; // ISO 8601
  micropub_endpoint: string;
  media_endpoint?: string;
  token_endpoint: string;
  authorization_endpoint?: string;
}

export type PostType =
  | "note"
  | "article"
  | "reply"
  | "bookmark"
  | "like"
  | "repost"
  | "quote"
  | "photo"
  | "event";

export interface CreateOptions {
  type?: PostType;
  content?: string;
  name?: string;
  summary?: string;
  category?: string[];
  syndicateTo?: string[];
  inReplyTo?: string;
  likeOf?: string;
  repostOf?: string;
  bookmarkOf?: string;
  photo?: string[];
  video?: string[];
  audio?: string[];
  slug?: string;
  postStatus?: "published" | "draft";
  published?: string; // ISO 8601
  // Tier 3 extension properties — passed through if account has extension enabled
  extensionProperties?: Record<string, string[]>;
}

export interface UpdateOptions {
  url: string;
  replace?: Record<string, string[]>;
  add?: Record<string, string[]>;
  delete?: string[] | Record<string, string[]>;
}

export interface QueryOptions {
  q: "config" | "source" | "syndicate-to" | "post-types" | "category" | "channel";
  url?: string;
  properties?: string[];
  limit?: number;
  offset?: number;
}

export interface CreateResult {
  location: string;
  status: number;
}

export interface ServerConfig {
  "media-endpoint"?: string;
  "syndicate-to"?: Array<{ uid: string; name: string }>;
  "post-types"?: Array<{ type: string; name: string; properties?: string[] }>;
  channels?: Array<{ uid: string; name: string }>;
  "mp-extensions"?: Record<string, { properties: string[]; version: string }>;
}
