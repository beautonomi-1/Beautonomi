/**
 * Ensures provider group detail exposes per-participant booking_status from child rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const PROVIDER_ID = "44444444-4444-4444-8444-444444444444";
const PARTICIPANT_ID = "55555555-5555-4555-8555-555555555555";
const BOOKING_ID = "66666666-6666-4666-8666-666666666666";

const mockGetSupabaseAdmin = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockRequirePermission = vi.fn();

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
}));

describe("GET /api/provider/group-bookings/[id] participant booking_status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
    mockGetSupabaseServer.mockResolvedValue({});

    const groupRow = {
      id: GROUP_ID,
      provider_id: PROVIDER_ID,
      status: "confirmed",
      scheduled_at: "2026-06-01T10:00:00.000Z",
      total_price: 100,
      location_type: "at_salon",
      products: [],
      service_packages: null,
      booking_participants: [
        {
          id: PARTICIPANT_ID,
          booking_id: BOOKING_ID,
          participant_name: "Alex",
          participant_email: null,
          participant_phone: null,
          is_primary_contact: true,
          service_id: "svc-1",
          service_name: "Cut",
          price: 100,
          duration_minutes: 30,
          addons: [],
          notes: null,
          checked_in_at: null,
          checked_out_at: null,
        },
      ],
      bookings: [
        {
          id: BOOKING_ID,
          booking_number: "1001",
          ref_number: "REF-1",
          status: "cancelled",
          scheduled_at: "2026-06-01T10:00:00.000Z",
          total_amount: 100,
          total_paid: 0,
          total_refunded: 0,
          wallet_amount: 0,
          gift_card_amount: 0,
          payment_status: "pending",
          tip_amount: 0,
          additional_charges: [],
        },
      ],
    };

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table !== "group_bookings") throw new Error(`unexpected table ${table}`);
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: GROUP_ID }, error: null }),
                single: vi.fn().mockResolvedValue({ data: groupRow, error: null }),
              }),
            }),
          }),
        };
      }),
    });
  });

  it(
    "includes booking_status on each participant from the linked booking row",
    async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(`http://localhost/api/provider/group-bookings/${GROUP_ID}`);
    const res = await GET(req, { params: Promise.resolve({ id: GROUP_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.participants).toHaveLength(1);
    expect(body.data.participants[0].booking_status).toBe("cancelled");
    },
    90_000,
  );
});
