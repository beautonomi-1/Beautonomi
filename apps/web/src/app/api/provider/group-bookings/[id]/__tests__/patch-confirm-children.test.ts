import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const PROVIDER_ID = "44444444-4444-4444-8444-444444444444";
const PAID_PENDING = "11111111-1111-4111-8111-111111111111";
const UNPAID_PENDING = "22222222-2222-4222-8222-222222222222";

const mockGetSupabaseAdmin = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockRequirePermission = vi.fn();
const mockSyncGroupBookingStatusFromChildren = vi.fn();

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

vi.mock("@/lib/bookings/group-booking", () => ({
  syncGroupBookingStatusFromChildren: (...args: unknown[]) =>
    mockSyncGroupBookingStatusFromChildren(...args),
}));

describe("PATCH /api/provider/group-bookings/[id] confirm children", () => {
  const bookingUpdates: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    bookingUpdates.length = 0;
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
    mockGetSupabaseServer.mockResolvedValue({});
    mockSyncGroupBookingStatusFromChildren.mockResolvedValue("pending");

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "group_bookings") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: GROUP_ID, status: "confirmed", scheduled_at: "2026-06-01T10:00:00.000Z" },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: GROUP_ID }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockResolvedValue({
                    data: [
                      { id: PAID_PENDING, status: "pending_payment", payment_status: "paid" },
                      { id: UNPAID_PENDING, status: "pending_payment", payment_status: "pending" },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation(() => ({
              in: vi.fn().mockImplementation((_col: string, ids: string[]) => {
                bookingUpdates.push(...ids);
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                  }),
                };
              }),
            })),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    });
  });

  it(
    "confirms paid pending_payment children, skips unpaid, and returns synced group status",
    async () => {
    const { PATCH } = await import("../route");
    const req = new NextRequest(`http://localhost/api/provider/group-bookings/${GROUP_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: GROUP_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(bookingUpdates).toEqual([PAID_PENDING]);
    expect(body.data.status).toBe("pending");
    expect(body.data.skipped_unpaid_booking_ids).toEqual([UNPAID_PENDING]);
    expect(body.data.id).toBe(GROUP_ID);
    },
    90_000,
  );
});
