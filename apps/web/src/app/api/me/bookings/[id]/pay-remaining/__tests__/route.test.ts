import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const PROVIDER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolvePaymentTenantForBookingRequest = vi.fn();
const mockGetTenantRegionConfig = vi.fn();
const mockApplyCollectibleGiftAndWallet = vi.fn();
const mockRecordCollectibleSettlementLedger = vi.fn();
const mockCompleteWalletGiftSyntheticPayments = vi.fn();
const mockSyncBookingAfterPaystackSuccess = vi.fn();
const mockRollbackCollectibleSplitLeg = vi.fn();
const mockInitializePaystackTransaction = vi.fn();
const mockGenerateTransactionReference = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/bookings/resolve-payment-tenant", () => ({
  resolvePaymentTenantForBookingRequest: (...args: unknown[]) =>
    mockResolvePaymentTenantForBookingRequest(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: (...args: unknown[]) => mockGetTenantRegionConfig(...args),
}));

vi.mock("@/lib/bookings/apply-collectible-gift-wallet", () => ({
  applyCollectibleGiftAndWallet: (...args: unknown[]) => mockApplyCollectibleGiftAndWallet(...args),
}));

vi.mock("@/lib/bookings/record-collectible-settlement-ledger", () => ({
  recordCollectibleSettlementLedger: (...args: unknown[]) =>
    mockRecordCollectibleSettlementLedger(...args),
}));

vi.mock("@/lib/bookings/ensure-wallet-gift-booking-payments", () => ({
  completeWalletGiftSyntheticPayments: (...args: unknown[]) =>
    mockCompleteWalletGiftSyntheticPayments(...args),
}));

vi.mock("@/lib/bookings/sync-booking-after-paystack-success", () => ({
  syncBookingAfterPaystackSuccess: (...args: unknown[]) => mockSyncBookingAfterPaystackSuccess(...args),
}));

vi.mock("@/lib/bookings/rollback-collectible-split-leg", () => ({
  rollbackCollectibleSplitLeg: (...args: unknown[]) => mockRollbackCollectibleSplitLeg(...args),
}));

vi.mock("@/lib/payments/paystack-server", () => ({
  initializePaystackTransaction: (...args: unknown[]) => mockInitializePaystackTransaction(...args),
}));

vi.mock("@/lib/payments/paystack", () => ({
  convertToSmallestUnit: (amount: number) => Math.round(amount * 100),
  generateTransactionReference: (...args: unknown[]) => mockGenerateTransactionReference(...args),
}));

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    customer_id: "user-1",
    provider_id: PROVIDER_ID,
    total_amount: 1000,
    total_paid: 300,
    total_refunded: 0,
    wallet_amount: 0,
    gift_card_amount: 0,
    payment_status: "partially_paid",
    currency: "ZAR",
    booking_number: "BN-001",
    ref_number: null,
    status: "confirmed",
    tenant_id: TENANT_ID,
    additional_charges: [],
    ...overrides,
  };
}

function makeSupabaseMock(booking: ReturnType<typeof bookingRow> | null) {
  return {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () =>
                  booking
                    ? { data: booking, error: null }
                    : { data: null, error: { message: "not found" } },
                ),
              })),
            })),
          })),
        };
      }
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { email: "customer@example.com", full_name: "Test User" },
                error: null,
              })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };
}

function makeAdminMock() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
      insert: vi.fn(async () => ({ error: null })),
    })),
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };
}

type PayRemainingPost = typeof import("../route").POST;

let POST: PayRemainingPost;

