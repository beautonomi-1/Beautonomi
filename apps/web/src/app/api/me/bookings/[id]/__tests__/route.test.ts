import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROVIDER_ID = "33333333-3333-4333-8333-333333333333";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

function buildBookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    customer_id: USER_ID,
    provider_id: PROVIDER_ID,
    booking_number: "1001",
    status: "confirmed",
    payment_status: "paid",
    scheduled_at: "2026-06-20T10:00:00.000Z",
    location_type: "at_salon",
    total_amount: 300,
    currency: "ZAR",
    total_paid: 300,
    group_booking_id: GROUP_ID,
    group_bookings: { ref_number: "GRP-001" },
    booking_services: [],
    booking_addons: [],
    booking_products: [],
    additional_charges: [],
    provider: { id: PROVIDER_ID, business_name: "Test Salon" },
    ...overrides,
  };
}

function buildSupabaseMock(booking: Record<string, unknown> | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: booking,
            error: booking ? null : { message: "not found" },
          }),
        }),
      }),
    }),
  };
}

describe("GET /api/me/bookings/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: {
        id: USER_ID,
        email: "user@test.com",
        user_metadata: {},
      },
    });
  });

  it("returns group_booking_id for group child bookings", async () => {
    mockGetSupabaseAdmin.mockReturnValue(buildSupabaseMock(buildBookingRow()));

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/me/bookings/" + BOOKING_ID), {
      params: Promise.resolve({ id: BOOKING_ID }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.is_group_booking).toBe(true);
    expect(json.data.group_booking_id).toBe(GROUP_ID);
    expect(json.data.group_booking_ref).toBe("GRP-001");
  });
});
