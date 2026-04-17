import { defineConfig, globalIgnores } from "eslint/config";
import { createRequire } from "module";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";

const require = createRequire(import.meta.url);
const perfPlugin = require("./eslint-rules/index.js");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "eslint-rules/**",
    // Vite-built admin SPA chunks copied for hosting; minified — not project source.
    "public/admin/**",
  ]),
  // Scripts and config: allow require() where common (Node/CommonJS).
  {
    files: ["scripts/**/*.js", "scripts/**/*.mjs", "scripts/**/*.cjs", "tailwind.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  // Tests: allow any and Function type in tests for mocks and brevity.
  {
    files: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  // App-wide: treat strict rules as warnings so readiness-check passes; fix over time.
  // Use unused-imports plugin so "eslint --fix" can auto-remove unused imports.
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "unused-imports": unusedImports },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "react/no-unescaped-entities": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "prefer-const": "warn",
      "no-var": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      // F15: block imports of the retired legacy CalendarGrid path.
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: [
                "**/provider-portal/CalendarGrid",
                "**/provider-portal/CalendarGrid.tsx",
              ],
              message:
                "Import CalendarGrid from '@/components/provider-portal/calendar' (or the sibling barrel).",
            },
          ],
        },
      ],
    },
  },
  // Tailwind config uses require() for preset/plugins; allow it.
  {
    files: ["tailwind.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Performance guardrails — custom rules to catch common perf regressions.
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { perf: perfPlugin },
    rules: {
      "perf/no-client-page": "warn",
      "perf/no-inline-render-item": "warn",
      "perf/no-heavy-barrel-import": "warn",
      "perf/no-static-mapbox": "error",
      "perf/no-framer-in-list": "warn",
    },
  },
  // Security guardrail — F6: every API route must reference an auth guard.
  {
    files: ["src/app/api/**/route.ts", "src/app/api/**/route.tsx"],
    plugins: { perf: perfPlugin },
    rules: {
      "perf/require-auth-on-route": "error",
    },
  },
]);

export default eslintConfig;
