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
