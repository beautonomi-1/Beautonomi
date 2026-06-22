const mockOpenURL = jest.fn();

jest.mock("react-native", () => ({
  Linking: {
    openURL: (...args: unknown[]) => mockOpenURL(...args),
  },
  Platform: { OS: "android" },
}));

jest.mock("@/config/public-env", () => ({
  ANDROID_PLAY_STORE_PACKAGE: "com.beautonomi.partner",
  IOS_APP_STORE_ID: "1234567890",
  APP_URL: "https://beautonomi.com",
}));

import { openAppStoreUpdate } from "@/lib/open-store-review";

describe("openAppStoreUpdate (Android, provider)", () => {
  beforeEach(() => {
    mockOpenURL.mockReset();
    mockOpenURL.mockResolvedValue(undefined);
  });

  it("opens partner app via market:// when no admin URL is set", async () => {
    await openAppStoreUpdate(null);

    expect(mockOpenURL).toHaveBeenCalledWith("market://details?id=com.beautonomi.partner");
  });

  it("uses admin URL package id for market:// deeplink", async () => {
    await openAppStoreUpdate("https://play.google.com/store/apps/details?id=com.beautonomi.partner");

    expect(mockOpenURL).toHaveBeenCalledWith("market://details?id=com.beautonomi.partner");
  });

  it("falls back to env partner package HTTPS when market:// and admin URL fail", async () => {
    mockOpenURL
      .mockRejectedValueOnce(new Error("no handler"))
      .mockRejectedValueOnce(new Error("no handler"))
      .mockResolvedValueOnce(undefined);

    await openAppStoreUpdate("https://play.google.com/store/apps/details?id=com.beautonomi.partner");

    expect(mockOpenURL).toHaveBeenNthCalledWith(
      3,
      "https://play.google.com/store/apps/details?id=com.beautonomi.partner",
    );
  });
});
