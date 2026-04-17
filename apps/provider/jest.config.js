/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup-after-env.js"],
  testMatch: ["<rootDir>/__tests__/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.expo/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "app/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};
