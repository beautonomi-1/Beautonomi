import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const mockRequireAuthInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockExecuteReschedule = vi.fn();
const mockTrackServer = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAuthInApi: (...args: unknown[]) => mockRequireAuthInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/bookings/reschedule-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bookings/reschedule-core")>();
  return {
    ...actual,
    executeReschedule: (...args: unknown[]) => mockExecuteReschedule(...args),
  };
});

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: (...args: unknown[]) => mockTrackServer(...args),
}));

vi.mock("@/lib/bookings/notifications", () => ({
  sendRescheduleNotification: vi.fn(),
}));

describe("POST /api/me/bookings/[id]/reschedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthInApi.mockResolvedValue({ user: { id: USER_ID } });
    mockGetSupabaseServer.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: BOOKING_ID,
                customer_id: USER_ID,
                scheduled_at: "2026-06-01T10:00:00.000Z",
                provider_id: "prov-1",
                group_booking_id: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    mockGetSupabaseAdmin.mockReturnValue({});
  });

  it("returns 403 when executeReschedule is blocked", async () => {
    mockExecuteReschedule.mockResolvedValue({
      ok: false,
      error: {
        kind: "RESCHEDULE_BLOCKED",
        message: "Changes must be made at least 24 hours before the appointment. Please contact the provider.",
        code: "CUSTOMER_RESCHEDULE_CUTOFF",
      },
    });

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest(`http://localhost/api/me/bookings/${BOOKING_ID}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ new_datetime: "2026-06-02T10:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: BOOKING_ID }) },
    );

    expect(res.status).toBe(403);
    expect(mockTrackServer).not.toHaveBeenCalled();
  });

  it("returns 403 when customer does not own the booking", async () => {
    mockGetSupabaseServer.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: BOOKING_ID,
                customer_id: "other-user",
                scheduled_at: "2026-06-01T10:00:00.000Z",
                provider_id: "prov-1",
                group_booking_id: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest(`http://localhost/api/me/bookings/${BOOKING_ID}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ new_datetime: "2026-06-02T10:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: BOOKING_ID }) },
    );

    expect(res.status).toBe(403);
    expect(mockExecuteReschedule).not.toHaveBeenCalled();
  });
});