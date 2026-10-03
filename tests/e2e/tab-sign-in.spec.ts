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

  await opts.getByRole("button", { name: "Authorize" }).click();

  // The mock authorization endpoint auto-approves, so the login tab lands on
  // the callback page at once; the background finishes the exchange and
  // closes that tab. The account appearing proves the whole round trip (the
  // code only arrives through the callback), and no page may be left on the
  // callback URL afterwards. Not `waitForEvent("page")`: on first install the
  // background also opens welcome.html, and under load that can be the next
  // page to appear.
  const dialog = opts.getByRole("dialog", { name: "Add Micropub account" });
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(opts.getByText("localhost")).toBeVisible();
  await expect
    .poll(() => ctx.pages().filter((p) => p.url().startsWith(CALLBACK)).length, {
      timeout: 5_000,
    })
    .toBe(0);

  await ctx.close();
});
