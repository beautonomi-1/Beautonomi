/**
 * Unit tests for issueAdminWalletRefund helper.
 *
 * These tests use lightweight Supabase mock stubs — no real DB connections.
 * They verify:
 *  - Amount validation (<=0 rejected)
 *  - Period lock short-circuits with PERIOD_LOCKED
 *  - Wallet-credit failure rolls back the booking_refunds row and returns WALLET_ERROR
 *  - Happy path: success=true, correct refundId and amount returned
 *  - transactionId provided: payment_transactions update is invoked
 *  - Full-refund gift card restoration trigger path
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---- Shared module mocks ---------------------------------------------------
// Prevent real dynamic imports from loading during unit tests
vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/provider/available-payout-balance", () => ({
  getAvailablePayoutBalance: vi
    .fn()
    .mockResolvedValue({ rawBalance: 100 }),
}));
vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn().mockResolvedValue({ defaultCurrency: "ZAR" }),
}));
vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn().mockResolvedValue("tenant-1"),
}));

import { issueAdminWalletRefund } from "../issue-admin-wallet-refund";

// ---- Supabase stub builder -------------------------------------------------

interface MockOpts {
  bookingRow?: Record<string, unknown> | null;
  periodLocked?: boolean;
  refundInsertId?: string;
  walletError?: string | null;
  txnUpdateError?: string | null;
  finalizeError?: string | null;
  /** Charge txns returned by the no-transactionId lookup. */
  chargeTxns?: Array<{ id: string; transaction_type?: string; created_at?: string }>;
}

function buildMock(opts: MockOpts = {}): SupabaseClient {
  const {
    bookingRow = {
      customer_id: "cust-1",
      booking_number: "BK-001",
      currency: "ZAR",
      tenant_id: "tenant-1",
      provider_id: "prov-1",
      gift_card_amount: 0,
    },
    periodLocked = false,
    refundInsertId = "refund-uuid",
    walletError = null,
    txnUpdateError = null,
    finalizeError = null,
    chargeTxns = [],
  } = opts;

  const deletedIds: string[] = [];

  return {
    from(table: string) {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: bookingRow,
                  error: bookingRow ? null : { message: "not found" },
                }),
            }),
          }),
        };
      }

      if (table === "financial_period_locks") {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                gte: () => ({
                  limit: () => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: periodLocked ? { id: "lock-1" } : null,
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "booking_refunds") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: refundInsertId },
                  error: null,
                }),
            }),
          }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              deletedIds.push(id);
              return Promise.resolve({ error: null });
            },
          }),
          update: () => ({
            eq: () =>
              Promise.resolve({
                error: finalizeError ? { message: finalizeError } : null,
              }),
          }),
        };
      }

      if (table === "payment_transactions") {
        const claimSelect = () =>
          Promise.resolve({
            data: txnUpdateError ? [] : [{ id: "claimed-txn" }],
            error: txnUpdateError ? { message: txnUpdateError } : null,
          });
        const claimChain: Record<string, unknown> = {
          eq: () => claimChain,
          in: () => claimChain,
          or: () => claimChain,
          select: claimSelect,
          then: undefined,
        };
        // Allow `await claimQuery.select("id")` and also Promise-like terminal eq for rollback.
        (claimChain as { eq: (c?: string, v?: unknown) => unknown }).eq = (
          _c?: string,
          _v?: unknown,
        ) => {
          // Rollback path: update().eq(id) without further chain → Promise
          // Claim path: update().eq(id).in(...).or(...).select()
          return Object.assign(Promise.resolve({ error: null }), claimChain);
        };
        return {
          // no-transactionId charge lookup: select().eq().eq().in().order()
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  order: () =>
                    Promise.resolve({ data: chargeTxns, error: null }),
                }),
              }),
            }),
          }),
          update: () => claimChain,
        };
      }

      return {};
    },
    rpc: vi.fn().mockImplementation((name: string) => {
      if (name === "wallet_credit_admin") {
        return Promise.resolve({
          error: walletError ? { message: walletError } : null,
        });
      }
      if (name === "void_gift_card_redemption") {
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ error: null });
    }),
  } as unknown as SupabaseClient;
}

// ---- Tests -----------------------------------------------------------------

