/* global jest */
/**
 * Extra setup after jest-expo (react-native/jest preset) initializes.
 * Do not mock `react-native` here — jest-expo provides compatible mocks.
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
