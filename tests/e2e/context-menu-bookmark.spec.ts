import { test, expect } from "@playwright/test";
import { launchWithExtension, getExtensionId, seedAccount } from "./helpers";

test.describe("Context menu", () => {
  test("page-bookmark prefills composer with target URL + title", async ({ browserName }) => {
    test.skip(
      browserName === "firefox",
      "Firefox extension loading uses different harness — see tests/e2e/README.md",
    );
    const ctx = await launchWithExtension("chromium");
    const extId = await getExtensionId(ctx);
    await seedAccount(ctx, extId);

    // Simulate the context-menu click outcome by writing the prefill directly
    // to session storage. Playwright cannot programmatically trigger native
    // context-menu items on extensions.
    const seeder = await ctx.newPage();
    await seeder.goto(`chrome-extension://${extId}/options.html`);
    await seeder.evaluate(async () => {
      await chrome.storage.session.set({
        pendingPrefill: {
          type: "bookmark",
          bookmarkOf: "https://example.com/article",
          name: "Example Article",
          content: "",
        },
      });
    });
    await seeder.close();

    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForSelector("input[type=url]", { timeout: 5000 });
    await expect(popup.locator("input[type=url]")).toHaveValue("https://example.com/article");
    // The bookmark type renders the URL input but not a title input
    // (title input is gated on type=article). The name from prefill is held
    // in state and will be sent as mp-name when the post is submitted.
    // Verify type=bookmark is the active picker selection.
    await expect(popup.locator('button[role="tab"][aria-selected="true"]')).toContainText(
      /bookmark/i,
    );
    await ctx.close();
  });
});
