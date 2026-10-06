/* global jest */
/**
 * Expo SDK 57 installs "winter" globals (fetch) that pull native modules in Jest.
 * FetchResponse reads ExpoFetchModule.NativeResponse at import time. An empty mock
 * makes that named export undefined and crashes every suite (including after
 * jest.resetModules()). Mirror the web stub so the module can load under Jest.
 */
jest.mock("expo/src/winter/fetch/ExpoFetchModule", () => ({
  __esModule: true,
  ExpoFetchModule: {
    NativeRequest: class NativeRequest {},
    NativeResponse: class NativeResponse {},
  },
}));
