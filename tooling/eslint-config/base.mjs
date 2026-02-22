/**
 * Shared ESLint base configuration for Beautonomi monorepo
 * 
 * Usage in app eslint.config.mjs:
 *   import { baseConfig } from "@beautonomi/eslint-config";
 *   export default [...baseConfig, ...yourAppSpecificConfig];
 */
import { defineConfig, globalIgnores } from "eslint/config";

export const baseConfig = defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/coverage/**",
    "**/*.d.ts",
  ]),
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "warn",
      "prefer-const": "error",
      "no-unused-expressions": "error",
    },
  },
]);

export default baseConfig;
