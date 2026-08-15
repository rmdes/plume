import { defaultsStore, logStore } from "../storage";
import type { LogLevel } from "../storage/logs";

/**
 * Fields worth keeping from a thrown value. Everything else is dropped rather
 * than filtered, because these logs are written to be pasted into a bug report
 * and a Micropub error can carry the request that produced it — including the
 * `Authorization: Bearer …` header.
 */
const SAFE_ERROR_FIELDS = ["name", "message", "status", "statusText", "method", "url"] as const;

/** Query parameters that carry credentials in the IndieAuth and Micropub flows. */
const SECRET_PARAMS = new Set(["access_token", "code", "code_verifier", "refresh_token", "state"]);

/**
 * Strip credentials from a URL, keeping enough to identify the request.
 */
function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of url.searchParams.keys()) {
      if (SECRET_PARAMS.has(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

/**
 * Reduce a thrown value to the few fields that are safe to record.
 */
export function sanitizeForLog(error: unknown): Record<string, unknown> {
  if (typeof error === "string") {
    return { message: redactUrl(error) };
  }

  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }

  const source = error as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const field of SAFE_ERROR_FIELDS) {
    const value = source[field];
    if (typeof value === "string") {
      safe[field] = field === "url" || field === "message" ? redactUrl(value) : value;
    } else if (typeof value === "number") {
      safe[field] = value;
    }
  }

  return Object.keys(safe).length > 0 ? safe : { message: String(error) };
}

let context = "unknown";

/** Names the surface these logs come from; called once per entrypoint. */
export function setLogContext(name: string): void {
  context = name;
}

async function write(level: LogLevel, message: string, error?: unknown): Promise<void> {
  try {
    // Errors are always recorded. Anything quieter is opt-in, so an enabled
    // log stays readable and a disabled one still explains a failure.
    if (level !== "error") {
      const { debugLogging } = await defaultsStore().get();
      if (!debugLogging) return;
    }

    await logStore().append({
      at: new Date().toISOString(),
      level,
      context,
      message,
      ...(error === undefined ? {} : { data: sanitizeForLog(error) }),
    });
  } catch {
    // Logging must never be the reason something fails.
  }
}

export const log = {
  error: (message: string, error?: unknown) => {
    console.error(`[plume] ${message}`, error ?? "");
    void write("error", message, error);
  },
  warn: (message: string, error?: unknown) => {
    console.warn(`[plume] ${message}`, error ?? "");
    void write("warn", message, error);
  },
  info: (message: string, data?: unknown) => {
    void write("info", message, data);
  },
};
