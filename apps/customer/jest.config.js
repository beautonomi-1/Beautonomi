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
  setupFiles: [
    "<rootDir>/../../tooling/mobile/jest-expo-winter-stub.js",
    "<rootDir>/../../tooling/mobile/jest-reanimated-mock.js",
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setup-after-env.js"],
  testMatch: ["<rootDir>/__tests__/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^expo-modules-core$": expoModulesCore,
  },
  // @sentry/core 10.76+ exposes an ESM build on the react-native export condition.
  // jest-expo already compiles @sentry/react-native; the shared core package must be too.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry|native-base|standard-navigation))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.expo/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "app/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};
