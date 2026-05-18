import { test, expect } from "@playwright/test";
import { launchWithExtension, getExtensionId, seedAccount } from "./helpers";

test("queued post is visible in the options page retry list", async ({ browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox extension loading uses different harness — see tests/e2e/README.md",
  );
  const ctx = await launchWithExtension("chromium");
  const extId = await getExtensionId(ctx);
  await seedAccount(ctx, extId);

  // Inject a queued item directly into storage
  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await opts.evaluate(async () => {
    await chrome.storage.local.set({
      queue: [
        {
          id: "q_test",
          account: "localhost",
          createdAt: new Date().toISOString(),
          payload: { content: "retry me", type: "note" },
          status: "pending",
          attempts: [],
          nextAttempt: new Date().toISOString(),
        },
      ],
    });
  });

  // Reload so the QueueList component remounts and picks up the new state
  await opts.reload();

  await expect(opts.locator("text=retry me")).toBeVisible({ timeout: 5000 });
  await ctx.close();
});
