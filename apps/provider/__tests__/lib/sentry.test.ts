import * as Sentry from "@sentry/react-native";

jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  setTag: jest.fn(),
  setUser: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  startSpan: (_opts: unknown, fn: () => unknown) => fn(),
}));

jest.mock("expo-constants", () => ({
  expoConfig: { extra: { EXPO_PUBLIC_SENTRY_DSN: "https://example@sentry.io/1" } },
}));

jest.mock("@/lib/connectivity", () => ({
  isDeviceOffline: jest.fn(() => false),
}));

import { isDeviceOffline } from "@/lib/connectivity";
import { captureApiFailure, captureError, initSentry } from "@/lib/sentry";

describe("provider sentry helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV = "1";
    initSentry();
    (isDeviceOffline as jest.Mock).mockReturnValue(false);
  });

  it("captureApiFailure leaves breadcrumb and exception for online timeouts", () => {
    captureApiFailure(
      {
        message: "Request timed out. Please check your internet connection and try again.",
        code: "TIMEOUT",
      },
      { area: "ProviderContext.profile", code: "TIMEOUT" },
      { uiHandled: true },
    );

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "api_failure",
        data: expect.objectContaining({ code: "TIMEOUT", uiHandled: true }),
      }),
    );
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it("captureApiFailure breadcrumb-only for deliberate background cancel", () => {
    captureApiFailure({ message: "Request cancelled.", code: "CANCELLED" }, { area: "useApi" });

    expect(Sentry.addBreadcrumb).toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("captureError still records offline transient failures as warnings", () => {
    (isDeviceOffline as jest.Mock).mockReturnValue(true);

    captureError(
      { message: "Network request failed", code: "NETWORK_ERROR" },
      { area: "useApi" },
    );

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "Network request failed",
      expect.objectContaining({ level: "warning" }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
