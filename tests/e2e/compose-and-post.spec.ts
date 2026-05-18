import { test, expect } from "@playwright/test";
import { launchWithExtension, getExtensionId, seedAccount } from "./helpers";

test.describe("Compose and post", () => {
  test("toolbar popup posts a note to mock server", async ({ browserName }) => {
    test.skip(
      browserName === "firefox",
      "Firefox extension loading uses different harness — see tests/e2e/README.md",
    );
    const ctx = await launchWithExtension("chromium");
    const extId = await getExtensionId(ctx);
    await seedAccount(ctx, extId);

    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForSelector("textarea", { timeout: 5000 });
    await popup.fill("textarea", "Hello from Plume E2E");
    await popup.click("button[type=submit]");

    await expect(popup.locator("[role=status]")).toContainText(/Posted/, {
      timeout: 5000,
    });
    await ctx.close();
  });
});
