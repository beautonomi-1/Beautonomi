import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/api-helpers")>(
    "@/lib/supabase/api-helpers",
  );
  return {
    ...actual,
    getProviderIdForUser: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/provider-booking/booking-branch-access", () => ({
  assertProviderUserCanAccessBookingBranch: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@/lib/payments/require-manual-card-enabled", () => ({
  requireManualCardEnabledForProvider: vi.fn(async () => null),
}));

vi.mock("@/lib/tenant/provider-matches-host", () => ({
  bookingTenantMismatchResponse: vi.fn(() => null),
}));

vi.mock("@/lib/money/tenant-intl-format", () => ({
  getTenantMoneyFormatter: vi.fn(async () => ({ format: (n: number) => `R${n}` })),
}));

vi.mock("@/lib/payments/yoco-feature-gate", () => ({
  requireYocoPlatformEnabledForProvider: vi.fn(async () => null),
}));

const BOOKING_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROVIDER_ID = "pppppppp-pppp-pppp-pppp-pppppppppppp";

function bookingFullyPaidMock() {
  const booking = {
    id: BOOKING_ID,
    provider_id: PROVIDER_ID,
    tenant_id: "tenant-1",
    customer_id: "cust-1",
    status: "confirmed",
    payment_status: "paid",
    total_amount: 100,
    total_paid: 100,
    wallet_amount: 0,
    gift_card_amount: 0,
    currency: "ZAR",
    additional_charges: [],
  };
  return {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = vi.fn(self);
      chain.eq = vi.fn(self);
      chain.single = vi.fn(async () =>
        table === "bookings" ? { data: booking, error: null } : { data: null, error: null },
      );
      chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      return chain;
    }),
    rpc: vi.fn(),
  };
}

describe("POST mark-paid when booking already fully paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with already_paid instead of ALREADY_PAID 400", async () => {
    const { requirePermission } = await import("@/lib/auth/requirePermission");
    const { getProviderIdForUser } = await import("@/lib/supabase/api-helpers");
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");

    vi.mocked(requirePermission).mockResolvedValue({
      authorized: true,
      user: MOCK_USERS.provider_owner,
    } as never);
    vi.mocked(getProviderIdForUser).mockResolvedValue(PROVIDER_ID);
    vi.mocked(getSupabaseServer).mockResolvedValue(bookingFullyPaidMock() as never);
    vi.mocked(getSupabaseAdmin).mockReturnValue(bookingFullyPaidMock() as never);

    const { POST } = await import("../route");
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: `http://localhost/api/provider/bookings/${BOOKING_ID}/mark-paid`,
        body: { payment_method: "cash", settle_additional_charges: true },
      }) as never,
      { params: Promise.resolve({ id: BOOKING_ID }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data?.already_paid).toBe(true);
  });
});