describe("POST /api/me/bookings/[id]/pay-remaining", () => {
  beforeAll(async () => {
    ({ POST } = await import("../route"));
  }, 90_000);

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1", role: "customer" } });
    mockResolvePaymentTenantForBookingRequest.mockResolvedValue({
      ok: true,
      paymentTenantId: TENANT_ID,
    });
    mockGetTenantRegionConfig.mockResolvedValue({ defaultCurrency: "ZAR" });
    mockGenerateTransactionReference.mockReturnValue("remaining_test_ref");
    mockGetSupabaseAdmin.mockReturnValue(makeAdminMock());
    mockCompleteWalletGiftSyntheticPayments.mockResolvedValue(undefined);
    mockSyncBookingAfterPaystackSuccess.mockResolvedValue({ ok: true });
    mockRecordCollectibleSettlementLedger.mockResolvedValue(undefined);
    mockRollbackCollectibleSplitLeg.mockResolvedValue(undefined);
  });

  it("happy path: Paystack-only for full remaining balance (no split)", async () => {
    mockGetSupabaseServer.mockResolvedValue(makeSupabaseMock(bookingRow()));
    mockInitializePaystackTransaction.mockResolvedValue({
      data: {
        authorization_url: "https://checkout.paystack.com/abc",
        access_code: "access_abc",
      },
    });

    const req = new NextRequest(`http://localhost/api/me/bookings/${BOOKING_ID}/pay-remaining`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: BOOKING_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body?.data?.fully_settled).toBe(false);
    expect(body?.data?.authorization_url).toBe("https://checkout.paystack.com/abc");
    expect(body?.data?.paystack_amount).toBe(700);
    expect(body?.data?.wallet_amount_applied).toBe(0);
    expect(mockApplyCollectibleGiftAndWallet).not.toHaveBeenCalled();
    expect(mockInitializePaystackTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amountInSmallestUnit: 70_000,
        metadata: expect.objectContaining({
          payment_type: "booking_remaining",
          booking_id: BOOKING_ID,
          wallet_amount_applied: 0,
          gift_card_amount_applied: 0,
        }),
      }),
    );
  });

  it("happy path: wallet partial + Paystack remainder", async () => {
    mockGetSupabaseServer.mockResolvedValue(makeSupabaseMock(bookingRow()));
    mockApplyCollectibleGiftAndWallet.mockResolvedValue({
      ok: true,
      walletAmountApplied: 200,
      giftCardAmountApplied: 0,
      giftCardId: null,
      paystackAmount: 500,
      warnings: [],
      fullySettled: false,
    });
    mockInitializePaystackTransaction.mockResolvedValue({
      data: {
        authorization_url: "https://checkout.paystack.com/split",
        access_code: "access_split",
      },
    });

    const req = new NextRequest(`http://localhost/api/me/bookings/${BOOKING_ID}/pay-remaining`, {
      method: "POST",
      body: JSON.stringify({ use_wallet: true }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: BOOKING_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body?.data?.fully_settled).toBe(false);
    expect(body?.data?.wallet_amount_applied).toBe(200);
    expect(body?.data?.paystack_amount).toBe(500);
    expect(mockApplyCollectibleGiftAndWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        collectibleAmount: 700,
        useWallet: true,
        paymentLegSuffix: ":remaining:remaining_test_ref",
      }),
    );
    expect(mockInitializePaystackTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amountInSmallestUnit: 50_000,
        metadata: expect.objectContaining({
          wallet_amount_applied: 200,
          gift_card_amount_applied: 0,
        }),
      }),
    );
    expect(mockRecordCollectibleSettlementLedger).not.toHaveBeenCalled();
  });

  it("happy path: gift + wallet fully settle remaining (no Paystack)", async () => {
    mockGetSupabaseServer.mockResolvedValue(makeSupabaseMock(bookingRow()));
    mockApplyCollectibleGiftAndWallet.mockResolvedValue({
      ok: true,
      walletAmountApplied: 150,
      giftCardAmountApplied: 550,
      giftCardId: "gc-1",
      paystackAmount: 0,
      warnings: [],
      fullySettled: true,
    });

    const req = new NextRequest(`http://localhost/api/me/bookings/${BOOKING_ID}/pay-remaining`, {
      method: "POST",
      body: JSON.stringify({ use_wallet: true, gift_card_code: "GIFT550" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: BOOKING_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body?.data?.fully_settled).toBe(true);
    expect(body?.data?.authorization_url).toBe("");
    expect(body?.data?.paystack_amount).toBe(0);
    expect(body?.data?.wallet_amount_applied).toBe(150);
    expect(body?.data?.gift_card_amount_applied).toBe(550);
    expect(mockInitializePaystackTransaction).not.toHaveBeenCalled();
    expect(mockRecordCollectibleSettlementLedger).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bookingId: BOOKING_ID,
        collectibleAmount: 700,
        walletAmountApplied: 150,
        giftCardAmountApplied: 550,
        idempotencyReference: "remaining_test_ref",
      }),
    );
    expect(mockCompleteWalletGiftSyntheticPayments).toHaveBeenCalled();
    expect(mockSyncBookingAfterPaystackSuccess).toHaveBeenCalled();
  });

  it("returns NO_REMAINING_BALANCE when outstanding is zero", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabaseMock(
        bookingRow({
          total_paid: 1000,
          payment_status: "paid",
        }),
      ),
    );

    const req = new NextRequest(`http://localhost/api/me/bookings/${BOOKING_ID}/pay-remaining`, {
      method: "POST",
      body: JSON.stringify({ use_wallet: true }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: BOOKING_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body?.error?.code).toBe("NO_REMAINING_BALANCE");
  });
});
