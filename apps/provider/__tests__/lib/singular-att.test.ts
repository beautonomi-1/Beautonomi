/**
 * Ensures Singular.init is synchronous after ATT (AttTrackingBootstrap path).
 */

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

import { Singular, SingularConfig } from "singular-react-native";
import { initSingular } from "@/lib/singular";

describe("initSingular", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("initializes Singular synchronously when keys are present", () => {
    initSingular();
    expect(Singular.init).toHaveBeenCalledTimes(1);
    expect(SingularConfig).toHaveBeenCalledWith("test-key", "test-secret");
  });
});
