/**
 * Ensures App Tracking Transparency is requested before Singular initializes (Guideline 5.1.2).
 */

const mockRequestAttBeforeTracking = jest.fn(async () => undefined);

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("singular-react-native", () => ({
  Singular: { init: jest.fn() },
  SingularConfig: jest.fn().mockImplementation(() => ({
    withSingularLink: jest.fn().mockReturnThis(),
  })),
}));

jest.mock("expo-constants", () => ({
  expoConfig: {
    extra: {
      EXPO_PUBLIC_SINGULAR_SDK_KEY: "test-key",
      EXPO_PUBLIC_SINGULAR_SDK_SECRET: "test-secret",
    },
  },
}));

jest.mock("@/lib/tracking/request-att-before-tracking", () => ({
  requestAttBeforeTracking: mockRequestAttBeforeTracking,
}));

import { Singular, SingularConfig } from "singular-react-native";
import { initSingular } from "@/lib/singular";

describe("initSingular ATT ordering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requests ATT before Singular.init on iOS", async () => {
    const callOrder: string[] = [];
    mockRequestAttBeforeTracking.mockImplementation(async () => {
      callOrder.push("att");
    });
    (Singular.init as jest.Mock).mockImplementation(() => {
      callOrder.push("singular");
    });

    initSingular();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockRequestAttBeforeTracking).toHaveBeenCalledTimes(1);
    expect(Singular.init).toHaveBeenCalledTimes(1);
    expect(SingularConfig).toHaveBeenCalledWith("test-key", "test-secret");
    expect(callOrder).toEqual(["att", "singular"]);
  });
});
