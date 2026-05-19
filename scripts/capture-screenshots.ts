#!/usr/bin/env bun
/**
 * Capture Chrome Web Store + Mozilla AMO listing screenshots.
 *
 * Produces 4 PNGs at 1280×800 in docs/store-listings/screenshots/, each
 * showing one of Plume's headline surfaces with a polished gradient
 * background so the popup reads as a focused promotional shot rather than
 * a default-white window screenshot.
 *
 * Run after `bun run build` so the extension exists in .output/chrome-mv3/.
 * Spins up the mock Micropub server (port 18750), launches Chromium with the
 * built extension loaded, seeds an account, captures four scenes, and writes
 * the PNGs out.
 *
 *   bun scripts/capture-screenshots.ts
 *
 * Override the output dir with --out=path or env var SCREENSHOTS_OUT.
 */
import { type BrowserContext, chromium, type Page } from "@playwright/test";
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EXT_DIR = path.resolve("./.output/chrome-mv3");
const MOCK_SERVER_SCRIPT = path.resolve("./tests/fixtures/mock-server.ts");
const MOCK_BASE = "http://localhost:18750";
const OUT_DIR =
  process.env.SCREENSHOTS_OUT ??
  process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length) ??
  path.resolve("./docs/store-listings/screenshots");

const VIEWPORT = { width: 1280, height: 800 };

// Wrap the loaded popup in a centered gradient frame with a soft shadow
// so the screenshot looks promotional rather than like a raw window grab.
const FRAME_CSS = `
  body {
    background: linear-gradient(135deg, #f0f4f8 0%, #cbd5e0 100%);
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    font-family: system-ui, sans-serif;
  }
  #app {
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25),
                0 12px 20px -8px rgba(0, 0, 0, 0.1);
    border-radius: 10px;
    overflow: hidden;
    background: white;
  }
`;

const OPTIONS_FRAME_CSS = `
  body {
    background: linear-gradient(135deg, #f0f4f8 0%, #cbd5e0 100%);
    margin: 0;
    padding: 40px;
    box-sizing: border-box;
    min-height: 100vh;
    font-family: system-ui, sans-serif;
  }
  main {
    background: white;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25),
                0 12px 20px -8px rgba(0, 0, 0, 0.1);
    border-radius: 10px;
    margin: 0 auto !important;
    padding: 32px !important;
  }
`;

function prepareTestExtensionDir(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plume-screenshots-"));
  fs.cpSync(EXT_DIR, tmp, { recursive: true });
  const manifestPath = path.join(tmp, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    host_permissions?: string[];
  };
  manifest.host_permissions = Array.from(
    new Set([...(manifest.host_permissions ?? []), `${MOCK_BASE}/*`]),
  );
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  return tmp;
}

async function startMockServer(): Promise<ChildProcess> {
  const proc = spawn("bun", [MOCK_SERVER_SCRIPT], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  // Wait for "listening" log on stderr (mock server writes startup banner there)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Mock server start timeout")), 5000);
    proc.stderr?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on("error", reject);
  });
  return proc;
}

