import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const PROVIDER_ID = "44444444-4444-4444-8444-444444444444";
const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";

const mockGetSupabaseAdmin = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockRequirePermission = vi.fn();
const mockSendCancellationNotification = vi.fn();
const mockMatchWaitlistOnCancellation = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireAnyPermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/bookings/notifications", () => ({
  sendCancellationNotification: (...args: unknown[]) => mockSendCancellationNotification(...args),
}));

vi.mock("@/lib/waitlist/matching", () => ({
  matchWaitlistOnCancellation: (...args: unknown[]) => mockMatchWaitlistOnCancellation(...args),
}));

describe("DELETE /api/provider/group-bookings/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
    mockGetSupabaseServer.mockResolvedValue({});
    mockSendCancellationNotification.mockResolvedValue(undefined);
    mockMatchWaitlistOnCancellation.mockResolvedValue(undefined);

    const bookingsCancelChain = {
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ error: null }),
    };

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "group_bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: GROUP_ID, status: "confirmed" },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          };
        }
        if (table === "bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  not: vi.fn().mockResolvedValue({
                    data: [{ id: B1 }, { id: B2 }],
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue(bookingsCancelChain),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    });
  });

  it("cancels child bookings by group_booking_id and notifies each customer", async () => {
    const { DELETE } = await import("../route");
    const res = await DELETE(
      new NextRequest(`http://localhost/api/provider/group-bookings/${GROUP_ID}`, {
        method: "DELETE",
        body: JSON.stringify({ cancellation_reason: "Provider cancelled session" }),
      }),
      { params: Promise.resolve({ id: GROUP_ID }) }
    );

    expect(res.status).toBe(200);
    expect(mockSendCancellationNotification).toHaveBeenCalledTimes(2);
    expect(mockSendCancellationNotification).toHaveBeenCalledWith(B1, { cancelledBy: "provider" });
    expect(mockSendCancellationNotification).toHaveBeenCalledWith(B2, { cancelledBy: "provider" });
    expect(mockMatchWaitlistOnCancellation).toHaveBeenCalledTimes(2);
  });
});
