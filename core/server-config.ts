import type { AccountStore } from "../storage/accounts";
import type { ServerConfig } from "./types";
import { MicropubClient } from "./micropub-client";

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchAndCacheServerConfig(
  accounts: AccountStore,
  domain: string,
): Promise<ServerConfig> {
  const account = await accounts.get(domain);
  if (!account) throw new Error(`No account for ${domain}`);

  const cached = account as unknown as {
    cached_config?: ServerConfig;
    cached_at?: string;
  };
  if (
    cached.cached_config &&
    cached.cached_at &&
    Date.now() - new Date(cached.cached_at).getTime() < CACHE_TTL_MS
  ) {
    return cached.cached_config;
  }

  const client = new MicropubClient({
    micropubEndpoint: account.micropub_endpoint,
    mediaEndpoint: account.media_endpoint,
    token: account.access_token,
  });

  const [configRes, postTypesRes, categoriesRes] = await Promise.all([
    safeQuery(client, "config"),
    safeQuery(client, "post-types"),
    safeQuery(client, "category"),
  ]);

  const merged: ServerConfig = {
    ...(configRes ?? {}),
    "post-types":
      (postTypesRes as { "post-types"?: ServerConfig["post-types"] })?.["post-types"] ??
      (configRes as ServerConfig | null)?.["post-types"],
  };

  const updated = {
    ...account,
    cached_config: merged,
    cached_categories: (categoriesRes as { categories?: string[] })?.categories ?? [],
    cached_at: new Date().toISOString(),
  };
  await accounts.update(domain, updated as typeof account);
  return merged;
}

async function safeQuery(
  client: MicropubClient,
  q: "config" | "post-types" | "category",
): Promise<Record<string, unknown> | null> {
  try {
    return (await client.query({ q })) as Record<string, unknown>;
  } catch {
    return null;
  }
}
