import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "core/**/*.test.ts", "storage/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["core/**/*.ts", "storage/**/*.ts"],
      exclude: ["**/*.test.ts", "**/types.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
