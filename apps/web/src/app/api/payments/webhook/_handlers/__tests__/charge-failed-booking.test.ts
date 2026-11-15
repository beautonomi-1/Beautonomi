/**
 * Regression tests for the "success-then-failed race" guards in the standard
 * booking `charge.failed` handler (inside `processFailedPayment`).
 *
 * A duplicate/out-of-order Paystack webhook delivery must never downgrade a
 * booking that already has a successful payment, and a retry of the same
 * `charge.failed` event must not double-apply the cancellation/wallet-refund
 * side effects once the booking has already left `payment_status: "pending"`.
 */
vi.mock("@/lib/bookings/rollback-collectible-split-leg", () => ({
  rollbackCollectibleSplitLeg: vi.fn(async () => ({ walletDone: true, giftDone: true })),
  releaseGiftCardOrRemember: vi.fn(async () => false),
  rememberGiftCaptureStillDue: vi.fn(async () => undefined),
  retryUnfinishedCollectibleRollbacks: vi.fn(async () => 0),
  COLLECTIBLE_ROLLBACK_STILL_DUE: "Collectible return still due",
}));

import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleChargeFailed } from "../charge-success";
import { restoreBookingRetailStock } from "@/lib/bookings/deduct-booking-retail-stock";
import { slackNotifyPaymentFailed } from "@/lib/integrations/slack/ops-triggers";
import { rollbackCollectibleSplitLeg } from "@/lib/bookings/rollback-collectible-split-leg";
import type { PaystackEvent, SupabaseClient } from "../shared";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: vi.fn(async () => undefined),
}));

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(async () => undefined),
}));

vi.mock("@/lib/integrations/slack/ops-triggers", () => ({
  slackNotifyPaymentFailed: vi.fn(),
}));

vi.mock("@/lib/bookings/deduct-booking-retail-stock", () => ({
  restoreBookingRetailStock: vi.fn(async () => undefined),
}));

function makeBookingChargeFailedSupabase(options: {
  successTxExists: boolean;
  /** Rows returned by the atomic `.eq("payment_status", "pending")` claim update. */
  claimedRows: Array<{ id: string }>;
  liveBooking?: {
    status: string;
    payment_status: string;
    customer_id?: string;
    provider_id?: string;
    tenant_id?: string | null;
    currency?: string;
  } | null;
  packageEntitlementId?: string | null;
  rescheduledFromBookingId?: string | null;
  /** When set, this is the session still on the original visit. `null` means it is not. */
  originalEntitlementId?: string | null;
  packageAlreadyReturned?: boolean;
  restoreSession?: boolean | null;
  /** `void_gift_card_redemption` data. True restores a reserved gift. False leaves a captured gift spent. */
  giftVoid?: boolean | null;
  giftCardAmount?: number;
}) {
  const paymentTxInserts: Array<Record<string, unknown>> = [];
  const bookingUpdates: Array<Record<string, unknown>> = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  let bookingPaymentsDeleted = false;
  let paymentsUpdated = false;

  const mockSupabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn((columns?: string) => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: "booking-1",
                  customer_id: "customer-1",
                  booking_number: "BK-1001",
                  tenant_id: "tenant-1",
                  provider_id: "provider-1",
                  customer_package_entitlement_id: options.packageEntitlementId ?? null,
                  rescheduled_from_booking_id: options.rescheduledFromBookingId ?? null,
                  gift_card_amount: options.giftCardAmount ?? 0,
                  currency: "ZAR",
                },
                error: null,
              })),
              maybeSingle: vi.fn(async () => {
                if (columns === "customer_package_entitlement_id") {
                  const held =
                    options.originalEntitlementId !== undefined
                      ? options.originalEntitlementId
                      : options.rescheduledFromBookingId
                        ? (options.packageEntitlementId ?? null)
                        : null;
                  return { data: { customer_package_entitlement_id: held }, error: null };
                }
                return { data: options.liveBooking ?? null, error: null };
              }),
            })),
          })),
          update: vi.fn((values: Record<string, unknown>) => {
            bookingUpdates.push(values);
            const result =
              values.customer_package_entitlement_id === null
                ? {
                    data:
                      options.packageEntitlementId && !options.packageAlreadyReturned
                        ? [{ id: "booking-1" }]
                        : [],
                    error: null,
                  }
                : { data: options.claimedRows, error: null };
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(async () => result),
                })),
                is: vi.fn(() => ({
                  then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
                })),
                in: vi.fn(() => ({
                  then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
                })),
                // `wallet_amount: 0` cleanup update has no second `.eq("payment_status", ...)`.
                then: (resolve: (v: { data: null; error: null }) => void) =>
                  resolve({ data: null, error: null }),
              })),
            };
          }),
        };
      }
      if (table === "payment_transactions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: options.successTxExists ? { id: "success-tx-1" } : null,
                  error: null,
                })),
              })),
            })),
          })),
          insert: vi.fn((row: Record<string, unknown>) => {
            paymentTxInserts.push(row);
            return Promise.resolve({ data: null, error: null });
          }),
        };
      }
      if (table === "booking_payments") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => {
                bookingPaymentsDeleted = true;
                return { data: null, error: null };
              }),
            })),
          })),
        };
      }
      if (table === "payments") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => {
              const chain: { eq: ReturnType<typeof vi.fn>; then: (resolve: (value: unknown) => void) => void } = {
                eq: vi.fn(),
                then: (resolve) => {
                  paymentsUpdated = true;
                  resolve({ data: null, error: null });
                },
              };
              chain.eq.mockReturnValue(chain);
              return chain;
            }),
          })),
        };
      }
      if (table === "wallet_topups") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }
      if (table === "booking_events") {
        return {
          insert: vi.fn(async () => ({ data: null, error: null })),
        };
      }
      if (table === "user_wallets") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: "wallet-1" }, error: null })),
            })),
          })),
        };
      }
      if (table === "wallet_transactions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table in charge-failed booking test: ${table}`);
    }),
    rpc: vi.fn(async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      if (fn === "restore_customer_package_entitlement") {
        return { data: options.restoreSession ?? true, error: null };
      }
      if (fn === "void_gift_card_redemption") {
        return { data: options.giftVoid === undefined ? true : options.giftVoid, error: null };
      }
      return { data: null, error: null };
    }),
  };

  return {
    mockSupabase: mockSupabase as unknown as SupabaseClient,
    paymentTxInserts,
    bookingUpdates,
    rpcCalls,
    getBookingPaymentsDeleted: () => bookingPaymentsDeleted,
    getPaymentsUpdated: () => paymentsUpdated,
  };
}

