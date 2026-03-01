/**
 * On-demand accept API: 409 when request already handled or expired (0 rows updated).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient, MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  successResponse: (data: unknown) => ({ ok: true, data }),
  errorResponse: (message: string, code: string, status: number) =>
    new Response(JSON.stringify({ data: null, error: { message, code } }), { status }),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/app/api/public/bookings/_helpers/validate-booking", () => ({ validateBooking: vi.fn() }));
vi.mock("@/app/api/public/bookings/_helpers/create-booking-record", () => ({ createBookingRecord: vi.fn() }));

describe("POST /api/provider/on-demand/requests/[id]/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.provider_owner });
    mockGetProviderIdForUser.mockResolvedValue("provider-id-123");
  });

  it("returns 409 when update returns no row (already handled or expired)", async () => {
    const supabase = createMockSupabaseClient();
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    supabase.from.mockReturnValue(chain);
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
