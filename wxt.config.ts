import preact from "@preact/preset-vite";
import { defineConfig } from "wxt";

// Pinned RSA public key for the Chrome extension ID
// (kjfcmmliahijkokkhgellflmefpfglin). Including this field in the manifest
// makes the unpacked dev install ID stable across reinstalls.
//
// CRITICAL: this MUST be omitted from production zips uploaded to the Chrome
// Web Store. CWS assigns its own extension ID and rejects uploads whose `key`
// doesn't match the item's recorded value. The wildcard redirect_uri on the
// Pages site (https://*.chromiumapp.org/) covers whatever CWS assigns.
const DEV_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs6SubPQiXCels8Y3r/kP+7osJRkASWl+9XC69fYJwhj8GWL+mZEHNI3DJrYPJ8+zWAJw291FrIGL/SoPU013b85fn918IVBCZssXICOU+BJ1WOZw2UItWPZd4WkL4SOq66AQ5bC2lYycbMmoU0bUTL7Y6RiYoSZOqmxamQTyQ+2zbGq7DX/wZcH/AN3Ea1oKAoqTIOodzM5DDf2Ep6ORsC43SRazks5AonG3Px+dzsj4YNRQx8Hc4n45gmKNYbigOYO2GNrCxhuY1bYt7z5Nh64XdtW9NFSA8HGFK+f4v+ahwyvPyP5vccJt/F8o1s+Pk8PMhqIdM2Tnsl+bsdaubwIDAQAB";

export default defineConfig({
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: ({ mode }) => ({
    ...(mode === "development" ? { key: DEV_KEY } : {}),
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
