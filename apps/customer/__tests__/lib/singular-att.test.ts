/**
 * Ensures App Tracking Transparency is requested before Singular initializes (Guideline 2.1).
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
  expoConfig: { extra: {} },
}));

jest.mock("@/lib/tracking/request-att-before-tracking", () => ({
  requestAttBeforeTracking: mockRequestAttBeforeTracking,
}));

import { Singular, SingularConfig } from "singular-react-native";
import { initSingular } from "@/lib/singular";

describe("initSingular ATT ordering (customer)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requests ATT even when Singular keys are missing", async () => {
    initSingular();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockRequestAttBeforeTracking).toHaveBeenCalledTimes(1);
    expect(Singular.init).not.toHaveBeenCalled();
    expect(SingularConfig).not.toHaveBeenCalled();
  });
});