function makeChargeFailedEvent(
  reference: string,
  metadata?: Record<string, unknown>,
): PaystackEvent {
  return {
    event: "charge.failed",
    data: {
      reference,
      message: "Card declined",
      gateway_response: "Declined",
      metadata: {
        booking_id: "booking-1",
        ...metadata,
      },
    },
  } as unknown as PaystackEvent;
}

describe("charge.failed booking handler — success-then-failed race guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips cancelling the booking when the reference already has a successful payment_transactions row", async () => {
    const { mockSupabase, bookingUpdates, paymentTxInserts, getBookingPaymentsDeleted } =
      makeBookingChargeFailedSupabase({ successTxExists: true, claimedRows: [] });

    await handleChargeFailed(makeChargeFailedEvent("ref-already-succeeded"), mockSupabase);

    // Must bail out before the atomic claim update, the failed payment_transactions
    // insert, and the gift-card/booking_payments cleanup — the booking already paid.
    expect(bookingUpdates).toHaveLength(0);
    expect(paymentTxInserts).toHaveLength(0);
    expect(getBookingPaymentsDeleted()).toBe(false);
    expect(slackNotifyPaymentFailed).not.toHaveBeenCalled();
  });

  it("skips a duplicate charge.failed delivery once the booking has already left pending (claim returns 0 rows)", async () => {
    const { mockSupabase, bookingUpdates, paymentTxInserts, getBookingPaymentsDeleted } =
      makeBookingChargeFailedSupabase({ successTxExists: false, claimedRows: [] });

    await handleChargeFailed(makeChargeFailedEvent("ref-retry"), mockSupabase);

    // The atomic claim update was attempted (payment_status="pending" guard) but
    // matched no rows — a prior delivery already resolved the booking, so no
    // further side effects (payment_transactions insert, gift-card void, etc.)
    // should run.
    expect(bookingUpdates).toHaveLength(1);
    expect(paymentTxInserts).toHaveLength(0);
    expect(getBookingPaymentsDeleted()).toBe(false);
    expect(restoreBookingRetailStock).not.toHaveBeenCalled();
    expect(slackNotifyPaymentFailed).not.toHaveBeenCalled();
  });

  it("puts products back when a failed payment is delivered again after the visit was already cancelled", async () => {
    const { mockSupabase, paymentTxInserts } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [],
      liveBooking: { status: "cancelled", payment_status: "failed" },
    });

    await handleChargeFailed(makeChargeFailedEvent("ref-retry-stock"), mockSupabase);

    expect(restoreBookingRetailStock).toHaveBeenCalledWith(mockSupabase, "booking-1");
    expect(paymentTxInserts).toHaveLength(0);
  });

  it("returns the wallet when a failed payment is delivered again after the visit was cancelled", async () => {
    const { mockSupabase, rpcCalls, paymentTxInserts } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [],
      liveBooking: { status: "cancelled", payment_status: "failed" },
    });
    const event = makeChargeFailedEvent("ref-retry-wallet");
    event.data.metadata = {
      booking_id: "booking-1",
      wallet_amount_applied: 50,
      currency: "ZAR",
    };

    await handleChargeFailed(event, mockSupabase);

    expect(rpcCalls).toContainEqual({
      fn: "wallet_credit_admin",
      args: expect.objectContaining({
        p_user_id: "customer-1",
        p_amount: 50,
        p_idempotency_key: "booking_payment_failed:booking-1",
      }),
    });
    expect(paymentTxInserts).toHaveLength(0);
  });

  it("does not put products back when the visit was already paid", async () => {
    const { mockSupabase } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [],
      liveBooking: { status: "confirmed", payment_status: "paid" },
    });

    await handleChargeFailed(makeChargeFailedEvent("ref-already-paid"), mockSupabase);

    expect(restoreBookingRetailStock).not.toHaveBeenCalled();
  });

  it("processes the booking failure once when the atomic claim succeeds", async () => {
    const { mockSupabase, bookingUpdates, paymentTxInserts, rpcCalls, getBookingPaymentsDeleted, getPaymentsUpdated } =
      makeBookingChargeFailedSupabase({
        successTxExists: false,
        claimedRows: [{ id: "booking-1" }],
      });

    await handleChargeFailed(makeChargeFailedEvent("ref-genuine-failure"), mockSupabase);

    expect(bookingUpdates).toContainEqual(
      expect.objectContaining({
        payment_status: "failed",
        status: "cancelled",
      }),
    );
    expect(bookingUpdates).toContainEqual({
      cancellation_settlement_error: "Loyalty points could not be returned",
    });
    expect(restoreBookingRetailStock).toHaveBeenCalledWith(mockSupabase, "booking-1");
    expect(paymentTxInserts).toHaveLength(1);
    expect(paymentTxInserts[0]).toMatchObject({ status: "failed", booking_id: "booking-1" });
    expect(rpcCalls.some((c) => c.fn === "void_gift_card_redemption")).toBe(true);
    expect(bookingUpdates).toContainEqual({ cancellation_reason: "Payment failed" });
    expect(getBookingPaymentsDeleted()).toBe(true);
    expect(getPaymentsUpdated()).toBe(true);
    expect(slackNotifyPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "paystack",
        reference: "ref-genuine-failure",
        bookingId: "booking-1",
      }),
    );
  });

  it("keeps the failed payment open when the gift card void does not answer", async () => {
    const { mockSupabase, bookingUpdates } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [{ id: "booking-1" }],
      giftVoid: null,
    });

    await handleChargeFailed(makeChargeFailedEvent("ref-gift-unknown"), mockSupabase);

    expect(bookingUpdates).toContainEqual({
      cancellation_reason: "Payment failed — refund still due",
    });
  });

  it("closes the failed payment when the gift card void finds no redemption row", async () => {
    const { mockSupabase, bookingUpdates } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [{ id: "booking-1" }],
      giftVoid: false,
    });

    await handleChargeFailed(makeChargeFailedEvent("ref-gift-absent"), mockSupabase);

    expect(bookingUpdates).toContainEqual({ cancellation_reason: "Payment failed" });
  });

  it("returns a counted gift to the wallet when the void leaves it captured", async () => {
    const { mockSupabase, bookingUpdates, rpcCalls } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [{ id: "booking-1" }],
      giftVoid: false,
      giftCardAmount: 40,
    });

    await handleChargeFailed(makeChargeFailedEvent("ref-gift-captured"), mockSupabase);

    expect(rpcCalls).toContainEqual({
      fn: "wallet_credit_admin",
      args: expect.objectContaining({
        p_amount: 40,
        p_idempotency_key: "booking_payment_failed_gift:booking-1",
      }),
    });
    expect(bookingUpdates).toContainEqual({ gift_card_amount: 0, gift_card_id: null });
    expect(bookingUpdates).toContainEqual({ cancellation_reason: "Payment failed" });
  });

  it("returns the wallet and gift from a failed remaining-balance card without cancelling the visit", async () => {
    const { mockSupabase, bookingUpdates } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [],
      liveBooking: {
        status: "confirmed",
        payment_status: "partially_paid",
        customer_id: "customer-1",
        provider_id: "provider-1",
        tenant_id: "tenant-1",
        currency: "ZAR",
      },
    });

    await handleChargeFailed(
      makeChargeFailedEvent("ref-remaining", {
        payment_type: "booking_remaining",
        wallet_amount_applied: 30,
        gift_card_amount_applied: 20,
        currency: "ZAR",
      }),
      mockSupabase,
    );

    expect(rollbackCollectibleSplitLeg).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        bookingId: "booking-1",
        customerId: "customer-1",
        walletAmountToReverse: 30,
        giftCardAmountToReverse: 20,
        paymentLegSuffix: ":remaining:ref-remaining",
        idempotencyKey: "pay_remaining_rollback:ref-remaining",
      }),
    );
    expect(bookingUpdates.some((row) => row.status === "cancelled")).toBe(false);
    expect(bookingUpdates).toContainEqual(
      expect.objectContaining({ payment_status: "partially_paid" }),
    );
  });

  it("returns the wallet and gift from a failed extra charge without cancelling the visit", async () => {
    const { mockSupabase, bookingUpdates } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [],
    });

    await handleChargeFailed(
      makeChargeFailedEvent("ref-extra", {
        additional_charge_id: "charge-1",
        wallet_amount_applied: 15,
        gift_card_amount_applied: 10,
        currency: "ZAR",
      }),
      mockSupabase,
    );

    expect(rollbackCollectibleSplitLeg).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        bookingId: "booking-1",
        customerId: "customer-1",
        walletAmountToReverse: 15,
        giftCardAmountToReverse: 10,
        paymentLegSuffix: ":additional:charge-1",
        idempotencyKey: "additional_charge_rollback:charge-1:ref-extra",
      }),
    );
    expect(bookingUpdates.some((row) => row.status === "cancelled")).toBe(false);
  });

  it("returns the prepaid session once when the card payment fails", async () => {
    const { mockSupabase, rpcCalls } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [{ id: "booking-1" }],
      packageEntitlementId: "ent-1",
    });

    await handleChargeFailed(makeChargeFailedEvent("ref-package"), mockSupabase);

    expect(rpcCalls).toContainEqual({
      fn: "restore_customer_package_entitlement",
      args: { p_entitlement_id: "ent-1", p_customer_id: "customer-1" },
    });
  });

  it("puts the prepaid session back on the visit when the return reports that nothing was given back", async () => {
    const { mockSupabase, bookingUpdates } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [{ id: "booking-1" }],
      packageEntitlementId: "ent-1",
      restoreSession: false,
    });

    await handleChargeFailed(makeChargeFailedEvent("ref-package-not-returned"), mockSupabase);

    expect(bookingUpdates).toContainEqual({ customer_package_entitlement_id: "ent-1" });
  });

  it("does not return the session again when this failure is delivered again", async () => {
    const { mockSupabase, rpcCalls, paymentTxInserts } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [],
      liveBooking: { status: "cancelled", payment_status: "failed" },
      packageEntitlementId: "ent-1",
      packageAlreadyReturned: true,
    });

    await handleChargeFailed(makeChargeFailedEvent("ref-package-retry"), mockSupabase);

    expect(rpcCalls.some((call) => call.fn === "restore_customer_package_entitlement")).toBe(false);
    expect(paymentTxInserts).toHaveLength(0);
  });

  it("leaves the original visit's session in place when the replacement payment fails", async () => {
    const { mockSupabase, rpcCalls, bookingUpdates } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [{ id: "booking-1" }],
      packageEntitlementId: "ent-1",
      rescheduledFromBookingId: "booking-old",
    });

    await handleChargeFailed(makeChargeFailedEvent("ref-reschedule"), mockSupabase);

    expect(rpcCalls.some((call) => call.fn === "restore_customer_package_entitlement")).toBe(false);
    expect(bookingUpdates).toContainEqual({ customer_package_entitlement_id: null });
  });

  it("returns the replacement session when the original visit no longer holds it", async () => {
    const { mockSupabase, rpcCalls } = makeBookingChargeFailedSupabase({
      successTxExists: false,
      claimedRows: [{ id: "booking-1" }],
      packageEntitlementId: "ent-new",
      rescheduledFromBookingId: "booking-old",
      originalEntitlementId: null,
    });

    await handleChargeFailed(makeChargeFailedEvent("ref-reschedule-own-session"), mockSupabase);

    expect(rpcCalls).toContainEqual({
      fn: "restore_customer_package_entitlement",
      args: { p_entitlement_id: "ent-new", p_customer_id: "customer-1" },
    });
  });
});
