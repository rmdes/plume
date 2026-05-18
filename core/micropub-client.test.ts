import { beforeEach, describe, expect, it, vi } from "vitest";
import { MicropubClient } from "./micropub-client";

const config = {
  micropubEndpoint: "https://example.com/micropub",
  mediaEndpoint: "https://example.com/media",
  token: "test-token",
};

describe("MicropubClient.create", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts JSON h-entry with content", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(null, { status: 201, headers: { Location: "https://example.com/note/1" } }),
      );
    const client = new MicropubClient(config);
    const result = await client.create({ content: "hello" });
    expect(result.location).toBe("https://example.com/note/1");
    expect(result.status).toBe(201);
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const [url, init] = call;
    expect(url).toBe("https://example.com/micropub");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ type: ["h-entry"], properties: { content: ["hello"] } });
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("includes all standard properties", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(null, { status: 201, headers: { Location: "https://example.com/post/1" } }),
      );
    const client = new MicropubClient(config);
    await client.create({
      content: "body",
      name: "Title",
      summary: "summary",
      category: ["tag1", "tag2"],
      syndicateTo: ["https://example.com/syndication/bluesky"],
      inReplyTo: "https://example.com/post",
      photo: ["https://example.com/photo.jpg"],
      slug: "my-slug",
      postStatus: "draft",
      published: "2026-05-17T14:30:00.000Z",
    });
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.properties).toEqual({
      content: ["body"],
      name: ["Title"],
      summary: ["summary"],
      category: ["tag1", "tag2"],
      "mp-syndicate-to": ["https://example.com/syndication/bluesky"],
      "in-reply-to": ["https://example.com/post"],
      photo: ["https://example.com/photo.jpg"],
      "mp-slug": ["my-slug"],
      "post-status": ["draft"],
      published: ["2026-05-17T14:30:00.000Z"],
    });
  });

  it("includes extension properties passed through", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 201, headers: { Location: "x" } }));
    const client = new MicropubClient(config);
    await client.create({
      content: "with ai metadata",
      extensionProperties: {
        "ai-text-level": ["2"],
        "ai-tools": ["Claude"],
      },
    });
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.properties["ai-text-level"]).toEqual(["2"]);
    expect(body.properties["ai-tools"]).toEqual(["Claude"]);
  });

  it("uses h-event for event type", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 201, headers: { Location: "x" } }));
    const client = new MicropubClient(config);
    await client.create({ type: "event", name: "My event" });
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.type).toEqual(["h-event"]);
  });

  it("throws when server returns success but no Location header", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    const client = new MicropubClient(config);
    await expect(client.create({ content: "x" })).rejects.toThrow(/no Location header/);
  });

  it("throws with server error message on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_request", error_description: "Bad" }), {
        status: 400,
      }),
    );
    const client = new MicropubClient(config);
    await expect(client.create({ content: "x" })).rejects.toThrow(/invalid_request: Bad/);
  });
});

describe("MicropubClient.update", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts update action with replace + add + delete", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new MicropubClient(config);
    await client.update({
      url: "https://example.com/post/1",
      replace: { content: ["new content"] },
      add: { category: ["new-tag"] },
      delete: ["summary"],
    });
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toEqual({
      action: "update",
      url: "https://example.com/post/1",
      replace: { content: ["new content"] },
      add: { category: ["new-tag"] },
      delete: ["summary"],
    });
  });
});

describe("MicropubClient.delete and undelete", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts delete action", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new MicropubClient(config);
    await client.delete("https://example.com/post/1");
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toEqual({ action: "delete", url: "https://example.com/post/1" });
  });

  it("posts undelete action", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new MicropubClient(config);
    await client.undelete("https://example.com/post/1");
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toEqual({ action: "undelete", url: "https://example.com/post/1" });
  });
});

describe("MicropubClient.query", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("queries config", async () => {
    const expected = { "media-endpoint": "https://example.com/media" };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(expected), { status: 200 }));
    const client = new MicropubClient(config);
    const result = await client.query({ q: "config" });
    expect(result).toEqual(expected);
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("no fetch call recorded");
    expect(String(call[0])).toContain("?q=config");
  });

  it("queries source with url + properties", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const client = new MicropubClient(config);
    await client.query({
      q: "source",
      url: "https://example.com/post/1",
      properties: ["content", "name"],
    });
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("no fetch call recorded");
    const url = String(call[0]);
    expect(url).toContain("q=source");
    expect(url).toContain("url=https");
    expect(url).toContain("properties%5B%5D=content");
    expect(url).toContain("properties%5B%5D=name");
  });
});

describe("MicropubClient.uploadMedia", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uploads a Blob and returns Location URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 201,
        headers: { Location: "https://example.com/files/abc.png" },
      }),
    );
    const client = new MicropubClient(config);
    const blob = new Blob(["fake-image-data"], { type: "image/png" });
    const url = await client.uploadMedia(blob, "photo.png");
    expect(url).toBe("https://example.com/files/abc.png");
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error("no fetch call recorded");
    expect(call[0]).toBe("https://example.com/media");
  });

  it("throws when media endpoint not configured", async () => {
    const client = new MicropubClient({ ...config, mediaEndpoint: undefined });
    const blob = new Blob([], { type: "image/png" });
    await expect(client.uploadMedia(blob, "x.png")).rejects.toThrow(/No media endpoint/);
  });
});
