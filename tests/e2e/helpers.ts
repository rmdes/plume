import { chromium, firefox, type BrowserContext } from "@playwright/test";
import path from "node:path";

const EXT_DIR = path.resolve("./.output/chrome-mv3");

export async function launchWithExtension(
  browserName: "chromium" | "firefox",
): Promise<BrowserContext> {
  if (browserName === "chromium") {
    return chromium.launchPersistentContext("", {
      headless: false, // MV3 service workers don't run in headless
      args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
    });
  }
  // Firefox: web-ext loading is documented in tests/e2e/README.md (T55)
  // For now, return a regular Firefox context (Firefox E2E is manual smoke for v1.0)
  const browser = await firefox.launch({ headless: false });
  return browser.newContext();
}

export async function getExtensionId(ctx: BrowserContext): Promise<string> {
  // Trigger service worker init
  const [page] = ctx.pages();
  if (!page) throw new Error("No page in context");
  await page.goto("about:blank");
  await page.waitForTimeout(500);
  const workers = ctx.serviceWorkers();
  if (workers.length === 0) throw new Error("No service worker found");
  const worker = workers[0];
  if (!worker) throw new Error("Service worker is undefined");
  const url = worker.url();
  const match = url.match(/^chrome-extension:\/\/([a-z]+)\//);
  if (!match || !match[1]) throw new Error(`Cannot parse extension ID from ${url}`);
  return match[1];
}

/** Inject an account into chrome.storage.local so we skip the IndieAuth flow. */
export async function seedAccount(
  ctx: BrowserContext,
  extensionId: string,
  baseUrl = "http://localhost:18750",
): Promise<void> {
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
      const domain = new URL(token.me).hostname;
      await chrome.storage.local.set({
        accounts: { [domain]: token },
        defaults: { activeAccount: domain, syndicateTo: [] },
      });
    },
    { baseUrl },
  );
  await page.close();
}
