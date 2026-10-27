import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockSyncPaymentTransactionRefundState = vi.fn();
const mockResolveTenantIdForFinanceLedger = vi.fn();

vi.mock("@/lib/finance/sync-payment-transaction-refund", () => ({
  syncPaymentTransactionRefundState: (...args: unknown[]) =>
    mockSyncPaymentTransactionRefundState(...args),
}));

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: (...args: unknown[]) =>
    mockResolveTenantIdForFinanceLedger(...args),
}));

import { replayFailedOrPendingStoreCreditForTests } from "@/lib/finance/run-auto-wallet-credit-exceptions";

const REFUND_ID = "ref-failed-1";
const BOOKING_ID = "book-1";
const TENANT_ID = "tenant-1";

function buildSupabase(options?: { rpcError?: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ error: options?.rpcError ?? null });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  const refundRowPayload = {
    data: {
      id: REFUND_ID,
      amount: 150,
      status: "failed",
      refund_method: "store_credit",
      created_at: new Date(Date.now() - 60_000).toISOString(),
      reason: "Cancellation refund",
    },
    error: null,
  };

  const refundSelectChain = {
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(refundRowPayload),
    }),
  };

  const bookingSelectChain = {
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          customer_id: "cust-1",
          booking_number: "BK-99",
          currency: "ZAR",
          tenant_id: TENANT_ID,
          provider_id: "prov-1",
        },
        error: null,
      }),
    }),
  };

  const allRefundsSelectChain = {
    eq: vi.fn().mockResolvedValue({
      data: [{ amount: 150, refund_method: "store_credit", status: "completed" }],
      error: null,
    }),
  };

  const from = vi.fn((table: string) => {
    if (table === "booking_refunds") {
      return {
        update,
        select: vi.fn((cols?: string) => {
          if (typeof cols === "string" && cols.includes("status") && !cols.includes("created_at")) {
            return allRefundsSelectChain;
          }
          return refundSelectChain;
        }),
      };
    }
    if (table === "bookings") {
      return { select: vi.fn().mockReturnValue(bookingSelectChain) };
    }
    return { select: vi.fn() };
  });

  const client = { from, rpc } as unknown as SupabaseClient;
  return { client, rpc, update, updateEq };
}

describe("replayFailedOrPendingStoreCredit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdForFinanceLedger.mockResolvedValue(TENANT_ID);
    mockSyncPaymentTransactionRefundState.mockResolvedValue(undefined);
  });

  it("replays wallet_credit_admin with booking_refund idempotency key and syncs payment state", async () => {
    const { client, rpc, updateEq } = buildSupabase();

    const ok = await replayFailedOrPendingStoreCreditForTests(
      client,
      TENANT_ID,
      REFUND_ID,
      BOOKING_ID,
    );

    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({
        p_idempotency_key: `booking_refund:${REFUND_ID}`,
        p_amount: 150,
        p_user_id: "cust-1",
      }),
    );
    expect(updateEq).toHaveBeenCalledWith("id", REFUND_ID);
    expect(mockSyncPaymentTransactionRefundState).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: BOOKING_ID,
        cumulativeRefundAmount: 150,
        reason: "Cancellation refund",
      }),
    );
  });

  it("returns false on wallet RPC error without syncing payments", async () => {
    const { client, rpc } = buildSupabase({ rpcError: { message: "rpc failed" } });

    const ok = await replayFailedOrPendingStoreCreditForTests(
      client,
      TENANT_ID,
      REFUND_ID,
      BOOKING_ID,
    );

    expect(ok).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mockSyncPaymentTransactionRefundState).not.toHaveBeenCalled();
  });

  it("second replay uses the same idempotency key (no new refund row)", async () => {
    const { client, rpc } = buildSupabase();

    await replayFailedOrPendingStoreCreditForTests(client, TENANT_ID, REFUND_ID, BOOKING_ID);
    await replayFailedOrPendingStoreCreditForTests(client, TENANT_ID, REFUND_ID, BOOKING_ID);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]?.[1]?.p_idempotency_key).toBe(`booking_refund:${REFUND_ID}`);
    expect(rpc.mock.calls[1]?.[1]?.p_idempotency_key).toBe(`booking_refund:${REFUND_ID}`);
  });
});
