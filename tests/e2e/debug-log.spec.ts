import { expect, test } from "@playwright/test";
import { getExtensionId, launchWithExtension } from "./helpers";

test("errors reach the debug log and are shown in options", async ({ browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox extension loading uses different harness — see tests/e2e/README.md",
  );
  const ctx = await launchWithExtension("chromium");
  const extId = await getExtensionId(ctx);

  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await expect(opts.getByText("Nothing logged yet.")).toBeVisible();

  // Seeded in the exact shape `log.error` writes, already sanitised — what
  // sanitizeForLog strips is covered by core/logger.test.ts.
  await opts.evaluate(async () => {
    await chrome.storage.local.set({
      logs: [
        {
          at: new Date().toISOString(),
          level: "error",
          context: "background",
          message: "token exchange failed",
          data: { name: "Error", status: 401, url: "https://tokens.example/token" },
        },
      ],
    });
  });

  await expect(opts.getByText("token exchange failed")).toBeVisible({ timeout: 5000 });
  await expect(opts.getByText("error", { exact: true })).toBeVisible();

  // The list subscribes to storage changes, so a background write must appear
  // without reopening the page.
  await opts.evaluate(async () => {
    const stored = (await chrome.storage.local.get("logs")) as { logs?: unknown[] };
    await chrome.storage.local.set({
      logs: [
        ...(stored.logs ?? []),
        {
          at: new Date().toISOString(),
          level: "warn",
          context: "background",
          message: "queue retry scheduled",
        },
      ],
    });
  });
  await expect(opts.getByText("queue retry scheduled")).toBeVisible({ timeout: 5000 });

  await opts.getByRole("button", { name: "Clear" }).click();
  await expect(opts.getByText("Nothing logged yet.")).toBeVisible();

  await ctx.close();
});
