import { describe, it, expect } from "vitest";
import {
  allocateBookingWalletAcrossCharges,
  computeEffectiveRemainingRefundable,
  computeRefundState,
  inferCreditedVia,
  sumCompletedStoreCreditRefunds,
} from "../booking-refund-context";

describe("allocateBookingWalletAcrossCharges", () => {
  it("allocates wallet to primary charge before additional charges", () => {
    const allocations = allocateBookingWalletAcrossCharges(
      [
        {
          id: "primary",
          transaction_type: "charge",
          amount: 200,
          refund_amount: 0,
          created_at: "2026-01-01",
        },
        {
          id: "extra",
          transaction_type: "additional_charge",
          amount: 50,
          refund_amount: 0,
          created_at: "2026-01-02",
        },
      ],
      220,
    );

    expect(allocations.get("primary")).toEqual({
      walletApplied: 200,
      effectiveRefunded: 200,
      remainingRefundable: 0,
    });
    expect(allocations.get("extra")).toEqual({
      walletApplied: 20,
      effectiveRefunded: 20,
      remainingRefundable: 30,
    });
  });
});


describe("sumCompletedStoreCreditRefunds", () => {
  it("sums completed store_credit refunds only", () => {
    expect(
      sumCompletedStoreCreditRefunds([
        { id: "1", booking_id: "b", amount: 50, reason: "x", status: "completed", refund_method: "store_credit" },
        { id: "2", booking_id: "b", amount: 30, reason: "y", status: "pending", refund_method: "store_credit" },
        { id: "3", booking_id: "b", amount: 20, reason: "z", status: "completed", refund_method: "cash" },
      ]),
    ).toBe(50);
  });
});

describe("computeRefundState", () => {
  it("returns credited_elsewhere when wallet exceeds txn record", () => {
    expect(
      computeRefundState({
        hasBooking: true,
        chargeAmount: 208,
        txnRefundedTotal: 0,
        walletCreditedTotal: 208,
      }),
    ).toBe("credited_elsewhere");
  });

  it("returns not_refunded for untouched charges", () => {
    expect(
      computeRefundState({
        hasBooking: true,
        chargeAmount: 208,
        txnRefundedTotal: 0,
        walletCreditedTotal: 0,
        txnStatus: "success",
      }),
    ).toBe("not_refunded");
  });

  it("returns not_applicable for orphan rows", () => {
    expect(
      computeRefundState({
        hasBooking: false,
        chargeAmount: 30,
        txnRefundedTotal: 0,
        walletCreditedTotal: 0,
      }),
    ).toBe("not_applicable");
  });
});

describe("computeEffectiveRemainingRefundable", () => {
  it("uses the higher of txn and wallet totals capped to charge", () => {
    expect(
      computeEffectiveRemainingRefundable({
        chargeAmount: 208,
        txnRefundedTotal: 0,
        walletCreditedTotal: 100,
      }),
    ).toBe(108);
    expect(
      computeEffectiveRemainingRefundable({
        chargeAmount: 200,
        txnRefundedTotal: 0,
        walletCreditedTotal: 250,
      }),
    ).toBe(0);
  });
});

describe("inferCreditedVia", () => {
  it("prefers admin when txn has refunded_by", () => {
    expect(
      inferCreditedVia("user-1", {
        id: "r1",
        booking_id: "b",
        amount: 10,
        reason: "Cancellation refund",
        status: "completed",
      }),
    ).toBe("admin_refunds_page");
  });

  it("detects cancellation from reason text", () => {
    expect(
      inferCreditedVia(null, {
        id: "r1",
        booking_id: "b",
        amount: 10,
        reason: "Cancellation refund (late cancellation)",
        status: "completed",
      }),
    ).toBe("cancellation");
  });
});
