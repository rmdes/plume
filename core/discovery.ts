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
