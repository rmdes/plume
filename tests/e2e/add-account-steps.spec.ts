import { expect, test } from "@playwright/test";
import { getExtensionId, launchWithExtension } from "./helpers";

test("add-account dialog narrates each step", async ({ browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox extension loading uses different harness — see tests/e2e/README.md",
  );
  const ctx = await launchWithExtension("chromium");
  const extId = await getExtensionId(ctx);

  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);

  await opts.getByRole("button", { name: "+ Add account" }).click();
  await opts.getByLabel("Your site URL").fill("https://example.invalid/");
  await opts.getByRole("button", { name: "Authorize" }).click();

  // The whole shape of the flow is listed up front, not revealed one line at
  // a time, so a failure stays visible next to the steps that came before it.
  const dialog = opts.getByRole("dialog", { name: "Add Micropub account" });
  await expect(dialog.getByText("Requesting access to example.invalid")).toBeVisible({
    timeout: 5000,
  });
  await expect(dialog.getByText("Discovering endpoints")).toBeVisible();
  await expect(dialog.getByText("Exchanging your login for a token")).toBeVisible();
  await expect(dialog.getByText("Loading server configuration")).toBeVisible();

  // The flow itself cannot be driven further here: the first step is a
  // `permissions.request()` prompt, which automation cannot answer, so the
  // run parks on it. What this guards is that the dialog explains where it
  // is instead of showing an opaque "Authorizing…" — and that the user can
  // always leave, which a stalled prompt previously prevented.
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await ctx.close();
});
