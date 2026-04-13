/* global jest */
/**
 * After jest-expo / react-native jest preset. Add shared mocks here as needed.
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
