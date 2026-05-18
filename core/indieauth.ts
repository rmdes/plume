import { discoverEndpoints } from "./discovery";
import { generatePKCE } from "./pkce";
import type { Endpoints, TokenData } from "./types";

/**
 * A function that performs the OAuth browser dance and returns the redirect URL
 * with `?code=...&state=...` query params. In production this wraps
 * chrome.identity.launchWebAuthFlow; in tests, it can be stubbed.
 */
export type AuthLauncher = (authUrl: string) => Promise<string>;

export interface StartAuthArgs {
  siteUrl: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  launcher: AuthLauncher;
}

export async function startAuth(args: StartAuthArgs): Promise<TokenData> {
  const endpoints = await discoverEndpoints(args.siteUrl);
  if (!endpoints.authorization_endpoint || !endpoints.token_endpoint) {
    throw new Error(
      `Could not find authorization or token endpoint at ${args.siteUrl}. ` +
        "Ensure the site supports IndieAuth.",
    );
  }

  const pkce = await generatePKCE();
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authUrl = new URL(endpoints.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", args.clientId);
  authUrl.searchParams.set("redirect_uri", args.redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", args.scope);
  authUrl.searchParams.set("code_challenge", pkce.challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("me", args.siteUrl);

  const redirectResult = await args.launcher(authUrl.toString());
  const redirectUrl = new URL(redirectResult);
  const code = redirectUrl.searchParams.get("code");
  const returnedState = redirectUrl.searchParams.get("state");

  if (!code) throw new Error("Authorization response missing code");
  if (returnedState !== state) throw new Error("State mismatch — possible CSRF");

  return exchangeCode({
    code,
    verifier: pkce.verifier,
    redirectUri: args.redirectUri,
    clientId: args.clientId,
    endpoints,
  });
}

export interface ExchangeCodeArgs {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  endpoints: Endpoints;
}

export async function exchangeCode(args: ExchangeCodeArgs): Promise<TokenData> {
  if (!args.endpoints.token_endpoint) {
    throw new Error("Token endpoint required for code exchange");
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    code_verifier: args.verifier,
  });
  const response = await fetch(args.endpoints.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    let msg = `Token exchange failed (${response.status})`;
    try {
      const parsed = JSON.parse(text) as Record<string, string>;
      if (parsed.error) msg = `${parsed.error}: ${parsed.error_description ?? ""}`;
    } catch {
      msg += `: ${text}`;
    }
    throw new Error(msg);
  }
  const data = (await response.json()) as Record<string, unknown>;
  if (data.error) {
    throw new Error(`Token exchange error: ${data.error} — ${data.error_description ?? ""}`);
  }
  const expiresIn = data.expires_in as number | undefined;
  return {
    me: data.me as string,
    access_token: data.access_token as string,
    token_type: "Bearer",
    scope: (data.scope as string) || "create update delete media",
    refresh_token: data.refresh_token as string | undefined,
    expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
    micropub_endpoint: args.endpoints.micropub,
    media_endpoint: args.endpoints.media_endpoint,
    token_endpoint: args.endpoints.token_endpoint,
    authorization_endpoint: args.endpoints.authorization_endpoint,
  };
}

export async function refreshToken(existing: TokenData, clientId: string): Promise<TokenData> {
  if (!existing.refresh_token) {
    throw new Error("No refresh token available — re-authentication required");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: existing.refresh_token,
    client_id: clientId,
  });
  const response = await fetch(existing.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status}) — re-authentication required`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const expiresIn = data.expires_in as number | undefined;
  return {
    ...existing,
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string | undefined) || existing.refresh_token,
    expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
  };
}

export function isExpired(token: TokenData, marginSeconds = 60): boolean {
  if (!token.expires_at) return false;
  return new Date(token.expires_at).getTime() < Date.now() + marginSeconds * 1000;
}