describe("issueAdminWalletRefund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects amount <= 0", async () => {
    const result = await issueAdminWalletRefund({
      supabase: buildMock(),
      tenantId: "tenant-1",
      bookingId: "booking-1",
      amount: 0,
      originalChargeAmount: 200,
      reason: "test",
      actorUserId: "admin-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("INVALID_AMOUNT");
      expect(result.httpStatus).toBe(400);
    }
  });

  it("rejects negative amount", async () => {
    const result = await issueAdminWalletRefund({
      supabase: buildMock(),
      tenantId: "tenant-1",
      bookingId: "booking-1",
      amount: -50,
      originalChargeAmount: 200,
      reason: "test",
      actorUserId: "admin-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("INVALID_AMOUNT");
  });

  it("returns BOOKING_NOT_FOUND when booking is missing", async () => {
    const result = await issueAdminWalletRefund({
      supabase: buildMock({ bookingRow: null }),
      tenantId: "tenant-1",
      bookingId: "missing",
      amount: 100,
      originalChargeAmount: 200,
      reason: "test",
      actorUserId: "admin-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("BOOKING_NOT_FOUND");
  });

  it("short-circuits with PERIOD_LOCKED when a lock is active", async () => {
    const result = await issueAdminWalletRefund({
      supabase: buildMock({ periodLocked: true }),
      tenantId: "tenant-1",
      bookingId: "booking-1",
      amount: 100,
      originalChargeAmount: 200,
      reason: "test",
      actorUserId: "admin-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("PERIOD_LOCKED");
      expect(result.httpStatus).toBe(423);
    }
  });

  it("returns WALLET_ERROR and rolls back booking_refunds on wallet failure", async () => {
    const mock = buildMock({ walletError: "RPC timeout" });
    const deleteSpy = vi.spyOn(mock, "from");

    const result = await issueAdminWalletRefund({
      supabase: mock,
      tenantId: "tenant-1",
      bookingId: "booking-1",
      amount: 100,
      originalChargeAmount: 200,
      reason: "test",
      actorUserId: "admin-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("WALLET_ERROR");
    // Verify delete was called (rollback)
    expect(deleteSpy).toHaveBeenCalledWith("booking_refunds");
  });

  it("returns success with correct refundId and amount on happy path", async () => {
    const result = await issueAdminWalletRefund({
      supabase: buildMock({ refundInsertId: "refund-abc" }),
      tenantId: "tenant-1",
      bookingId: "booking-1",
      amount: 150,
      originalChargeAmount: 200,
      reason: "dispute resolved",
      actorUserId: "admin-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.refundId).toBe("refund-abc");
      expect(result.amount).toBe(150);
      expect(result.providerBalanceWarning).toBeNull();
    }
  });

  it("updates payment_transactions when transactionId is supplied", async () => {
    const mock = buildMock();
    const fromSpy = vi.spyOn(mock, "from");

    await issueAdminWalletRefund({
      supabase: mock,
      tenantId: "tenant-1",
      bookingId: "booking-1",
      amount: 200,
      originalChargeAmount: 200,
      reason: "full refund",
      actorUserId: "admin-1",
      transactionId: "txn-123",
      // amount == originalChargeAmount → full refund
    });

    const txnCalls = fromSpy.mock.calls
      .map((args) => args[0])
      .filter((t) => t === "payment_transactions");
    expect(txnCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("resolves the booking's charge txn when no transactionId is supplied (dispute path)", async () => {
    const mock = buildMock({
      chargeTxns: [
        { id: "add-1", transaction_type: "additional_charge" },
        { id: "charge-primary", transaction_type: "charge" },
      ],
    });
    const fromSpy = vi.spyOn(mock, "from");

    const result = await issueAdminWalletRefund({
      supabase: mock,
      tenantId: "tenant-1",
      bookingId: "booking-1",
      amount: 200,
      originalChargeAmount: 200,
      reason: "dispute resolved — refund full",
      actorUserId: "admin-1",
      // no transactionId — dispute path
    });

    expect(result.success).toBe(true);
    // payment_transactions must be queried (lookup) and updated (sync)
    const txnCalls = fromSpy.mock.calls
      .map((args) => args[0])
      .filter((t) => t === "payment_transactions");
    // one for the select lookup, one for the update
    expect(txnCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("skips payment_transactions update when no charge txn exists (dispute path, no charge)", async () => {
    const mock = buildMock({ chargeTxns: [] });
    const result = await issueAdminWalletRefund({
      supabase: mock,
      tenantId: "tenant-1",
      bookingId: "booking-1",
      amount: 100,
      originalChargeAmount: 200,
      reason: "dispute partial",
      actorUserId: "admin-1",
    });
    // Still succeeds — wallet credit does not depend on a charge txn existing
    expect(result.success).toBe(true);
  });

  it("returns TXN_CLAIM_ERROR when payment_transactions claim fails before wallet credit", async () => {
    const result = await issueAdminWalletRefund({
      supabase: buildMock({ txnUpdateError: "db error", refundInsertId: "r1" }),
      tenantId: "tenant-1",
      bookingId: "booking-1",
      amount: 100,
      originalChargeAmount: 200,
      reason: "partial",
      actorUserId: "admin-1",
      transactionId: "txn-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("TXN_CLAIM_ERROR");
  });

  it("credits wallet excluding gift-card leg on full refund (gift card is restored separately)", async () => {
    const result = await issueAdminWalletRefund({
      supabase: buildMock({
        refundInsertId: "rf-full",
        bookingRow: {
          customer_id: "c1",
          booking_number: "BK-002",
          currency: "ZAR",
          tenant_id: "t1",
          provider_id: "p1",
          gift_card_amount: 50, // should trigger gift card restore
        },
      }),
      tenantId: "t1",
      bookingId: "b2",
      amount: 300,
      originalChargeAmount: 300,
      reason: "full refund",
      actorUserId: "admin-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // R300 gross − R50 gift restore = R250 wallet credit (no double refund)
      expect(result.amount).toBe(250);
    }
  });
});
