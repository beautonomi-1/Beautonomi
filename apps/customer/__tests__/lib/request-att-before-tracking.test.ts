import { InteractionManager, Platform } from "react-native";
import {
  getTrackingPermissionsAsync,
  PermissionStatus,
  requestTrackingPermissionsAsync,
} from "expo-tracking-transparency";
import { requestAttBeforeTracking } from "@/lib/tracking/request-att-before-tracking";

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

describe("requestAttBeforeTracking (customer)", () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
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
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalPlatform });
  });

  it("returns unavailable on non-iOS", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
    await expect(requestAttBeforeTracking()).resolves.toBe("unavailable");
    expect(getTrackingPermissionsAsync).not.toHaveBeenCalled();
  });

  it("requests ATT when status is undetermined", async () => {
    (getTrackingPermissionsAsync as jest.Mock).mockResolvedValue({
      status: PermissionStatus.UNDETERMINED,
    });
    (requestTrackingPermissionsAsync as jest.Mock).mockResolvedValue({
      status: PermissionStatus.GRANTED,
    });

    await expect(requestAttBeforeTracking()).resolves.toBe(PermissionStatus.GRANTED);
    expect(requestTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("skips request when already determined", async () => {
    (getTrackingPermissionsAsync as jest.Mock).mockResolvedValue({
      status: PermissionStatus.DENIED,
    });

    await expect(requestAttBeforeTracking()).resolves.toBe(PermissionStatus.DENIED);
    expect(requestTrackingPermissionsAsync).not.toHaveBeenCalled();
  });

  it("dedupes concurrent calls", async () => {
    (getTrackingPermissionsAsync as jest.Mock).mockResolvedValue({
      status: PermissionStatus.UNDETERMINED,
    });
    (requestTrackingPermissionsAsync as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ status: PermissionStatus.GRANTED }), 20);
        }),
    );

    const [a, b] = await Promise.all([requestAttBeforeTracking(), requestAttBeforeTracking()]);
    expect(a).toBe(PermissionStatus.GRANTED);
    expect(b).toBe(PermissionStatus.GRANTED);
    expect(getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(requestTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});
