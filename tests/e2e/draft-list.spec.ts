import { expect, test } from "@playwright/test";
import { getExtensionId, launchWithExtension, seedAccount } from "./helpers";

test("options page deletes a draft stored under an empty scope", async ({ browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox extension loading uses different harness — see tests/e2e/README.md",
  );
  const ctx = await launchWithExtension("chromium");
  const extId = await getExtensionId(ctx);
  await seedAccount(ctx, extId);

  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  // "localhost::" is the key the composer produced whenever the post type was
  // a target type with a blank URL. The delete button used to bail on its own
  // falsy-scope guard and silently do nothing for exactly these drafts.
  await opts.evaluate(async () => {
    await chrome.storage.local.set({
      drafts: {
        "localhost::": {
          type: "bookmark",
          content: "orphaned draft",
          savedAt: new Date().toISOString(),
        },
      },
    });
  });
  await opts.reload();

  await expect(opts.locator("text=orphaned draft")).toBeVisible({ timeout: 5000 });

  await opts.getByRole("button", { name: "Delete draft" }).click();

  await expect(opts.locator("text=orphaned draft")).toHaveCount(0, { timeout: 5000 });
  const remaining = await opts.evaluate(async () => {
    const stored = (await chrome.storage.local.get("drafts")) as {
      drafts?: Record<string, unknown>;
    };
    return Object.keys(stored.drafts ?? {}).length;
  });
  expect(remaining).toBe(0);

  await ctx.close();
});
