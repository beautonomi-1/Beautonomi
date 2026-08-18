import { describe, expect, it } from "vitest";
import {
  APP_REVIEW_DEMO_EMAIL,
  APP_REVIEW_DEMO_PHONE,
  APP_REVIEW_DEMO_UID,
  getAppReviewDemoOtp,
  isAppReviewDemoEmail,
  isAppReviewDemoIdentifier,
  isAppReviewDemoOtp,
  isAppReviewDemoPhone,
  isAppReviewDemoUserId,
} from "../app-review-demo";

describe("app-review-demo", () => {
  it("exposes fixed demo credentials", () => {
    expect(APP_REVIEW_DEMO_UID).toBe("11ccc539-9160-47be-b7b3-5fef986f1033");
    expect(APP_REVIEW_DEMO_EMAIL).toBe("buntulink@gmail.com");
    expect(APP_REVIEW_DEMO_PHONE).toBe("+27790624995");
  });

  it("defaults demo OTP to 246810", () => {
    expect(getAppReviewDemoOtp()).toBe("246810");
  });

  it("matches demo email and phone identifiers", () => {
    expect(isAppReviewDemoEmail("Buntulink@gmail.com")).toBe(true);
    expect(isAppReviewDemoPhone("+27 79 062 4995")).toBe(true);
    expect(isAppReviewDemoPhone("790624995")).toBe(true);
    expect(isAppReviewDemoPhone("0790624995")).toBe(true);
    expect(isAppReviewDemoIdentifier({ email: APP_REVIEW_DEMO_EMAIL })).toBe(true);
    expect(isAppReviewDemoIdentifier({ phone: "27790624995" })).toBe(true);
    expect(isAppReviewDemoIdentifier({ email: "other@example.com" })).toBe(false);
  });

  it("validates demo OTP", () => {
    expect(isAppReviewDemoOtp("246810")).toBe(true);
    expect(isAppReviewDemoOtp("000000")).toBe(false);
  });

  it("detects demo user id", () => {
    expect(isAppReviewDemoUserId(APP_REVIEW_DEMO_UID)).toBe(true);
    expect(isAppReviewDemoUserId("other-id")).toBe(false);
  });
});
