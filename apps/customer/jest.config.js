/** @type {import('jest').Config} */
module.exports = {
  // No preset to avoid loading react-native (jest-expo imports RN; ESM/pnpm issues).
  // Run only node-safe smoke test by default. For full RN tests use E2E or npm/yarn.
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/**/*.test.{ts,tsx}"],
  transform: {
    "^.+\\.(ts|tsx)$": ["babel-jest", { configFile: "./babel.config.js" }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Component tests use @testing-library/react-native → loads RN entry (Flow/ESM); CI uses node env only.
  // Run those in E2E or a dedicated RN Jest preset. Lib/unit tests stay enabled.
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.expo/",
    "<rootDir>/__tests__/components/.*\\.test\\.tsx$",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "app/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};
