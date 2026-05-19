import preact from "@preact/preset-vite";
import { defineConfig } from "wxt";

// Chrome Web Store production public key. Including it as `manifest.key` in
// development mode makes unpacked dev installs derive the *same* extension ID
// as the published CWS extension (hcphdjeoolimpjjekegpobkhoealiige). This lets
// dev and prod share a single redirect_uri declaration on the Pages site.
//
// CRITICAL: this MUST be omitted from production zips uploaded to the Chrome
// Web Store. CWS expects the key field to be absent on first upload (it
// assigns its own ID) and requires it to match the recorded value on
// subsequent uploads of the same item. Either way: don't include it in the zip.
const CWS_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArzv5nB9ch0GbQa6gmAgi94f5OFOS0n1Cl9qe7wCFB6L3vyX/31V7QnFVh21ou14eL+kMz3MRbaF5ErMjgdfHZGrnseqh/dHLZzRZYDg7AIvlZRiGTgN/bil6gAjxwfwyjkYVrqn8Fi1lST8q746Ox47zY+oo+XsDfS6vzuLiFuy9F5abuntXgB3St5VcL1b2SrittYfumgfGhNlFO7q1LKJHpZddOi1EZ79jmSXaiI60Cq78CEBOTfBbtm8hV1RfhxRDyTrw0kUkolYG2rUQARrHg15hx4WJlJX8gKzlPeCNieSDtQAPmFDYm2BMnQpePs1nxPy7RpwH61Xo3GpJ1wIDAQAB";

export default defineConfig({
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: ({ mode }) => ({
    ...(mode === "development" ? { key: CWS_PUBLIC_KEY } : {}),
    name: "Plume — Micropub Client",
    description: "Post to your Micropub-compatible blog from anywhere in the browser.",
    permissions: ["storage", "contextMenus", "identity", "notifications", "alarms"],
    optional_host_permissions: ["<all_urls>"],
    action: {
      default_title: "Plume",
      default_popup: "popup.html",
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
      },
    },
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "96": "icon/96.png",
      "128": "icon/128.png",
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
    browser_specific_settings: {
      gecko: {
        id: "plume@rmdes.net",
        strict_min_version: "127.0",
      },
    },
  }),
  runner: {
    startUrls: ["about:blank"],
  },
});
