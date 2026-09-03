/**
 * Regression tests for the "success-then-failed race" guards in the standard
 * booking `charge.failed` handler (inside `processFailedPayment`).
 *
 * A duplicate/out-of-order Paystack webhook delivery must never downgrade a
 * booking that already has a successful payment, and a retry of the same
 * `charge.failed` event must not double-apply the cancellation/wallet-refund
 * side effects once the booking has already left `payment_status: "pending"`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleChargeFailed } from "../charge-success";
import { slackNotifyPaymentFailed } from "@/lib/integrations/slack/ops-triggers";
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

function makeBookingChargeFailedSupabase(options: {
  successTxExists: boolean;
  /** Rows returned by the atomic `.eq("payment_status", "pending")` claim update. */
  claimedRows: Array<{ id: string }>;
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
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  customer_id: "customer-1",
                  booking_number: "BK-1001",
                  tenant_id: "tenant-1",
                  provider_id: "provider-1",
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn((values: Record<string, unknown>) => {
            bookingUpdates.push(values);
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(async () => ({ data: options.claimedRows, error: null })),
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
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: options.successTxExists ? { id: "success-tx-1" } : null,
                    error: null,
                  })),
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
            eq: vi.fn(() => ({
              eq: vi.fn(async () => {
                paymentsUpdated = true;
                return { data: null, error: null };
              }),
            })),
          })),
        };
      }
      throw new Error(`unexpected table in charge-failed booking test: ${table}`);
    }),
    rpc: vi.fn(async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
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

function makeChargeFailedEvent(reference: string): PaystackEvent {
  return {
    event: "charge.failed",
    data: {
      reference,
      message: "Card declined",
      gateway_response: "Declined",
      metadata: {
        booking_id: "booking-1",
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
    expect(slackNotifyPaymentFailed).not.toHaveBeenCalled();
  });

  it("processes the booking failure once when the atomic claim succeeds", async () => {
    const { mockSupabase, bookingUpdates, paymentTxInserts, rpcCalls, getBookingPaymentsDeleted, getPaymentsUpdated } =
      makeBookingChargeFailedSupabase({
        successTxExists: false,
        claimedRows: [{ id: "booking-1" }],
      });

    await handleChargeFailed(makeChargeFailedEvent("ref-genuine-failure"), mockSupabase);

    expect(bookingUpdates).toHaveLength(1);
    expect(bookingUpdates[0]).toMatchObject({
      payment_status: "failed",
      status: "cancelled",
    });
    expect(paymentTxInserts).toHaveLength(1);
    expect(paymentTxInserts[0]).toMatchObject({ status: "failed", booking_id: "booking-1" });
    expect(rpcCalls.some((c) => c.fn === "void_gift_card_redemption")).toBe(true);
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
});
