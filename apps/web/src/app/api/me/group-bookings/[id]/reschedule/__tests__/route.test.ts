import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BOOKING_ID = "11111111-1111-4111-8111-111111111111";

const mockRequireAuthInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockGetGroupBooking = vi.fn();
const mockIsPrimaryContact = vi.fn();
const mockRescheduleGroupBooking = vi.fn();
const mockEvaluateProviderSlotAgainstGrid = vi.fn();
const mockSendRescheduleNotification = vi.fn();

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

vi.mock("@/lib/bookings/group-booking", () => ({
  getGroupBooking: (...args: unknown[]) => mockGetGroupBooking(...args),
  isPrimaryContact: (...args: unknown[]) => mockIsPrimaryContact(...args),
  rescheduleGroupBooking: (...args: unknown[]) => mockRescheduleGroupBooking(...args),
}));

vi.mock("@/lib/provider-booking/compute-provider-slot-grid", () => ({
  evaluateProviderSlotAgainstGrid: (...args: unknown[]) =>
    mockEvaluateProviderSlotAgainstGrid(...args),
}));

vi.mock("@/lib/bookings/notifications", () => ({
  sendRescheduleNotification: (...args: unknown[]) => mockSendRescheduleNotification(...args),
}));

describe("POST /api/me/group-bookings/[id]/reschedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthInApi.mockResolvedValue({ user: { id: USER_ID } });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    mockGetSupabaseServer.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });
    mockRescheduleGroupBooking.mockResolvedValue(undefined);
    mockSendRescheduleNotification.mockResolvedValue(undefined);
    mockEvaluateProviderSlotAgainstGrid.mockResolvedValue({ ok: true, conflicts: [] });
  });

  it("returns 403 when caller is not the primary contact", async () => {
    mockGetGroupBooking.mockResolvedValue({
      id: GROUP_ID,
      scheduled_at: "2026-06-01T10:00:00.000Z",
      provider_id: "prov-1",
      bookings: [],
    });
    mockIsPrimaryContact.mockResolvedValue(false);

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest(`http://localhost/api/me/group-bookings/${GROUP_ID}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ new_datetime: "2026-06-02T10:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: GROUP_ID }) }
    );

    expect(res.status).toBe(403);
    expect(mockRescheduleGroupBooking).not.toHaveBeenCalled();
  });

  it("reschedules group, writes booking_events, and notifies when primary contact", async () => {
    mockGetGroupBooking.mockResolvedValue({
      id: GROUP_ID,
      scheduled_at: "2026-06-01T10:00:00.000Z",
      provider_id: "prov-1",
      bookings: [
        {
          id: BOOKING_ID,
          scheduled_at: "2026-06-01T10:00:00.000Z",
          location_type: "at_salon",
          location_id: "loc-1",
        },
      ],
    });
    mockIsPrimaryContact.mockResolvedValue(true);

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest(`http://localhost/api/me/group-bookings/${GROUP_ID}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ new_datetime: "2026-06-02T10:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: GROUP_ID }) }
    );

    expect(res.status).toBe(200);
    expect(mockEvaluateProviderSlotAgainstGrid).toHaveBeenCalled();
    expect(mockRescheduleGroupBooking).toHaveBeenCalledWith(
      mockGetSupabaseAdmin(),
      GROUP_ID,
      expect.any(Date)
    );
    expect(mockSendRescheduleNotification).toHaveBeenCalledWith(
      BOOKING_ID,
      expect.any(Date),
      expect.any(Date)
    );
  });
});
