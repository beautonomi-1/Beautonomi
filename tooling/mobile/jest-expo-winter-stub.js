/* global jest */
/**
 * Expo SDK 57 installs "winter" globals (fetch) that pull native modules in Jest.
 * Stub before any test file loads to avoid post-teardown warnings.
 */
jest.mock("expo/src/winter/fetch/ExpoFetchModule", () => ({}));
