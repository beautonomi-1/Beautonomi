import {
  APP_REVIEW_CUSTOMER_DEMO_EMAIL,
  APP_REVIEW_CUSTOMER_DEMO_PHONE,
  APP_REVIEW_CUSTOMER_DEMO_UID,
  isAppReviewDemoEmail,
  isAppReviewDemoPhone,
  isAppReviewDemoUserId,
} from "@/lib/auth/app-review-demo";

describe("customer app-review-demo", () => {
  it("exposes customer demo credentials only", () => {
    expect(APP_REVIEW_CUSTOMER_DEMO_UID).toBe("8adda800-6d2e-47c8-bcab-caa2feb4f323");
    expect(APP_REVIEW_CUSTOMER_DEMO_EMAIL).toBe("nomi@ferdose.com");
    expect(APP_REVIEW_CUSTOMER_DEMO_PHONE).toBe("+27716429097");
  });

  it("matches customer demo phone variants", () => {
    expect(isAppReviewDemoPhone("+27716429097")).toBe(true);
    expect(isAppReviewDemoPhone("716429097")).toBe(true);
    expect(isAppReviewDemoPhone("0716429097")).toBe(true);
    expect(isAppReviewDemoPhone("+27790624995")).toBe(false);
  });

  it("matches customer demo email only", () => {
    expect(isAppReviewDemoEmail("nomi@ferdose.com")).toBe(true);
    expect(isAppReviewDemoEmail("buntulink@gmail.com")).toBe(false);
  });

  it("detects customer demo user id", () => {
    expect(isAppReviewDemoUserId(APP_REVIEW_CUSTOMER_DEMO_UID)).toBe(true);
    expect(isAppReviewDemoUserId("11ccc539-9160-47be-b7b3-5fef986f1033")).toBe(false);
  });
});
