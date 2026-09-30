import { expect, test } from "@playwright/test";
import { getExtensionId, launchWithExtension } from "./helpers";

const CALLBACK = "https://rmdes.github.io/plume/callback.html";

test("tab sign-in connects an account without the identity window", async ({ browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox extension loading uses different harness — see tests/e2e/README.md",
  );
  const ctx = await launchWithExtension("chromium");
  const extId = await getExtensionId(ctx);

  // The real callback page is on GitHub Pages; serve the checked-in copy at
  // that address so the content script (matched by URL) injects offline.
  await ctx.route(`${CALLBACK}*`, (route) =>
    route.fulfill({ path: "docs/site/callback.html", contentType: "text/html" }),
  );

  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await opts.getByLabel("Sign in using a browser tab instead of a popup window").check();

  await opts.getByRole("button", { name: "+ Add account" }).click();
  await opts.getByLabel("Your site URL").fill("http://localhost:18750/");
  const loginTab = ctx.waitForEvent("page");
  await opts.getByRole("button", { name: "Authorize" }).click();

  // The mock authorization endpoint auto-approves, so the tab lands on the
  // callback page at once; the background finishes the exchange and closes it.
  const tab = await loginTab;
  await expect.poll(() => tab.isClosed(), { timeout: 10_000 }).toBe(true);

  const dialog = opts.getByRole("dialog", { name: "Add Micropub account" });
  await expect(dialog).toBeHidden({ timeout: 5000 });
  await expect(opts.getByText("localhost")).toBeVisible();

  await ctx.close();
});
