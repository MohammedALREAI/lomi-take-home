import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/generated/**", "**/node_modules/**", "**/.turbo/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Tests read untyped JSON responses.
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
