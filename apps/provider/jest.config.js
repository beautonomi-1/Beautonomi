/* global __dirname, require */
const path = require("path");

// expo-modules-core is no longer a direct dependency (expo-doctor flags direct
// installs), so under pnpm's isolated node_modules it is not symlinked at the
// app root. The jest-expo preset maps `^expo-modules-core$` to the app's
// node_modules, which would 404. Resolve it through expo's own dependency tree
// and override that mapping so tests can locate the package.
const expoModulesCore = path.dirname(
  require.resolve("expo-modules-core/package.json", {
    paths: [path.dirname(require.resolve("expo/package.json", { paths: [__dirname] }))],
  }),
);

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup-after-env.js"],
  testMatch: ["<rootDir>/__tests__/**/*.test.{ts,tsx}"],
  // The jest-expo / React Native test environment leaves recurring environment
  // timers armed inside parallel jest-worker processes, which trips jest-worker's
  // graceful-exit check ("A worker process has failed to exit gracefully").
  // `--detectOpenHandles` reports zero handles in-band, confirming there is no
  // real app-code leak — it is purely a parallel-worker teardown artifact.
  // Running on a single worker makes teardown deterministic and removes the
  // warning without masking genuine leaks via --forceExit.
  maxWorkers: 1,
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^expo-modules-core$": expoModulesCore,
  },
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.expo/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "app/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};
