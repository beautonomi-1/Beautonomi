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
  expoConfig: { extra: {} },
}));

import { Singular, SingularConfig } from "singular-react-native";
import { initSingular } from "@/lib/singular";

describe("initSingular (customer)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("no-ops when Singular keys are missing", () => {
    initSingular();
    expect(Singular.init).not.toHaveBeenCalled();
    expect(SingularConfig).not.toHaveBeenCalled();
  });
});
