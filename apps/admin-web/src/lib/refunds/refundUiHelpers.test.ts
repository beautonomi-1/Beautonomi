import { describe, it, expect } from "vitest";
import {
  remainingRefundable,
  isProcessableRefundRow,
  computeBookingAvailableRefund,
  canShowBookingRefund,
  orphanPaymentLabel,
  normalizeRefundReason,
  isRefundReasonValid,
  deriveRefundRowState,
  creditedViaLabel,
} from "./refundUiHelpers";

describe("remainingRefundable", () => {
  it("returns full amount when nothing refunded", () => {
    expect(remainingRefundable(100, null)).toBe(100);
    expect(remainingRefundable("50.50", 0)).toBe(50.5);
  });

  it("returns difference for partial refunds", () => {
    expect(remainingRefundable(100, 40)).toBe(60);
    expect(remainingRefundable(100, 100)).toBe(0);
  });

  it("never returns negative", () => {
    expect(remainingRefundable(50, 75)).toBe(0);
  });
});

describe("isProcessableRefundRow", () => {
  it("allows success and partially_refunded with booking", () => {
    expect(isProcessableRefundRow({ status: "success", booking: {} })).toBe(true);
    expect(isProcessableRefundRow({ status: "partially_refunded", booking: {} })).toBe(true);
  });

  it("rejects without booking or wrong status", () => {
    expect(isProcessableRefundRow({ status: "success", booking: null })).toBe(false);
    expect(isProcessableRefundRow({ status: "refunded", booking: {} })).toBe(false);
    expect(isProcessableRefundRow({ status: "pending", booking: {} })).toBe(false);
  });

  it("respects server is_processable when provided", () => {
    expect(isProcessableRefundRow({ is_processable: true, status: "pending", booking: null })).toBe(
      true,
    );
  });
});

describe("computeBookingAvailableRefund", () => {
  it("uses total_paid when larger than wallet+gift", () => {
    expect(
      computeBookingAvailableRefund({
        total_paid: 200,
        total_refunded: 50,
        wallet_amount: 20,
        gift_card_amount: 10,
      }),
    ).toBe(150);
  });

  it("falls back to wallet+gift for legacy rows", () => {
    expect(
      computeBookingAvailableRefund({
        total_paid: 0,
        total_refunded: 0,
        wallet_amount: 30,
        gift_card_amount: 20,
      }),
    ).toBe(50);
  });
});

describe("canShowBookingRefund", () => {
  it("requires paid status and positive available", () => {
    expect(
      canShowBookingRefund({
        payment_status: "paid",
        total_paid: 100,
        total_refunded: 0,
      }),
    ).toBe(true);
    expect(
      canShowBookingRefund({
        payment_status: "pending",
        total_paid: 100,
        total_refunded: 0,
      }),
    ).toBe(false);
    expect(
      canShowBookingRefund({
        payment_status: "paid",
        total_paid: 100,
        total_refunded: 100,
      }),
    ).toBe(false);
  });
});

describe("orphanPaymentLabel", () => {
  it("maps gift card orders with link", () => {
    expect(
      orphanPaymentLabel({ kind: "gift_card_order", gift_card_order_id: "gc-1" }),
    ).toEqual({
      label: "Gift card order",
      href: "/admin/gift-cards/gc-1",
    });
  });

  it("maps membership and subscription kinds", () => {
    expect(orphanPaymentLabel({ kind: "membership_order", membership_order_id: "m-1" })).toEqual({
      label: "Membership order",
    });
    expect(orphanPaymentLabel({ kind: "provider_subscription_order" })).toEqual({
      label: "Provider subscription order",
    });
  });

  it("returns null for missing metadata", () => {
    expect(orphanPaymentLabel(null)).toBeNull();
    expect(orphanPaymentLabel({})).toBeNull();
  });
});

describe("normalizeRefundReason", () => {
  it("uses preset or other text", () => {
    expect(normalizeRefundReason("Duplicate charge", "")).toBe("Duplicate charge");
    expect(normalizeRefundReason("Other", "Custom reason")).toBe("Custom reason");
    expect(normalizeRefundReason("", "Free text")).toBe("Free text");
  });
});

describe("isRefundReasonValid", () => {
  it("requires non-empty reason", () => {
    expect(isRefundReasonValid("Customer cancellation", "")).toBe(true);
    expect(isRefundReasonValid("Other", "Details")).toBe(true);
    expect(isRefundReasonValid("Other", "")).toBe(false);
    expect(isRefundReasonValid("", "")).toBe(false);
  });
});

describe("deriveRefundRowState", () => {
  it("shows not refunded with credit action for processable charges", () => {
    const state = deriveRefundRowState({
      status: "success",
      booking: { id: "b-1" },
      is_processable: true,
      refund_state: "not_refunded",
    });
    expect(state.label).toBe("Not refunded");
    expect(state.canProcess).toBe(true);
    expect(state.actionLabel).toBe("Credit wallet");
    expect(state.payoutLabel).toBeNull();
  });

  it("shows credited elsewhere without action", () => {
    const state = deriveRefundRowState({
      status: "success",
      booking: { id: "b-1" },
      is_processable: false,
      refund_state: "credited_elsewhere",
      effective_reason: "Cancellation refund",
      effective_refunded_total: 208,
      credited_via: "cancellation",
    });
    expect(state.label).toBe("Credited elsewhere");
    expect(state.canProcess).toBe(false);
    expect(state.reason).toBe("Cancellation refund");
    expect(state.payoutLabel).toBe("Wallet credited");
  });

  it("shows wallet credited date from wallet_credited_at", () => {
    const state = deriveRefundRowState({
      status: "success",
      booking: { id: "b-1" },
      is_processable: false,
      refund_state: "credited_elsewhere",
      effective_refunded_total: 208,
      wallet_credited_at: "2026-07-24T12:00:00.000Z",
    });
    expect(state.payoutLabel).toContain("2026");
    expect(state.payoutLabel).toContain("Wallet credited");
  });
});

describe("creditedViaLabel", () => {
  it("maps known sources", () => {
    expect(creditedViaLabel("cancellation")).toBe("Cancellation policy");
    expect(creditedViaLabel(null)).toBeNull();
  });
});
