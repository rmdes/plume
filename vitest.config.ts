import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "tests/unit/**/*.test.ts",
      "core/**/*.test.ts",
      "storage/**/*.test.ts",
      "entrypoints/**/*.test.ts",
    ],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["core/**/*.ts", "storage/**/*.ts", "entrypoints/**/*.ts"],
      exclude: ["**/*.test.ts", "**/types.ts", "**/*.tsx", "**/index.html"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
