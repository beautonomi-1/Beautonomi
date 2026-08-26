import { InteractionManager, Platform, AppState } from "react-native";
import {
  getTrackingPermissionsAsync,
  PermissionStatus,
  requestTrackingPermissionsAsync,
} from "expo-tracking-transparency";
import {
  requestAttBeforeTracking,
  waitForAttPromptSurface,
} from "@/lib/tracking/request-att-before-tracking";

jest.mock("expo-tracking-transparency", () => ({
  PermissionStatus: {
    UNDETERMINED: "undetermined",
    GRANTED: "granted",
    DENIED: "denied",
  },
  getTrackingPermissionsAsync: jest.fn(),
  requestTrackingPermissionsAsync: jest.fn(),
}));

jest.mock("@/lib/sentry", () => ({
  authFlowBreadcrumb: jest.fn(),
  isSentryEnabled: () => false,
}));

describe("requestAttBeforeTracking (provider)", () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
    jest.spyOn(InteractionManager, "runAfterInteractions").mockImplementation((cb: () => void) => {
      cb();
      return { cancel: jest.fn() } as never;
    });
    global.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalPlatform });
  });

  it("prompts only when undetermined", async () => {
    (getTrackingPermissionsAsync as jest.Mock).mockResolvedValue({
      status: PermissionStatus.UNDETERMINED,
    });
    (requestTrackingPermissionsAsync as jest.Mock).mockResolvedValue({
      status: PermissionStatus.GRANTED,
    });

    const resultPromise = requestAttBeforeTracking();
    await jest.runAllTimersAsync();
    await expect(resultPromise).resolves.toBe(PermissionStatus.GRANTED);
    expect(requestTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("waitForAttPromptSurface resolves on active AppState", async () => {
    const p = waitForAttPromptSurface();
    await jest.runAllTimersAsync();
    await p;
  });
});
