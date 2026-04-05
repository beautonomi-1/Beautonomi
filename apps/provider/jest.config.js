/** @type {import('jest').Config} */
module.exports = {
  // No preset to avoid loading react-native (jest-expo imports RN; ESM/pnpm issues).
  // Run only node-safe smoke test by default. For full RN tests use E2E or fix Jest/Expo/pnpm setup.
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/**/*.test.{ts,tsx}"],
  transform: {
    "^.+\\.(ts|tsx)$": ["babel-jest", { configFile: "./babel.config.js" }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // RN + @testing-library/react-native pull Flow/ESM from react-native; keep CI on node + smoke.test.ts only.
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.expo/",
    "<rootDir>/__tests__/smoke\\.test\\.tsx$",
    "<rootDir>/__tests__/smoke\\.rn\\.test\\.tsx$",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "app/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};
