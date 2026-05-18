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
