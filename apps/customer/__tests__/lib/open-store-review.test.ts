const mockOpenURL = jest.fn();

jest.mock("react-native", () => ({
  Linking: {
    openURL: (...args: unknown[]) => mockOpenURL(...args),
  },
  Platform: { OS: "android" },
}));

jest.mock("@/config/public-env", () => ({
  ANDROID_PLAY_STORE_PACKAGE: "com.beautonomi",
  IOS_APP_STORE_ID: "1234567890",
  APP_URL: "https://beautonomi.com",
}));

import { openAppStoreUpdate, openNativeStoreReview } from "@/lib/open-store-review";

describe("openAppStoreUpdate (Android)", () => {
  beforeEach(() => {
    mockOpenURL.mockReset();
    mockOpenURL.mockResolvedValue(undefined);
  });

  it("opens native Play Store market:// deeplink first", async () => {
    await openAppStoreUpdate("https://play.google.com/store/apps/details?id=com.beautonomi");

    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    expect(mockOpenURL).toHaveBeenCalledWith("market://details?id=com.beautonomi");
  });

  it("extracts package id from admin URL for market:// deeplink", async () => {
    await openAppStoreUpdate("https://play.google.com/store/apps/details?id=com.beautonomi.partner");

    expect(mockOpenURL).toHaveBeenCalledWith("market://details?id=com.beautonomi.partner");
  });

  it("falls back to admin HTTPS URL when market:// fails", async () => {
    const adminUrl = "https://play.google.com/store/apps/details?id=com.beautonomi.partner";
    mockOpenURL.mockRejectedValueOnce(new Error("no handler")).mockResolvedValueOnce(undefined);

    await openAppStoreUpdate(adminUrl);

    expect(mockOpenURL).toHaveBeenCalledTimes(2);
    expect(mockOpenURL).toHaveBeenNthCalledWith(1, "market://details?id=com.beautonomi.partner");
    expect(mockOpenURL).toHaveBeenNthCalledWith(2, adminUrl);
  });

  it("falls back to env package HTTPS when market:// and admin URL fail", async () => {
    mockOpenURL
      .mockRejectedValueOnce(new Error("no handler"))
      .mockRejectedValueOnce(new Error("no handler"))
      .mockResolvedValueOnce(undefined);

    await openAppStoreUpdate("https://play.google.com/store/apps/details?id=com.beautonomi.partner");

    expect(mockOpenURL).toHaveBeenCalledTimes(3);
    expect(mockOpenURL).toHaveBeenNthCalledWith(
      3,
      "https://play.google.com/store/apps/details?id=com.beautonomi",
    );
  });

  it("uses env package when updateUrl is omitted", async () => {
    await openAppStoreUpdate(null);

    expect(mockOpenURL).toHaveBeenCalledWith("market://details?id=com.beautonomi");
  });
});

describe("openNativeStoreReview (Android)", () => {
  beforeEach(() => {
    mockOpenURL.mockReset();
    mockOpenURL.mockResolvedValue(undefined);
  });

  it("uses the same market:// first Play Store flow", async () => {
    await openNativeStoreReview();

    expect(mockOpenURL).toHaveBeenCalledWith("market://details?id=com.beautonomi");
  });
});
