/**
 * Minimal Jest setup for provider app.
 * We avoid loading react-native/jest/setup.js because it uses ESM and fails under Jest/pnpm.
 */
require("@testing-library/jest-native/extend-expect");
