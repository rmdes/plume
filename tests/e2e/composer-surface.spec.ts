// tests/e2e/composer-surface.spec.ts
import { expect, test } from "@playwright/test";
import { getExtensionId, launchWithExtension } from "./helpers";

test("the composer checkbox switches the icon between popup and tab", async ({ browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox extension loading uses different harness — see tests/e2e/README.md",
  );
  const ctx = await launchWithExtension("chromium");
  const extId = await getExtensionId(ctx);

  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  const box = opts.getByLabel("Open the composer in a tab instead of the toolbar popup");

  // Playwright cannot click the toolbar icon, so the surface is read back
  // from the action itself: no popup means the tap goes to the background.
  const popup = () => opts.evaluate(() => chrome.action.getPopup({}));
  expect(await popup()).toMatch(/popup\.html$/);

  await box.check();
  await expect.poll(popup).toBe("");

  await box.uncheck();
  await expect.poll(popup).toMatch(/popup\.html$/);

  // The choice is stored, so a reload shows it and the background can
  // re-apply it after an update.
  await box.check();
  await opts.reload();
  await expect(
    opts.getByLabel("Open the composer in a tab instead of the toolbar popup"),
  ).toBeChecked();

  // One composer tab: the background opener remembers the tab id and checks it
  // with tabs.get. Chrome hides tab URLs without the `tabs` permission, so
  // look-up by URL cannot work; prove the id round-trip does with the shipped
  // manifest.
  const got = await opts.evaluate(async () => {
    const tab = await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?popout=1") });
    const again = await chrome.tabs.get(tab.id ?? -1);
    return { created: tab.id, again: again.id };
  });
  expect(got.created).toBeDefined();
  expect(got.again).toBe(got.created);

  // A pop-out page registers its own tab, whichever opener created it.
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${extId}/popup.html?popout=1`);
  // No account is connected here, so the composer textarea never renders; wait for the app shell.
  await expect(pop.locator("#app > *").first()).toBeVisible();
  const reg = await pop.evaluate(async () => {
    const [cur, stored] = await Promise.all([
      chrome.tabs.getCurrent(),
      chrome.storage.session.get("composerTabId"),
    ]);
    return { cur: cur?.id, stored: stored.composerTabId };
  });
  expect(reg.cur).toBeDefined();
  expect(reg.stored).toBe(reg.cur);

  // The background pings the remembered tab before focusing it. A live
  // pop-out answers; once the tab has navigated elsewhere nobody does, so the
  // background knows to open a fresh composer instead of focusing that tab.
  const ping = (id: number) =>
    opts.evaluate(
      (tabId) =>
        chrome.tabs.sendMessage(tabId, { type: "composer-ping" }).then(
          () => "answered",
          () => "unanswered",
        ),
      id,
    );
  expect(await ping(reg.cur as number)).toBe("answered");
  await pop.goto("about:blank");
  expect(await ping(reg.cur as number)).toBe("unanswered");

  await ctx.close();
});
