export async function fetchPageTitle(url: string, timeoutMs = 2000): Promise<string> {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    const html = await response.text();
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  } finally {
    clearTimeout(handle);
  }
}
