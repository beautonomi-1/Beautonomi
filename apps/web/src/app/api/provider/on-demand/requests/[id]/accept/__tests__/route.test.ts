/**
 * On-demand accept API: 409 when request already handled or expired (0 rows updated).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient, MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetRequestNowAvailability = vi.fn();
const mockCreateBookingRecord = vi.fn();
const mockValidateBooking = vi.fn();
const release = vi.fn(async () => undefined);

vi.mock("@/lib/auth/requirePermission", () => ({
  requireAnyPermission: async () => ({
    authorized: true,
    user: { id: "provider-user", role: "provider_owner" },
  }),
}));

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: async () => false,
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: any[]) => mockRequireRoleInApi(...args),
  getProviderIdForUser: (...args: any[]) => mockGetProviderIdForUser(...args),
  successResponse: (data: any) => ({ ok: true, data }),
  errorResponse: (message: string, code: string, status: number) =>
    new Response(JSON.stringify({ data: null, error: { message, code } }), { status }),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: any[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/on-demand/request-now-availability", () => ({
  getRequestNowAvailability: (...args: unknown[]) => mockGetRequestNowAvailability(...args),
}));

vi.mock("@/app/api/public/bookings/_helpers/validate-booking", () => ({
  validateBooking: (...args: unknown[]) => mockValidateBooking(...args),
}));
vi.mock("@/app/api/public/bookings/_helpers/create-booking-record", () => ({
  createBookingRecord: (...args: unknown[]) => mockCreateBookingRecord(...args),
}));
vi.mock("@/app/api/public/bookings/_helpers/release-booking-slot-after-payment-failure", () => ({
  releaseBookingSlotAfterPaymentFailure: (...args: unknown[]) => release(...args),
}));

describe("POST /api/provider/on-demand/requests/[id]/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.provider_owner });
    mockGetProviderIdForUser.mockResolvedValue("provider-id-123");
    mockGetRequestNowAvailability.mockResolvedValue({ enabled: true, providerAcceptWindowSeconds: 30 });
    release.mockClear();
    mockCreateBookingRecord.mockReset();
    mockValidateBooking.mockReset();
  });

  it("returns 409 when select returns no row (already handled or expired)", async () => {
    const supabase = createMockSupabaseClient();
    supabase.from.mockImplementation((table: string) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data:
            table === "provider_online_booking_settings"
              ? { on_demand_accept_enabled: true }
              : table === "providers"
                ? { tenant_id: "tenant-1" }
                : null,
          error: null,
        }),
      };
      return chain;
    });
    mockGetSupabaseServer.mockResolvedValue(supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/on-demand/requests/req-123/accept", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "req-123" }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error?.code).toBe("ALREADY_HANDLED_OR_EXPIRED");
    expect(body.data).toBeNull();
  });

  it("returns the prepaid session when the accept loses the race", async () => {
    const supabase = createMockSupabaseClient();
    supabase.from.mockImplementation((table: string) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data:
            table === "provider_online_booking_settings"
              ? { on_demand_accept_enabled: true }
              : table === "providers"
                ? { tenant_id: "tenant-1" }
                : table === "on_demand_requests"
                  ? {
                      id: "req-123",
                      customer_id: "cust-1",
                      provider_id: "provider-id-123",
                      request_payload: { services: [{ offering_id: "cut" }] },
                    }
                  : null,
          error: null,
        }),
      };
      return chain;
    });
    mockGetSupabaseServer.mockResolvedValue(supabase);
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                gt: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never);
    mockValidateBooking.mockResolvedValue({ customerId: "cust-1" });
    mockCreateBookingRecord.mockResolvedValue({
      booking: { id: "booking-1" },
      createdBookingServices: [],
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/on-demand/requests/req-123/accept", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "req-123" }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error?.code).toBe("ALREADY_HANDLED_OR_EXPIRED");
    expect(release).toHaveBeenCalledWith(
      expect.anything(),
      "booking-1",
      "cust-1",
      "On-demand request expired or already handled",
    );
  });
});
