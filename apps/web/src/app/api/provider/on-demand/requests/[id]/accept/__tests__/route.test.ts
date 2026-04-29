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

vi.mock("@/app/api/public/bookings/_helpers/validate-booking", () => ({ validateBooking: vi.fn() }));
vi.mock("@/app/api/public/bookings/_helpers/create-booking-record", () => ({ createBookingRecord: vi.fn() }));

describe("POST /api/provider/on-demand/requests/[id]/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.provider_owner });
    mockGetProviderIdForUser.mockResolvedValue("provider-id-123");
    mockGetRequestNowAvailability.mockResolvedValue({ enabled: true, providerAcceptWindowSeconds: 30 });
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
});