async function getExtensionId(ctx: BrowserContext): Promise<string> {
  const [page] = ctx.pages();
  if (!page) throw new Error("No page in context");
  await page.goto("about:blank");
  await page.waitForTimeout(500);
  const workers = ctx.serviceWorkers();
  const worker = workers[0];
  if (!worker) throw new Error("No service worker found");
  const match = worker.url().match(/^chrome-extension:\/\/([a-z]+)\//);
  if (!match?.[1]) throw new Error(`Cannot parse extension ID from ${worker.url()}`);
  return match[1];
}

async function seedAccount(ctx: BrowserContext, extensionId: string): Promise<void> {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate(
    async ({ baseUrl }) => {
      const token = {
        me: `${baseUrl}/`,
        access_token: "e2e-token",
        token_type: "Bearer",
        scope: "create update delete media",
        micropub_endpoint: `${baseUrl}/micropub`,
        media_endpoint: `${baseUrl}/media`,
        token_endpoint: `${baseUrl}/auth/token`,
        authorization_endpoint: `${baseUrl}/auth`,
      };
      await chrome.storage.local.set({
        accounts: { [new URL(token.me).hostname]: token },
        defaults: { activeAccount: new URL(token.me).hostname, syndicateTo: [] },
      });
    },
    { baseUrl: MOCK_BASE },
  );
  await page.close();
}

async function setPrefill(
  ctx: BrowserContext,
  extensionId: string,
  prefill: Record<string, unknown>,
): Promise<void> {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate(async (p) => {
    await chrome.storage.session.set({ pendingPrefill: p });
  }, prefill);
  await page.close();
}

interface Scene {
  filename: string;
  url: (extId: string) => string;
  prefill?: Record<string, unknown>;
  prepare: (page: Page) => Promise<void>;
}

const scenes: Scene[] = [
  {
    filename: "1-compose-note.png",
    url: (id) => `chrome-extension://${id}/popup.html`,
    async prepare(page) {
      await page.addStyleTag({ content: FRAME_CSS });
      await page.waitForSelector("textarea", { timeout: 5000 });
      await page.fill(
        "textarea",
        "Just shipped Plume v1.0 — post to my IndieWeb blog from any page. 🪶",
      );
      // Add a few tags via the chip input
      const tagInput = page.locator('input[list="cat-suggestions"]');
      await tagInput.fill("indieweb");
      await tagInput.press("Enter");
      await tagInput.fill("plume");
      await tagInput.press("Enter");
      await page.waitForTimeout(300);
    },
  },
  {
    filename: "2-bookmark-prefilled.png",
    url: (id) => `chrome-extension://${id}/popup.html`,
    prefill: {
      type: "bookmark",
      bookmarkOf: "https://indieweb.org/Micropub",
      name: "Micropub — IndieWeb",
      content: "",
    },
    async prepare(page) {
      await page.addStyleTag({ content: FRAME_CSS });
      await page.waitForSelector('input[type="url"]', { timeout: 5000 });
      // The bookmark prefill auto-populates URL + title; fill in a short note
      const textareas = page.locator("textarea");
      if ((await textareas.count()) > 0) {
        await textareas.first().fill("Worth re-reading before any new Micropub work.");
      }
      await page.waitForTimeout(300);
    },
  },
  {
    filename: "3-options-accounts.png",
    url: (id) => `chrome-extension://${id}/options.html`,
    async prepare(page) {
      // Seed a draft + a queued item so the options page reads as lived-in
      // (rather than showing a single sparse account row with no other state).
      await page.evaluate(async () => {
        const now = new Date().toISOString();
        await chrome.storage.local.set({
          drafts: {
            "localhost::general": {
              type: "note",
              content: "Half-typed thoughts on rendering microformats2…",
              savedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            },
            "localhost::https://aaronpk.com/2026/04/post": {
              type: "bookmark",
              bookmarkOf: "https://aaronpk.com/2026/04/post",
              name: "Aaron's IndieAuth update",
              content: "good context for the spec discussion",
              savedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
            },
          },
          queue: [
            {
              id: "q_demo1",
              account: "localhost",
              createdAt: now,
              payload: {
                type: "note",
                content: "Network was flaky — this will retry in the background",
              },
              status: "pending",
              attempts: [{ at: now, error: "503 Service Unavailable" }],
              nextAttempt: new Date(Date.now() + 30_000).toISOString(),
            },
          ],
        });
      });
      // Reload so the AccountList / DraftList / QueueList re-fetch storage
      await page.reload();
      await page.addStyleTag({ content: OPTIONS_FRAME_CSS });
      await page.waitForSelector("h1", { timeout: 5000 });
      await page.waitForSelector('button:has-text("Remove")', { timeout: 3000 });
      // Wait for drafts + queue sections to mount
      await page.waitForSelector("text=Drafts (", { timeout: 3000 });
      await page.waitForSelector("text=Retry queue (", { timeout: 3000 });
      await page.waitForTimeout(500);
    },
  },
  {
    filename: "4-posted-toast.png",
    url: (id) => `chrome-extension://${id}/popup.html`,
    async prepare(page) {
      await page.addStyleTag({ content: FRAME_CSS });
      await page.waitForSelector("textarea", { timeout: 5000 });
      await page.fill(
        "textarea",
        "Just shipped Plume v1.0 — post to my IndieWeb blog from any page. 🪶",
      );
      await page.click('button[type="submit"]');
      // Wait for the success toast to appear (before the 800ms auto-close)
      await page.waitForSelector('[role="status"]', { timeout: 5000 });
      // Intercept the window.close() so the popup stays for the screenshot
      await page.evaluate(() => {
        window.close = () => {};
      });
      await page.waitForTimeout(300);
    },
  },
];

async function main(): Promise<void> {
  if (!fs.existsSync(EXT_DIR)) {
    console.error(`Extension not built. Run 'bun run build' first.`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.info("Starting mock server…");
  const mock = await startMockServer();
  console.info(`Mock server listening on ${MOCK_BASE}`);

  console.info("Preparing test extension dir…");
  const extDir = prepareTestExtensionDir();

  console.info("Launching Chromium with extension loaded…");
  const ctx = await chromium.launchPersistentContext("", {
    headless: false,
    viewport: VIEWPORT,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });

  try {
    const extId = await getExtensionId(ctx);
    console.info(`Extension ID: ${extId}`);
    await seedAccount(ctx, extId);

    for (const scene of scenes) {
      console.info(`Capturing ${scene.filename}…`);
      if (scene.prefill) {
        await setPrefill(ctx, extId, scene.prefill);
      }
      const page = await ctx.newPage();
      await page.setViewportSize(VIEWPORT);
      await page.goto(scene.url(extId));
      await scene.prepare(page);
      const outPath = path.join(OUT_DIR, scene.filename);
      await page.screenshot({ path: outPath, fullPage: false });
      await page.close();
      console.info(`  → ${outPath}`);
    }

    console.info(`\nDone. ${scenes.length} screenshots in ${OUT_DIR}`);
  } finally {
    await ctx.close();
    mock.kill();
    // Best-effort cleanup of tmp ext dir
    try {
      fs.rmSync(extDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
