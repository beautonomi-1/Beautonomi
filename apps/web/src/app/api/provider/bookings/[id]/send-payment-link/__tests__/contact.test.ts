import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockHasPermission = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: async () => "tenant-1",
}));

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: async () => true,
}));

vi.mock("@/lib/money/tenant-intl-format", () => ({
  getTenantMoneyFormatter: async () => ({ format: (amount: number) => `R${amount}` }),
}));

vi.mock("@/lib/provider-booking/booking-branch-access", () => ({
  assertProviderUserCanAccessBookingBranch: async () => ({ allowed: true }),
}));

vi.mock("@/lib/bookings/provider-booking-platform-fee", () => ({
  clearUncollectedProviderPortalPlatformFeeIfNeeded: async () => ({ cleared: false }),
}));

vi.mock("@/lib/bookings/ensure-wallet-gift-booking-payments", () => ({
  sumPendingWalletGiftBookingPayments: async () => 0,
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: async () => undefined,
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendTemplateNotification: async () => undefined,
}));

vi.mock("@/lib/notifications/customer-booking-channels", () => ({
  customerBookingChannels: async () => ["email"],
}));

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";

describe("POST /api/provider/bookings/[id]/send-payment-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "staff-1", role: "provider_staff" },
    });
    mockHasPermission.mockResolvedValue(false);
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    const booking = {
      id: BOOKING_ID,
      tenant_id: "tenant-1",
      booking_number: "B-1",
      ref_number: "B-1",
      total_amount: 100,
      total_paid: 0,
      total_refunded: 0,
      wallet_amount: 0,
      gift_card_amount: 0,
      payment_status: "pending",
      provider_id: "provider-1",
      customer_id: "customer-1",
      location_id: null,
      additional_charges: [],
      customers: { id: "customer-1", full_name: "Ada", email: "ada@example.com", phone: "0820000000" },
      providers: { id: "provider-1", business_name: "Glow" },
    };
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      single: vi.fn(async () => ({ data: booking, error: null })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    mockGetSupabaseServer.mockResolvedValue({ from: vi.fn(() => chain) });
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn(() => chain) });
  });

  it("does not echo the customer email or phone without view_clients", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest(`http://localhost/api/provider/bookings/${BOOKING_ID}/send-payment-link`, {
        method: "POST",
        body: JSON.stringify({ delivery_method: "both" }),
      }),
      { params: Promise.resolve({ id: BOOKING_ID }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.sent_to.email).toBeNull();
    expect(body.data.sent_to.phone).toBeNull();
    expect(body.data.payment_link).toContain(BOOKING_ID);
  });
});
