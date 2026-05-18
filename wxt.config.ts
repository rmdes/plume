import preact from "@preact/preset-vite";
import { defineConfig } from "wxt";

export default defineConfig({
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: "Plume — Micropub Client",
    description: "Post to your Micropub-compatible blog from anywhere in the browser.",
    permissions: ["storage", "contextMenus", "identity", "activeTab", "notifications", "alarms"],
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
  },
  runner: {
    startUrls: ["about:blank"],
  },
});
