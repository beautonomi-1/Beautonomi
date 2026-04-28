/**
 * Contract: missing/invalid `date` must return structured `VALIDATION_ERROR` (400),
 * not INTERNAL_ERROR, so clients can branch on `error.code`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockComputeProviderBookingSlotGrid = vi.fn();

vi.mock("@/lib/provider-booking/compute-provider-slot-grid", () => ({
  computeProviderBookingSlotGrid: (...args: unknown[]) => mockComputeProviderBookingSlotGrid(...args),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}));

describe("GET /api/provider/bookings/available-slots (contract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockComputeProviderBookingSlotGrid.mockResolvedValue({
      providerTimeZone: "Africa/Johannesburg",
      slotGrid: [
        { time: "09:00", available: true },
        { time: "09:15", available: false, reason: "busy" },
      ],
      maxAdvanceExceeded: false,
    });
  });

  it("returns 400 with code VALIDATION_ERROR when date is missing", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/bookings/available-slots?duration_minutes=60");
    const res = await GET(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.data).toBeNull();
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(String(body.error?.message)).toMatch(/date is required/i);
    expect(mockComputeProviderBookingSlotGrid).not.toHaveBeenCalled();
  });

  it("returns 400 with code VALIDATION_ERROR when date is not YYYY-MM-DD", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost/api/provider/bookings/available-slots?date=27-04-2026&duration_minutes=60",
    );
    const res = await GET(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(mockComputeProviderBookingSlotGrid).not.toHaveBeenCalled();
  });

  it("returns 200 with slots and slot_grid when date is valid", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost/api/provider/bookings/available-slots?date=2026-04-27&duration_minutes=60",
    );
    const res = await GET(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data?.date).toBe("2026-04-27");
    expect(body.data?.slots).toEqual(["09:00"]);
    expect(body.data?.slot_grid?.length).toBe(2);
    expect(body.data?.provider_timezone).toBe("Africa/Johannesburg");
  });
});
