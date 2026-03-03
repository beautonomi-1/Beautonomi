import { haptic } from "@/lib/haptics";

// Mock expo-haptics
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
  },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

// Mock Platform to native
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

describe("haptic utilities", () => {
  it("exports all feedback types", () => {
    expect(haptic.light).toBeDefined();
    expect(haptic.medium).toBeDefined();
    expect(haptic.heavy).toBeDefined();
    expect(haptic.success).toBeDefined();
    expect(haptic.warning).toBeDefined();
    expect(haptic.error).toBeDefined();
    expect(haptic.selection).toBeDefined();
  });

  it("calls light haptic without crashing", () => {
    expect(() => haptic.light()).not.toThrow();
  });

  it("calls success haptic without crashing", () => {
    expect(() => haptic.success()).not.toThrow();
  });

  it("calls selection haptic without crashing", () => {
    expect(() => haptic.selection()).not.toThrow();
  });
});
