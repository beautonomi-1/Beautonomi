jest.mock("expo-linking", () => ({
  parse: jest.fn(() => {
    throw new Error("use URL fallback in tests");
  }),
}));

import {
  extractPaystackReferenceFromUrl,
  extractStripeCheckoutSessionIdFromUrl,
} from "@/lib/paystack-webview-utils";

describe("paystack-webview-utils", () => {
  describe("extractStripeCheckoutSessionIdFromUrl", () => {
    it("reads session_id from https success URLs", () => {
      expect(
        extractStripeCheckoutSessionIdFromUrl(
          "https://www.beautonomi.com/booking/callback?reference=bn_1&session_id=cs_test_a",
        ),
      ).toBe("cs_test_a");
    });

    it("returns null when session_id is missing", () => {
      expect(
        extractStripeCheckoutSessionIdFromUrl("https://www.beautonomi.com/booking/callback?reference=only"),
      ).toBeNull();
    });

    it("returns null for invalid URLs", () => {
      expect(extractStripeCheckoutSessionIdFromUrl("not-a-url")).toBeNull();
    });
  });

  describe("extractPaystackReferenceFromUrl", () => {
    it("reads reference from query string", () => {
      expect(
        extractPaystackReferenceFromUrl("https://example.com/cb?reference=pay_ref_99"),
      ).toBe("pay_ref_99");
    });
  });
});
