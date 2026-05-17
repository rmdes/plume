import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";

export default defineConfig({
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: "Plume — Micropub Client",
    description: "Post to your Micropub-compatible blog from anywhere in the browser.",
    permissions: [
      "storage",
      "contextMenus",
      "identity",
      "activeTab",
      "notifications",
      "alarms",
    ],
    optional_host_permissions: ["<all_urls>"],
    action: {
      default_title: "Plume",
      default_popup: "popup.html",
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
  },
  runner: {
    startUrls: ["about:blank"],
  },
});
