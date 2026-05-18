import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

export default [
  // Ignore generated dirs
  {
    ignores: [
      ".wxt/**",
      ".output/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "*.d.ts",
    ],
  },
  // TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        chrome: "readonly",
        browser: "readonly",
        // WXT auto-imports
        defineBackground: "readonly",
        defineContentScript: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      // Mirror Biome's useImportType
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      // Mirror Biome's noNonNullAssertion
      "@typescript-eslint/no-non-null-assertion": "error",
      // Mirror Biome's noConsole — warn on console.log only (correct original intent)
      "no-console": ["warn", { allow: ["error", "warn", "info", "debug"] }],
      // JSX a11y (mirror Biome's a11y rules we hit during dev)
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/no-redundant-roles": "error",
      // Common quality
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Disable formatting-related rules; Prettier handles those
  prettier,
];
