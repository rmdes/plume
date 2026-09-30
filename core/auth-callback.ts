import { CLIENT_ID } from "./auth-config";

/**
 * Where the tab-based sign-in lands. It sits on the client_id origin, which
 * IndieAuth accepts as a redirect target without allow-listing; the client_id
 * page lists it anyway for servers that check.
 */
export const CALLBACK_URL = new URL("callback.html", CLIENT_ID).href;

export interface CallbackMessage {
  type: "indieauth-callback";
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export type CallbackReply = { ok: true; domain: string } | { ok: false; error: string };

/** The authorization server's answer, read off the callback page's address. */
export function parseCallback(search: string): CallbackMessage {
  const params = new URLSearchParams(search);
  const message: CallbackMessage = { type: "indieauth-callback" };
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");
  if (code) message.code = code;
  if (state) message.state = state;
  if (error) message.error = error;
  if (errorDescription) message.errorDescription = errorDescription;
  return message;
}

export function isCallbackMessage(value: unknown): value is CallbackMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "indieauth-callback"
  );
}
