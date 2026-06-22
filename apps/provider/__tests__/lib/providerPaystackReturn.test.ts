/**
 * @jest-environment node
 */
jest.mock("@/lib/web-url", () => ({
  getWebProviderBaseUrl: () => "https://app.beautonomi.com",
}));

import {
  matchesAdsPaystackReturnUrl,
  matchesSubscriptionPaystackReturnUrl,
  getAdsPaystackReturnUrl,
  getSubscriptionPaystackReturnUrl,
  getAdsPaymentReturnDeepLink,
  buildAdsRetryCheckoutReview,
  adsSuccessCopy,
  subscriptionSuccessCopy,
} from "@/lib/payments/providerPaystackReturn";

describe("matchesAdsPaystackReturnUrl", () => {
  it("matches HTTPS bridge with success flag", () => {
    expect(
      matchesAdsPaystackReturnUrl(
        "https://app.beautonomi.com/provider/settings/ads/payment-return?success=1&order_id=abc",
        { success: true },
      ),
    ).toBe(true);
  });

  it("matches deep-link host=settings + /ads-payment-return", () => {
    expect(
      matchesAdsPaystackReturnUrl(
        "provider://settings/ads-payment-return?success=1&order_id=abc",
        { success: true },
      ),
    ).toBe(true);
  });

  it("matches Expo dev URL with /--/ prefix", () => {
    expect(
      matchesAdsPaystackReturnUrl(
        "exp://192.168.1.10:8081/--/settings/ads-payment-return?success=1",
        { success: true },
      ),
    ).toBe(true);
  });

  it("rejects URLs without success flag when success is required", () => {
    expect(
      matchesAdsPaystackReturnUrl(
        "https://app.beautonomi.com/provider/settings/ads/payment-return?cancelled=1",
        { success: true },
      ),
    ).toBe(false);
  });

  it("matches cancelled when cancelled=1", () => {
    expect(
      matchesAdsPaystackReturnUrl(
        "provider://settings/ads-payment-return?cancelled=1",
        { cancelled: true },
      ),
    ).toBe(true);
  });

  it("matches HTTPS bridge with reference query param", () => {
    expect(
      matchesAdsPaystackReturnUrl(
        "https://app.beautonomi.com/provider/settings/ads/payment-return?success=1&reference=pay_ref_123",
        { success: true },
      ),
    ).toBe(true);
  });

  it("does not match unrelated URLs", () => {
    expect(
      matchesAdsPaystackReturnUrl("https://app.beautonomi.com/checkout/success?reference=xyz"),
    ).toBe(false);
  });
});

describe("getAdsPaymentReturnDeepLink", () => {
  it("builds provider:// deep link with success params", () => {
    expect(
      getAdsPaymentReturnDeepLink({
        success: true,
        orderId: "ord-1",
        campaignId: "camp-1",
        reference: "ref-abc",
      }),
    ).toBe(
      "provider://settings/ads-payment-return?success=1&order_id=ord-1&campaign_id=camp-1&reference=ref-abc",
    );
  });

  it("builds cancelled deep link", () => {
    expect(getAdsPaymentReturnDeepLink({ cancelled: true, orderId: "ord-2" })).toBe(
      "provider://settings/ads-payment-return?cancelled=1&order_id=ord-2",
    );
  });
});

describe("buildAdsRetryCheckoutReview", () => {
  it("formats time-based retry review with duration and total", () => {
    const review = buildAdsRetryCheckoutReview(
      {
        billing_model: "time_based",
        duration_days: 7,
        latest_budget_order: { amount: 199, currency: "ZAR" },
      },
      "ZAR",
    );
    expect(review.heading).toBe("Complete payment");
    expect(review.title).toBe("7-day boost");
    expect(review.lineItems.some((i) => i.label === "Boost duration")).toBe(true);
    expect(review.confirmLabel).toContain("199");
  });

  it("formats impression pack retry review", () => {
    const review = buildAdsRetryCheckoutReview(
      {
        billing_model: "impression_pack",
        pack_impressions: 2500,
        budget: 150,
      },
      "ZAR",
    );
    expect(review.lineItems.some((i) => i.label === "Impressions")).toBe(true);
    expect(review.benefits.length).toBeGreaterThan(0);
  });

  it("detects impression packs via pack_impressions even without billing_model", () => {
    const review = buildAdsRetryCheckoutReview(
      {
        pack_impressions: 1200,
        budget: 99,
      },
      "ZAR",
    );
    expect(review.lineItems.some((i) => i.label === "Impressions")).toBe(true);
    expect(review.title).toContain("1");
  });
});

