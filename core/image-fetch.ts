export class ImageFetchError extends Error {
  constructor(
    message: string,
    public kind: "cors" | "http" | "other",
  ) {
    super(message);
    this.name = "ImageFetchError";
  }
}

export async function fetchImageAsBlob(url: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url, { mode: "cors", redirect: "follow" });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new ImageFetchError(
        `CORS blocked by host (${new URL(url).hostname}). Image not uploaded.`,
        "cors",
      );
    }
    throw new ImageFetchError(e instanceof Error ? e.message : String(e), "other");
  }
  if (!response.ok) {
    throw new ImageFetchError(`Failed to fetch image: ${response.status}`, "http");
  }
  return response.blob();
}

export function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").pop();
    return last && last.length > 0 ? last : "upload";
  } catch {
    return "upload";
  }
}
