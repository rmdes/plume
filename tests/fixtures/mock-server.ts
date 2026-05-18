/**
 * Mock Micropub + IndieAuth server for E2E tests.
 * Run: bun tests/fixtures/mock-server.ts
 * Listens on http://localhost:18750
 *
 * Implements:
 *   GET /              → HTML with <link> tags for discovery
 *   GET /auth          → IndieAuth authorization endpoint (auto-approve)
 *   POST /auth/token   → token exchange + refresh
 *   GET /micropub      → ?q=config|post-types|category|syndicate-to|source
 *   POST /micropub     → create / update / delete / undelete
 *   POST /media        → multipart media upload
 *
 * Configurable via env vars:
 *   MOCK_AI_EXTENSION=1 → advertise ai-metadata in mp-extensions
 *   MOCK_FORCE_401=1    → all /micropub POST return 401
 *   MOCK_FORCE_503=N    → first N POSTs return 503
 */

const PORT = 18750;
const BASE = `http://localhost:${PORT}`;

const issuedCodes = new Map<string, { state: string; verifier_hash: string }>();
const tokens = new Set<string>(["e2e-token"]);
const posts = new Map<string, Record<string, unknown[]>>();
let force503Remaining = Number(process.env.MOCK_FORCE_503 ?? 0);

function discoveryHtml(): string {
  return `<!DOCTYPE html><html><head>
<link rel="micropub" href="${BASE}/micropub">
<link rel="authorization_endpoint" href="${BASE}/auth">
<link rel="token_endpoint" href="${BASE}/auth/token">
</head><body>Mock server</body></html>`;
}

function configJson(): Record<string, unknown> {
  const base: Record<string, unknown> = {
    "media-endpoint": `${BASE}/media`,
    "syndicate-to": [
      { uid: `${BASE}/syndication/bluesky`, name: "Bluesky" },
      { uid: `${BASE}/syndication/mastodon`, name: "Mastodon" },
    ],
    "post-types": [
      { type: "note", name: "Note" },
      { type: "article", name: "Article" },
      { type: "reply", name: "Reply" },
      { type: "bookmark", name: "Bookmark" },
    ],
  };
  if (process.env.MOCK_AI_EXTENSION === "1") {
    base["mp-extensions"] = {
      "ai-metadata": {
        properties: ["ai-text-level", "ai-code-level", "ai-tools", "ai-description"],
        version: "1",
      },
    };
  }
  return base;
}

function requireBearer(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/);
  if (!match) return false;
  const token = match[1];
  if (!token) return false;
  return tokens.has(token);
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/") {
      return new Response(discoveryHtml(), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // IndieAuth authorization endpoint (auto-approve for tests)
    if (req.method === "GET" && url.pathname === "/auth") {
      const code = `code_${Math.random().toString(36).slice(2, 10)}`;
      const state = url.searchParams.get("state") ?? "";
      const challenge = url.searchParams.get("code_challenge") ?? "";
      issuedCodes.set(code, { state, verifier_hash: challenge });
      const redirect = url.searchParams.get("redirect_uri");
      if (!redirect) {
        return new Response("missing redirect_uri", { status: 400 });
      }
      const redirectUrl = new URL(redirect);
      redirectUrl.searchParams.set("code", code);
      redirectUrl.searchParams.set("state", state);
      return new Response(null, {
        status: 302,
        headers: { Location: redirectUrl.toString() },
      });
    }

    // Token endpoint
    if (req.method === "POST" && url.pathname === "/auth/token") {
      const body = await req.formData();
      const grant = body.get("grant_type");
      if (grant === "authorization_code") {
        const code = body.get("code") as string;
        if (!issuedCodes.has(code)) {
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        }
        issuedCodes.delete(code);
        const access = `tok_${Math.random().toString(36).slice(2, 10)}`;
        tokens.add(access);
        return Response.json({
          me: `${BASE}/`,
          access_token: access,
          token_type: "Bearer",
          scope: "create update delete media",
          refresh_token: `refresh_${access}`,
          expires_in: 3600,
        });
      }
      if (grant === "refresh_token") {
        const access = `tok_${Math.random().toString(36).slice(2, 10)}`;
        tokens.add(access);
        return Response.json({
          access_token: access,
          token_type: "Bearer",
          scope: "create update delete media",
          expires_in: 3600,
        });
      }
      return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
    }

    // Micropub
    if (url.pathname === "/micropub") {
      if (process.env.MOCK_FORCE_401 === "1") {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      if (req.method === "GET") {
        const q = url.searchParams.get("q");
        if (q === "config") return Response.json(configJson());
        if (q === "post-types") {
          return Response.json({ "post-types": configJson()["post-types"] });
        }
        if (q === "category") return Response.json({ categories: ["indieweb", "test"] });
        if (q === "syndicate-to") {
          return Response.json({ "syndicate-to": configJson()["syndicate-to"] });
        }
        if (q === "source") return Response.json({ properties: {} });
        return Response.json({ error: "invalid_request" }, { status: 400 });
      }
      if (req.method === "POST") {
        if (!requireBearer(req)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        if (force503Remaining > 0) {
          force503Remaining--;
          return new Response("Service Unavailable", { status: 503 });
        }
        const ctype = req.headers.get("Content-Type") ?? "";
        let payload: Record<string, unknown>;
        if (ctype.includes("application/json")) {
          payload = (await req.json()) as Record<string, unknown>;
        } else {
          const form = await req.formData();
          payload = Object.fromEntries(form.entries());
        }
        const action = payload.action as string | undefined;
        if (action === "delete" || action === "undelete") {
          return new Response(null, { status: 200 });
        }
        if (action === "update") {
          return new Response(null, { status: 200 });
        }
        const id = Math.random().toString(36).slice(2, 8);
        posts.set(id, (payload as { properties?: Record<string, unknown[]> }).properties ?? {});
        return new Response(null, {
          status: 201,
          headers: { Location: `${BASE}/posts/${id}` },
        });
      }
    }

    // Media endpoint
    if (url.pathname === "/media" && req.method === "POST") {
      if (!requireBearer(req)) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const id = Math.random().toString(36).slice(2, 8);
      return new Response(null, {
        status: 201,
        headers: { Location: `${BASE}/files/${id}.png` },
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.error(`Mock Micropub server listening on ${BASE}`);