describe("matchesSubscriptionPaystackReturnUrl", () => {
  it("matches HTTPS /provider/subscription with payment_success=true", () => {
    expect(
      matchesSubscriptionPaystackReturnUrl(
        "https://app.beautonomi.com/provider/subscription?payment_success=true&order_id=ord",
        { success: true },
      ),
    ).toBe(true);
  });

  it("matches deep-link subscription-payment-return", () => {
    expect(
      matchesSubscriptionPaystackReturnUrl(
        "provider://settings/subscription-payment-return?payment_success=true",
        { success: true },
      ),
    ).toBe(true);
  });

  it("matches Expo dev URL", () => {
    expect(
      matchesSubscriptionPaystackReturnUrl(
        "exp://192.168.1.10:8081/--/settings/subscription-payment-return?payment_success=true",
        { success: true },
      ),
    ).toBe(true);
  });

  it("rejects HTTPS without payment_success when success required", () => {
    expect(
      matchesSubscriptionPaystackReturnUrl(
        "https://app.beautonomi.com/provider/subscription",
        { success: true },
      ),
    ).toBe(false);
  });

  it("matches cancelled flag", () => {
    expect(
      matchesSubscriptionPaystackReturnUrl(
        "https://app.beautonomi.com/provider/subscription?payment_cancelled=1",
        { cancelled: true },
      ),
    ).toBe(true);
  });
});

describe("base URL helpers", () => {
  it("builds HTTPS ads payment-return URL with no trailing slash", () => {
    expect(getAdsPaystackReturnUrl()).toBe(
      "https://app.beautonomi.com/provider/settings/ads/payment-return",
    );
  });

  it("builds HTTPS subscription URL", () => {
    expect(getSubscriptionPaystackReturnUrl()).toBe(
      "https://app.beautonomi.com/provider/subscription",
    );
  });
});

describe("adsSuccessCopy", () => {
  it("formats time-based copy with day count", () => {
    const copy = adsSuccessCopy(
      {
        id: "c1",
        status: "active",
        budget: 100,
        billing_model: "time_based",
        duration_days: 7,
      },
      "ZAR",
    );
    expect(copy.title).toBe("Ad funded and live");
    expect(copy.body).toContain("7 days");
  });

  it("formats impression pack copy with formatted impressions", () => {
    const copy = adsSuccessCopy(
      {
        id: "c2",
        status: "active",
        budget: 200,
        billing_model: "impression_pack",
        pack_impressions: 5000,
      },
      "ZAR",
    );
    expect(copy.title).toBe("Impression pack funded");
    // Locale formatting may use ',', '.', or non-breaking spaces as separators.
    expect(copy.body).toMatch(/5\D?000/);
  });

  it("formats cpc budget copy with currency amount", () => {
    const copy = adsSuccessCopy(
      { id: "c3", status: "active", budget: 250, billing_model: "cpc_budget" },
      "ZAR",
    );
    expect(copy.title).toBe("Ad budget loaded");
    expect(copy.body).toContain("250");
  });
});

describe("subscriptionSuccessCopy", () => {
  it("includes plan name and expiry", () => {
    const copy = subscriptionSuccessCopy({
      status: "active",
      expires_at: "2026-12-01T00:00:00Z",
      plan: { name: "Pro" },
    });
    expect(copy.title).toContain("Pro");
    expect(copy.body).toMatch(/Renews on/);
  });

  it("falls back when expiry is missing", () => {
    const copy = subscriptionSuccessCopy({
      status: "active",
      plan: { name: "Pro" },
    });
    expect(copy.body).toBe("Subscription activated. You're all set.");
  });
});
