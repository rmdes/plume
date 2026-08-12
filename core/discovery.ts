import type { Endpoints } from "./types";

export function parseLinkHeaders(header: string | null): Record<string, string> {
  if (!header) return {};
  const links: Record<string, string> = {};
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match?.[1] && match[2]) {
      links[match[2]] = match[1];
    }
  }
  return links;
}

export function parseHtmlLinks(html: string): Record<string, string> {
  const links: Record<string, string> = {};
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const link of doc.querySelectorAll("link[rel][href]")) {
    const rel = link.getAttribute("rel");
    const href = link.getAttribute("href");
    if (rel && href) links[rel] = href;
  }
  return links;
}

/**
 * Origin match patterns (`https://host/*`) Plume must hold host permissions for
 * to talk to a server, given its discovered endpoints.
 *
 * Only endpoints Plume actually `fetch`es are included: micropub, token, and
 * media. `authorization_endpoint` is deliberately excluded — it is never
 * fetched, only opened in the browser's auth window, which needs no permission.
 *
 * Sites that delegate IndieAuth (e.g. `token_endpoint` on tokens.indieauth.com
 * while micropub stays on the blog) spread these across several origins, so
 * granting only the site's own origin leaves the token exchange to be blocked
 * by CORS — surfacing as an opaque "Failed to fetch".
 */
export function endpointOrigins(endpoints: Endpoints): string[] {
  const urls = [endpoints.micropub, endpoints.token_endpoint, endpoints.media_endpoint];
  const origins = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    try {
      origins.add(`${new URL(url).origin}/*`);
    } catch {
      // Relative or malformed href — nothing to request a permission for.
    }
  }
  return [...origins];
}

export async function discoverEndpoints(siteUrl: string): Promise<Endpoints> {
  const response = await fetch(siteUrl, {
    headers: { Accept: "text/html" },
    redirect: "follow",
  });
  const html = await response.text();
  const htmlLinks = parseHtmlLinks(html);
  const headerLinks = parseLinkHeaders(response.headers.get("Link"));
  const allLinks = { ...htmlLinks, ...headerLinks };

  if (allLinks["indieauth-metadata"]) {
    try {
      const metaResponse = await fetch(allLinks["indieauth-metadata"]);
      const metadata = (await metaResponse.json()) as Record<string, string>;
      if (metadata.authorization_endpoint) {
        allLinks.authorization_endpoint = metadata.authorization_endpoint;
      }
      if (metadata.token_endpoint) {
        allLinks.token_endpoint = metadata.token_endpoint;
      }
    } catch {
      // Fall back to what we already have from links
    }
  }

  if (!allLinks.micropub) {
    throw new Error(
      `Could not find micropub endpoint at ${siteUrl}. Ensure the site has a <link rel="micropub"> tag or Link header.`,
    );
  }

  return {
    micropub: allLinks.micropub,
    media_endpoint: allLinks["media-endpoint"],
    authorization_endpoint: allLinks.authorization_endpoint,
    token_endpoint: allLinks.token_endpoint,
    microsub: allLinks.microsub,
  };
}
