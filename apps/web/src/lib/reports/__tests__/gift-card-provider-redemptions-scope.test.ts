import { describe, expect, it } from "vitest";
import { giftCardRedemptionReportBasis } from "../gift-card-provider-redemptions";

describe("gift-card redemption report basis", () => {
  it("states capture window and platform issuance", () => {
    const basis = giftCardRedemptionReportBasis("2026-01-01", "2026-01-31", "Africa/Johannesburg", false);
    expect(basis).toContain("2026-01-01");
    expect(basis).toContain("captured");
    expect(basis.toLowerCase()).toContain("not cards your salon sold");
  });

  it("mentions truncation when paged cap hit", () => {
    const basis = giftCardRedemptionReportBasis("2026-01-01", "2026-01-31", "Africa/Johannesburg", true);
    expect(basis.toLowerCase()).toContain("missing");
  });
});
