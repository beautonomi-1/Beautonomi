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
const mockCancelGroupBooking = vi.fn();

const pendingAfter: Array<Promise<unknown>> = [];

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      pendingAfter.push(Promise.resolve().then(task));
    },
  };
});

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

vi.mock("@/lib/bookings/group-booking-cancellation", () => ({
  cancelGroupBooking: (...args: unknown[]) => mockCancelGroupBooking(...args),
}));

describe("DELETE /api/provider/group-bookings/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingAfter.length = 0;
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
    mockGetSupabaseServer.mockResolvedValue({});
    mockSendCancellationNotification.mockResolvedValue(undefined);
    mockCancelGroupBooking.mockResolvedValue([
      { bookingId: B1, walletRefund: 50, inPersonRefundDue: 0 },
      { bookingId: B2, walletRefund: 0, inPersonRefundDue: 120 },
    ]);

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
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    });
  });

  it("settles finance via cancelGroupBooking and notifies each cancelled child", async () => {
    const { DELETE } = await import("../route");
    const res = await DELETE(
      new NextRequest(`http://localhost/api/provider/group-bookings/${GROUP_ID}`, {
        method: "DELETE",
        body: JSON.stringify({ cancellation_reason: "Provider cancelled session" }),
      }),
      { params: Promise.resolve({ id: GROUP_ID }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data?.children).toHaveLength(2);
    expect(mockCancelGroupBooking).toHaveBeenCalledWith(
      expect.anything(),
      GROUP_ID,
      "user-1",
      "Provider cancelled session",
      { settleFinance: true, financeActor: "provider" },
    );
    await Promise.all(pendingAfter);
    expect(mockSendCancellationNotification).toHaveBeenCalledTimes(2);
    expect(mockSendCancellationNotification).toHaveBeenCalledWith(B1, { cancelledBy: "provider" });
    expect(mockSendCancellationNotification).toHaveBeenCalledWith(B2, { cancelledBy: "provider" });
  });
});
