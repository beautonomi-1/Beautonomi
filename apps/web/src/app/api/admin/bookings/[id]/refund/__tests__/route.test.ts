import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/api-helpers")>(
    "@/lib/supabase/api-helpers",
  );
  return {
    ...actual,
    requireAdminSection: vi.fn(async () => ({ user: { id: "admin-1", role: "superadmin" } })),
  };
});
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/tenant/admin-booking-tenant", () => ({
  fetchBookingInAdminTenant: vi.fn(),
}));
vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));
vi.mock("@/lib/locale/tenant-locale", () => ({
  getTenantLocaleTagFromRegionConfig: vi.fn(() => "en-ZA"),
}));
vi.mock("@/lib/finance/issue-admin-wallet-refund", () => ({
  issueAdminWalletRefund: vi.fn(),
}));
vi.mock("@/lib/waitlist/matching", () => ({
  matchWaitlistOnCancellation: vi.fn(async () => undefined),
}));

const BOOKING_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    total_amount: 300,
    total_paid: 300,
    total_refunded: 0,
    customer_id: "cust-1",
    booking_number: "BK-1",
    currency: "ZAR",
    payment_status: "paid",
    tenant_id: "tenant-1",
    provider_id: "prov-1",
    wallet_amount: 0,
    gift_card_amount: 0,
    ...overrides,
  };
}

function makeSupabase(chargeRows: Array<Record<string, unknown>>) {
  const bookingUpdates: Record<string, unknown>[] = [];
  return {
    bookingUpdates,
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = vi.fn(self);
      chain.eq = vi.fn(self);
      chain.in = vi.fn(self);
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        if (table === "bookings") bookingUpdates.push(payload);
        return chain;
      });
      chain.order = vi.fn(async () => ({
        data: table === "payment_transactions" ? chargeRows : [],
        error: null,
      }));
      return chain;
    }),
  };
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import("../route");
  return POST(
    createMockNextRequest({
      method: "POST",
      url: `http://localhost/api/admin/bookings/${BOOKING_ID}/refund`,
      body,
    }) as never,
    { params: Promise.resolve({ id: BOOKING_ID }) },
  );
}

describe("POST /api/admin/bookings/[id]/refund", () => {
  async function setup(opts: {
    booking?: ReturnType<typeof makeBooking>;
    chargeRows?: Array<Record<string, unknown>>;
  }) {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { fetchBookingInAdminTenant } = await import("@/lib/tenant/admin-booking-tenant");
    const { issueAdminWalletRefund } = await import("@/lib/finance/issue-admin-wallet-refund");
    const supabase = makeSupabase(opts.chargeRows ?? []);
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);
    vi.mocked(fetchBookingInAdminTenant).mockResolvedValue({
      booking: opts.booking ?? makeBooking(),
    } as never);
    vi.mocked(issueAdminWalletRefund).mockResolvedValue({
      success: true,
      refundId: "refund-1",
      amount: 100,
      providerBalanceWarning: null,
    });
    return { supabase, issueAdminWalletRefund: vi.mocked(issueAdminWalletRefund) };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("card-paid booking: refunds against the charge row using that row's own refunded total", async () => {
    const { issueAdminWalletRefund } = await setup({
      booking: makeBooking({ total_refunded: 50 }),
      chargeRows: [
        { id: "txn-extra", transaction_type: "additional_charge", amount: 40, refund_amount: 0 },
        { id: "txn-main", transaction_type: "charge", amount: 300, refund_amount: 20 },
      ],
    });

    const res = await post({ amount: 100, reason: "Goodwill" });

    expect(res.status).toBe(200);
    expect(issueAdminWalletRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: BOOKING_ID,
        amount: 100,
        transactionId: "txn-main",
        originalChargeAmount: 300,
        priorRefundAmount: 20,
      }),
    );
    expect(issueAdminWalletRefund.mock.calls[0][0]).not.toHaveProperty("bookingTenderMode");
  });

  it("cash / in-person booking: uses booking tender mode with booking-level totals", async () => {
    const { issueAdminWalletRefund } = await setup({
      booking: makeBooking({ total_refunded: 50 }),
      chargeRows: [],
    });

    const res = await post({ amount: 100 });

    expect(res.status).toBe(200);
    expect(issueAdminWalletRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingTenderMode: true,
        originalChargeAmount: 300,
        priorRefundAmount: 50,
      }),
    );
  });

  it("full refund cancels the booking and runs waitlist matching", async () => {
    const { supabase } = await setup({ chargeRows: [] });
    const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");

    const res = await post({ amount: 300 });

    expect(res.status).toBe(200);
    expect(supabase.bookingUpdates).toEqual([
      expect.objectContaining({ status: "cancelled" }),
    ]);
    expect(matchWaitlistOnCancellation).toHaveBeenCalledWith(supabase, BOOKING_ID);
  });

  it("partial refund leaves the booking active", async () => {
    const { supabase } = await setup({ chargeRows: [] });

    await post({ amount: 100 });

    expect(supabase.bookingUpdates).toEqual([]);
  });

  it("passes through refund failures without cancelling", async () => {
    const { supabase, issueAdminWalletRefund } = await setup({ chargeRows: [] });
    issueAdminWalletRefund.mockResolvedValue({
      success: false,
      error: "Refund blocked by an active financial period lock",
      code: "PERIOD_LOCKED",
      httpStatus: 423,
    });

    const res = await post({ amount: 300 });

    expect(res.status).toBe(423);
    expect((await res.json()).error?.code).toBe("PERIOD_LOCKED");
    expect(supabase.bookingUpdates).toEqual([]);
  });

  it("rejects amounts above what is left to refund", async () => {
    const { issueAdminWalletRefund } = await setup({
      booking: makeBooking({ total_refunded: 250 }),
    });

    const res = await post({ amount: 100 });

    expect(res.status).toBe(400);
    expect(issueAdminWalletRefund).not.toHaveBeenCalled();
  });
});
