import { expect, test } from "@playwright/test";
import { getExtensionId, launchWithExtension, seedAccount } from "./helpers";

test("drafts are reachable from the popup header", async ({ browserName }) => {
  test.skip(browserName === "firefox", "Firefox harness differs — see tests/e2e/README.md");
  const ctx = await launchWithExtension("chromium");
  const extId = await getExtensionId(ctx);
  await seedAccount(ctx, extId);

  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 460, height: 700 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForSelector("textarea", { timeout: 5000 });

  // Hidden at zero, so the header stays clean for people without drafts.
  await expect(popup.getByRole("button", { name: /saved draft/ })).toHaveCount(0);

  await popup.evaluate(async () => {
    await chrome.storage.local.set({
      drafts: {
        "localhost::general": {
          type: "note",
          content: "A half-written note about Micropub",
          savedAt: new Date().toISOString(),
        },
        "localhost::https://example.com/post": {
          type: "reply",
          content: "Something I meant to send",
          savedAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
      },
    });
  });
  await popup.reload();

  const button = popup.getByRole("button", { name: "2 saved drafts" });
  await expect(button).toBeVisible({ timeout: 5000 });
  await button.click();

  await expect(popup.getByText("A half-written note about Micropub")).toBeVisible();
  await expect(popup.getByText("Something I meant to send")).toBeVisible();
  await popup.screenshot({
    path: "/tmp/claude-1001/-home-rmdes-plume/c23b10a3-03c9-4e1f-a2a7-816f8a28734b/scratchpad/draft-panel.png",
  });

  // Opening a draft loads it into the composer in place, not in a new tab.
  const tabsBefore = ctx.pages().length;
  await popup.getByText("A half-written note about Micropub").click();
  await expect(popup.locator("textarea")).toHaveValue(/half-written note/, { timeout: 5000 });
  expect(ctx.pages().length).toBe(tabsBefore);

  await ctx.close();
});
