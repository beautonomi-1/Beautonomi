import { Platform } from "react-native";
import {
  TAB_BAR_ANDROID_MIN_BOTTOM_INSET,
  TAB_BAR_FIXED_HEIGHT,
  TAB_BAR_MIN_BOTTOM_INSET,
  tabBarBottomInset,
  tabBarOuterHeight,
  tabScrollContentPaddingBottom,
} from "@/constants/layout";

describe("tabBarBottomInset", () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalOS });
  });

  it("uses OS inset when larger than platform minimum", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    expect(tabBarBottomInset(34)).toBe(34);
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
    expect(tabBarBottomInset(48)).toBe(48);
  });

  it("falls back to iOS minimum when inset is 0", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    expect(tabBarBottomInset(0)).toBe(TAB_BAR_MIN_BOTTOM_INSET);
  });

  it("falls back to Android minimum when inset is 0", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
    expect(tabBarBottomInset(0)).toBe(TAB_BAR_ANDROID_MIN_BOTTOM_INSET);
  });
});

describe("tabBarOuterHeight", () => {
  it("includes fixed height plus bottom inset", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    expect(tabBarOuterHeight(34)).toBe(TAB_BAR_FIXED_HEIGHT + 34);
  });
});

describe("tabScrollContentPaddingBottom", () => {
  it("adds extra slack above tab bar outer height", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    expect(tabScrollContentPaddingBottom(34, 16)).toBe(tabBarOuterHeight(34) + 16);
  });
});
