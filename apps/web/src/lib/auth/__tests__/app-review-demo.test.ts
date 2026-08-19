import { describe, expect, it } from "vitest";
import {
  APP_REVIEW_CUSTOMER_DEMO_EMAIL,
  APP_REVIEW_CUSTOMER_DEMO_PHONE,
  APP_REVIEW_CUSTOMER_DEMO_UID,
  APP_REVIEW_DEMO_EMAIL,
  APP_REVIEW_DEMO_PHONE,
  APP_REVIEW_DEMO_UID,
  getAppReviewDemoOtp,
  isAppReviewDemoEmail,
  isAppReviewDemoIdentifier,
  isAppReviewDemoOtp,
  isAppReviewDemoPhone,
  isAppReviewDemoProviderUserId,
  isAppReviewDemoUserId,
  resolveAppReviewDemoAccount,
} from "../app-review-demo";

describe("app-review-demo", () => {
  it("exposes fixed provider demo credentials", () => {
    expect(APP_REVIEW_DEMO_UID).toBe("11ccc539-9160-47be-b7b3-5fef986f1033");
    expect(APP_REVIEW_DEMO_EMAIL).toBe("buntulink@gmail.com");
    expect(APP_REVIEW_DEMO_PHONE).toBe("+27790624995");
  });

  it("exposes fixed customer demo credentials", () => {
    expect(APP_REVIEW_CUSTOMER_DEMO_UID).toBe("8adda800-6d2e-47c8-bcab-caa2feb4f323");
    expect(APP_REVIEW_CUSTOMER_DEMO_EMAIL).toBe("nomi@ferdose.com");
    expect(APP_REVIEW_CUSTOMER_DEMO_PHONE).toBe("+27716429097");
  });

  it("defaults demo OTP to 246810", () => {
    expect(getAppReviewDemoOtp()).toBe("246810");
  });

  it("matches provider demo email and phone identifiers", () => {
    expect(isAppReviewDemoEmail("Buntulink@gmail.com")).toBe(true);
    expect(isAppReviewDemoPhone("+27 79 062 4995")).toBe(true);
    expect(isAppReviewDemoPhone("790624995")).toBe(true);
    expect(isAppReviewDemoPhone("0790624995")).toBe(true);
    expect(isAppReviewDemoIdentifier({ email: APP_REVIEW_DEMO_EMAIL })).toBe(true);
    expect(isAppReviewDemoIdentifier({ phone: "27790624995" })).toBe(true);
  });

  it("matches customer demo email and phone identifiers", () => {
    expect(isAppReviewDemoEmail("Nomi@ferdose.com")).toBe(true);
    expect(isAppReviewDemoPhone("+27 71 642 9097")).toBe(true);
    expect(isAppReviewDemoPhone("716429097")).toBe(true);
    expect(isAppReviewDemoPhone("0716429097")).toBe(true);
    expect(isAppReviewDemoIdentifier({ email: APP_REVIEW_CUSTOMER_DEMO_EMAIL })).toBe(true);
    expect(isAppReviewDemoIdentifier({ phone: "27716429097" })).toBe(true);
    expect(isAppReviewDemoIdentifier({ email: "other@example.com" })).toBe(false);
  });

  it("validates demo OTP", () => {
    expect(isAppReviewDemoOtp("246810")).toBe(true);
    expect(isAppReviewDemoOtp("000000")).toBe(false);
  });

  it("detects demo user ids", () => {
    expect(isAppReviewDemoUserId(APP_REVIEW_DEMO_UID)).toBe(true);
    expect(isAppReviewDemoUserId(APP_REVIEW_CUSTOMER_DEMO_UID)).toBe(true);
    expect(isAppReviewDemoUserId("other-id")).toBe(false);
  });

  it("detects provider-only demo user id", () => {
    expect(isAppReviewDemoProviderUserId(APP_REVIEW_DEMO_UID)).toBe(true);
    expect(isAppReviewDemoProviderUserId(APP_REVIEW_CUSTOMER_DEMO_UID)).toBe(false);
  });

  it("resolves demo accounts by identifier or user id", () => {
    expect(resolveAppReviewDemoAccount({ email: APP_REVIEW_DEMO_EMAIL })?.uid).toBe(APP_REVIEW_DEMO_UID);
    expect(resolveAppReviewDemoAccount({ phone: APP_REVIEW_DEMO_PHONE })?.email).toBe(APP_REVIEW_DEMO_EMAIL);
    expect(resolveAppReviewDemoAccount({ email: APP_REVIEW_CUSTOMER_DEMO_EMAIL })?.uid).toBe(
      APP_REVIEW_CUSTOMER_DEMO_UID,
    );
    expect(resolveAppReviewDemoAccount({ phone: APP_REVIEW_CUSTOMER_DEMO_PHONE })?.email).toBe(
      APP_REVIEW_CUSTOMER_DEMO_EMAIL,
    );
    expect(resolveAppReviewDemoAccount({ userId: APP_REVIEW_CUSTOMER_DEMO_UID })?.phone).toBe(
      APP_REVIEW_CUSTOMER_DEMO_PHONE,
    );
    expect(resolveAppReviewDemoAccount({ email: "other@example.com" })).toBeNull();
  });
});
