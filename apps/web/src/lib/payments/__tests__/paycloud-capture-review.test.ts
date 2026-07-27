import { describe, expect, it } from "vitest";
import { isPaycloudCaptureUnderReview } from "../paycloud-capture-review";

describe("isPaycloudCaptureUnderReview", () => {
  it("flags a short capture that succeeded on the machine", () => {
    expect(
      isPaycloudCaptureUnderReview({ status: "successful", amount_match_status: "under" }),
    ).toBe(true);
  });

  it("flags a mismatched capture", () => {
    expect(
      isPaycloudCaptureUnderReview({ status: "successful", amount_match_status: "mismatch" }),
    ).toBe(true);
  });

  it("treats an exact capture as a plain success", () => {
    expect(
      isPaycloudCaptureUnderReview({ status: "successful", amount_match_status: "exact" }),
    ).toBe(false);
  });

  it("treats an overpayment as a plain success (settles, then refunds separately)", () => {
    expect(
      isPaycloudCaptureUnderReview({ status: "successful", amount_match_status: "over" }),
    ).toBe(false);
  });

  it("does not flag payments that never succeeded", () => {
    expect(
      isPaycloudCaptureUnderReview({ status: "failed", amount_match_status: "under" }),
    ).toBe(false);
    expect(
      isPaycloudCaptureUnderReview({ status: "pending", amount_match_status: "mismatch" }),
    ).toBe(false);
  });

  it("handles missing data", () => {
    expect(isPaycloudCaptureUnderReview(null)).toBe(false);
    expect(isPaycloudCaptureUnderReview(undefined)).toBe(false);
    expect(isPaycloudCaptureUnderReview({ status: "successful" })).toBe(false);
  });
});
