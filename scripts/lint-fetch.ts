#!/usr/bin/env bun
/**
 * Enforces Plume's privacy posture: every `fetch(` call must either reference
 * a user-configured account field or be on the allowlist below.
 *
 * Fails CI if an unrecognised URL pattern is introduced.
 */
import { Glob } from "bun";

const ALLOWED_LITERALS = [
  // Discovery reads the user's site URL
  "siteUrl",
  // IndieAuth token exchange uses endpoints from discovery
  "args.endpoints.token_endpoint",
  "existing.token_endpoint",
  // Micropub client always uses its configured endpoint
  "this.endpoint",
  "this.mediaEndpoint",
  // Query helper constructs URL from this.endpoint
  "url.toString()",
  // Link-bookmark page-title fetch uses the link href
  "info.linkUrl",
  // Page-title helper accepts any URL the caller passed
  "url",
  // Indieauth-metadata discovery reads from the discovery response itself
  'allLinks["indieauth-metadata"]',
  // Image-fetch uses the right-clicked srcUrl
  "url, { mode:",
];

const SOURCE_GLOBS = [
  "core/**/*.ts",
  "core/**/*.tsx",
  "storage/**/*.ts",
  "entrypoints/**/*.ts",
  "entrypoints/**/*.tsx",
  "components/**/*.tsx",
];

let bad = 0;

for (const pattern of SOURCE_GLOBS) {
  const glob = new Glob(pattern);
  for await (const path of glob.scan(".")) {
    // Skip test files and fixtures
    if (path.endsWith(".test.ts")) continue;
    if (path.includes("tests/")) continue;

    const text = await Bun.file(path).text();
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      const m = line.match(/\bfetch\(\s*([^,)]+)/);
      if (!m) return;
      const arg = m[1]?.trim();
      if (!arg) return;
      if (ALLOWED_LITERALS.some((a) => arg.includes(a) || line.includes(a))) return;
      console.error(`${path}:${i + 1}: fetch(${arg}) — not in allowlist`);
      bad++;
    });
  }
}

if (bad > 0) {
  console.error(
    `\n${bad} unrecognised fetch() call(s). Update scripts/lint-fetch.ts allowlist if intentional.`,
  );
  process.exit(1);
}
console.info("All fetch() calls match allowed patterns.");
