import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error("not needed in unit tests");
  }),
}));

import {
  detectCatalogIssues,
  detectOnboardingBlocker,
  isBookingTrendConcerning,
  isoWeekKey,
} from "../workflows/provider-ops";
import { detectReviewFraudPattern } from "../workflows/trust-review-fraud";
import { buildRefundBriefing } from "../workflows/refund-preprocessor";
import { buildCsatRecoveryDraft, buildNudgeDraft } from "../workflows/support-followups";

describe("provider health trend", () => {
  it("flags a >50% drop with meaningful history", () => {
    expect(isBookingTrendConcerning({ previous30d: 10, recent30d: 4 })).toBe(true);
    expect(isBookingTrendConcerning({ previous30d: 10, recent30d: 5 })).toBe(true);
  });
  it("ignores small or improving providers", () => {
    expect(isBookingTrendConcerning({ previous30d: 3, recent30d: 0 })).toBe(false);
    expect(isBookingTrendConcerning({ previous30d: 10, recent30d: 9 })).toBe(false);
    expect(isBookingTrendConcerning({ previous30d: 0, recent30d: 0 })).toBe(false);
  });
});

describe("onboarding blocker detection", () => {
  it("prioritises missing services, then payout account, then hours", () => {
    expect(
      detectOnboardingBlocker({ activeServiceCount: 0, hasActivePayoutAccount: false, hasWorkingHours: false })
        ?.blocker,
    ).toBe("no_services");
    expect(
      detectOnboardingBlocker({ activeServiceCount: 3, hasActivePayoutAccount: false, hasWorkingHours: true })
        ?.blocker,
    ).toBe("no_payout_account");
    expect(
      detectOnboardingBlocker({ activeServiceCount: 3, hasActivePayoutAccount: true, hasWorkingHours: false })
        ?.blocker,
    ).toBe("no_working_hours");
    expect(
      detectOnboardingBlocker({ activeServiceCount: 3, hasActivePayoutAccount: true, hasWorkingHours: true }),
    ).toBeNull();
  });
});

describe("catalog quality issues", () => {
  it("flags missing and thin descriptions", () => {
    expect(detectCatalogIssues({ title: "Gel manicure", description: null, price: 250, medianPrice: 300 })).toHaveLength(1);
    expect(
      detectCatalogIssues({ title: "Gel manicure", description: "Nice nails", price: 250, medianPrice: 300 }),
    ).toHaveLength(1);
  });
  it("flags price outliers against the category median", () => {
    const high = detectCatalogIssues({
      title: "Gel manicure",
      description: "A relaxing full gel manicure with cuticle care and polish of your choice.",
      price: 5000,
      medianPrice: 300,
    });
    expect(high.some((i) => i.includes("4×"))).toBe(true);
    const low = detectCatalogIssues({
      title: "Gel manicure",
      description: "A relaxing full gel manicure with cuticle care and polish of your choice.",
      price: 20,
      medianPrice: 300,
    });
    expect(low.some((i) => i.includes("20%"))).toBe(true);
  });
  it("passes a healthy listing", () => {
    expect(
      detectCatalogIssues({
        title: "Gel manicure",
        description: "A relaxing full gel manicure with cuticle care and polish of your choice.",
        price: 280,
        medianPrice: 300,
      }),
    ).toHaveLength(0);
  });
});

describe("review fraud pattern", () => {
  it("flags a burst of 5-star reviews from brand-new accounts", () => {
    const result = detectReviewFraudPattern([
      { rating: 5, customerAccountAgeDaysAtReview: 1 },
      { rating: 5, customerAccountAgeDaysAtReview: 2 },
      { rating: 5, customerAccountAgeDaysAtReview: 0.5 },
      { rating: 4, customerAccountAgeDaysAtReview: 400 },
    ]);
    expect(result.suspicious).toBe(true);
    expect(result.suspiciousCount).toBe(3);
  });
  it("does not flag organic review activity", () => {
    const organic = detectReviewFraudPattern([
      { rating: 5, customerAccountAgeDaysAtReview: 200 },
      { rating: 4, customerAccountAgeDaysAtReview: 90 },
      { rating: 5, customerAccountAgeDaysAtReview: 3 },
      { rating: 3, customerAccountAgeDaysAtReview: 500 },
      { rating: 5, customerAccountAgeDaysAtReview: 365 },
    ]);
    expect(organic.suspicious).toBe(false);
  });
});

describe("refund briefing", () => {
  it("recommends the requested amount for a clean refund", () => {
    const b = buildRefundBriefing({
      requestedAmount: 100,
      bookingTotal: 500,
      totalPaid: 500,
      alreadyRefunded: 0,
      inPersonCap: 500,
      refundMethod: "original",
      paymentBreakdown: "card/paystack 500.00",
      customerRefunds90d: 0,
    });
    expect(b.recommendedMax).toBe(100);
    expect(b.flags).toHaveLength(0);
    expect(b.summary).toContain("Clean refund");
  });
  it("caps and flags over-refunds, cash caps, and repeat refunders", () => {
    const b = buildRefundBriefing({
      requestedAmount: 600,
      bookingTotal: 500,
      totalPaid: 500,
      alreadyRefunded: 100,
      inPersonCap: 200,
      refundMethod: "cash",
      paymentBreakdown: "cash/cash 500.00",
      customerRefunds90d: 4,
    });
    expect(b.recommendedMax).toBe(200); // min(requested, remaining=400, cash cap=200)
    expect(b.flags.join(" ")).toContain("requested_exceeds_refundable_balance");
    expect(b.flags.join(" ")).toContain("cash_refund_exceeds_in_person_cap");
    expect(b.flags.join(" ")).toContain("repeat_refunder");
    expect(b.summary).toContain("Review required");
  });
});

describe("support follow-up drafts", () => {
  it("nudges reference the ticket and never pressure the customer", () => {
    const draft = buildNudgeDraft({ ticketNumber: "TKT-42", daysSinceReply: 3 });
    expect(draft).toContain("TKT-42");
    expect(draft).toContain("no action is needed");
  });
  it("CSAT recovery apologises without promising compensation", () => {
    const draft = buildCsatRecoveryDraft({ ticketNumber: "TKT-42", customerName: "Zanele" });
    expect(draft).toContain("Hi Zanele,");
    expect(draft.toLowerCase()).not.toMatch(/refund|voucher|credit|compensat/);
  });
});

describe("iso week key", () => {
  it("is stable within a week and formatted for idempotency keys", () => {
    expect(isoWeekKey(new Date("2026-07-13T08:00:00Z"))).toBe(isoWeekKey(new Date("2026-07-19T20:00:00Z")));
    expect(isoWeekKey(new Date("2026-07-15T00:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
  });
});
