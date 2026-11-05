import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { createMockNextRequest, MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/api-helpers")>(
    "@/lib/supabase/api-helpers",
  );
  return { ...actual, getProviderIdForUser: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR", defaultLanguage: "en", regionCode: "ZA" })),
}));

vi.mock("@/lib/provider-booking/booking-branch-access", () => ({
  assertProviderUserCanAccessBookingBranch: vi.fn(async () => ({ allowed: true })),
}));

const BOOKING_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROVIDER_ID = "pppppppp-pppp-4ppp-8ppp-pppppppppppp";

const booking = {
  id: BOOKING_ID,
  booking_number: "B-1",
  ref_number: "R-1",
  total_amount: 200,
  payment_status: "paid",
  provider_id: PROVIDER_ID,
  customer_id: "cust-1",
  currency: "ZAR",
  tenant_id: "tenant-1",
  location_id: null,
  total_paid: 200,
  total_refunded: 0,
  wallet_amount: 0,
  gift_card_amount: 0,
};

function db(rows: { payments: unknown[]; refunds?: unknown[] }) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const method of ["select", "eq", "in", "is", "order", "limit"]) chain[method] = self;
      chain.single = async () =>
        table === "bookings" ? { data: booking, error: null } : { data: null, error: { message: "missing" } };
      chain.maybeSingle = chain.single;
      chain.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) => {
        const data = table === "booking_payments" ? rows.payments : table === "booking_refunds" ? rows.refunds ?? [] : [];
        return resolve({ data, error: null });
      };
      return chain;
    },
  };
}

describe("POST /api/provider/bookings/[id]/refund caps and permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for staff without issue_refunds and does not look up the booking", async () => {
    const { requirePermission } = await import("@/lib/auth/requirePermission");
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(requirePermission).mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: { message: "Permission denied", code: "FORBIDDEN" } }, { status: 403 }),
      user: { id: "staff-1", role: "provider_staff" },
    });

    const { POST } = await import("../route");
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: `http://localhost/api/provider/bookings/${BOOKING_ID}/refund`,
        body: { amount: 50, reason: "mistake", refund_method: "store_credit" },
      }) as never,
      { params: Promise.resolve({ id: BOOKING_ID }) },
    );

    expect(requirePermission).toHaveBeenCalledWith("issue_refunds", expect.anything());
    expect(res.status).toBe(403);
    expect(getSupabaseServer).not.toHaveBeenCalled();
  });

  it("rejects a wallet refund above the online cap on a cash booking", async () => {
    const { requirePermission } = await import("@/lib/auth/requirePermission");
    const { getProviderIdForUser } = await import("@/lib/supabase/api-helpers");
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const client = db({
      payments: [{ id: "pay-1", amount: 200, payment_method: "cash", payment_provider: "cash", status: "completed" }],
    });
    vi.mocked(requirePermission).mockResolvedValue({
      authorized: true,
      user: MOCK_USERS.provider_owner,
    } as never);
    vi.mocked(getProviderIdForUser).mockResolvedValue(PROVIDER_ID);
    vi.mocked(getSupabaseServer).mockResolvedValue(client as never);
    vi.mocked(getSupabaseAdmin).mockReturnValue(client as never);

    const { POST } = await import("../route");
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: `http://localhost/api/provider/bookings/${BOOKING_ID}/refund`,
        body: { amount: 50, reason: "customer asked", refund_method: "store_credit" },
      }) as never,
      { params: Promise.resolve({ id: BOOKING_ID }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("WALLET_REFUND_CAP_EXCEEDED");
  });

  it("rejects a wallet refund above the online share even when the caller is the owner", async () => {
    const { requirePermission } = await import("@/lib/auth/requirePermission");
    const { getProviderIdForUser } = await import("@/lib/supabase/api-helpers");
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const client = db({
      payments: [
        { id: "pay-online", amount: 80, payment_method: "card", payment_provider: "paystack", status: "completed" },
        { id: "pay-cash", amount: 120, payment_method: "cash", payment_provider: "cash", status: "completed" },
      ],
    });
    vi.mocked(requirePermission).mockResolvedValue({
      authorized: true,
      user: MOCK_USERS.provider_owner,
    } as never);
    vi.mocked(getProviderIdForUser).mockResolvedValue(PROVIDER_ID);
    vi.mocked(getSupabaseServer).mockResolvedValue(client as never);
    vi.mocked(getSupabaseAdmin).mockReturnValue(client as never);

    const { POST } = await import("../route");
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: `http://localhost/api/provider/bookings/${BOOKING_ID}/refund`,
        body: { amount: 90, reason: "over the online share", refund_method: "wallet" },
      }) as never,
      { params: Promise.resolve({ id: BOOKING_ID }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("WALLET_REFUND_CAP_EXCEEDED");
  });
});
