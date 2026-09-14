const mockOpenNativeStoreReview = jest.fn();

jest.mock("@/lib/open-store-review", () => ({
  openNativeStoreReview: (...args: unknown[]) => mockOpenNativeStoreReview(...args),
}));

jest.mock("expo-store-review", () => {
  throw new Error("Cannot find native module 'ExpoStoreReview'");
});

jest.mock("@/lib/analytics-rn", () => ({
  getAnalyticsClient: () => null,
}));

import { requestAppStoreReview } from "@/lib/store-review-prompt";

describe("requestAppStoreReview", () => {
  beforeEach(() => {
    mockOpenNativeStoreReview.mockReset();
    mockOpenNativeStoreReview.mockResolvedValue(undefined);
  });

  it("falls back to store URL when expo-store-review fails to load", async () => {
    await requestAppStoreReview();
    expect(mockOpenNativeStoreReview).toHaveBeenCalledTimes(1);
  });
});
