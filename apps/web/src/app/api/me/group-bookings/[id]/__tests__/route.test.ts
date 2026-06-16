import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const GROUP_ID = "11111111-1111-1111-1111-111111111111";
const USER_MOTHER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_DAUGHTER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const mockRequireAuthInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAuthInApi: (...args: unknown[]) => mockRequireAuthInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

function buildSupabaseMock(groupDetail: Record<string, unknown> | null) {
  const existenceResult = Promise.resolve({
    data: groupDetail ? { id: GROUP_ID } : null,
    error: null,
  });
  const detailResult = Promise.resolve({ data: groupDetail, error: null });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table !== "group_bookings") throw new Error(`unexpected table ${table}`);
    return {
      select: vi.fn().mockImplementation((selectArg: string) => {
        const isExistence = selectArg.trim() === "id";
        return {
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockImplementation(() => (isExistence ? existenceResult : detailResult)),
          }),
        };
      }),
    };
  });

  return { from };
}

describe("GET /api/me/group-bookings/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthInApi.mockResolvedValue({ user: { id: USER_MOTHER } });
  });

  it("returns group payment rollup and payer attribution for the organiser", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      buildSupabaseMock({
        id: GROUP_ID,
        ref_number: "GRP-001",
        title: "Mother & daughter",
        status: "confirmed",
        scheduled_at: "2026-06-20T10:00:00.000Z",
        total_price: 600,
        travel_fee: 0,
        location_type: "at_salon",
        booking_participants: [
          {
            id: "p1",
            booking_id: "b1",
            customer_id: USER_MOTHER,
            participant_name: "Jane Doe",
            is_primary_contact: true,
            service_name: "Cut",
            price: 300,
            addons: [],
          },
          {
            id: "p2",
            booking_id: "b2",
            customer_id: USER_DAUGHTER,
            participant_name: "Emily Doe",
            is_primary_contact: false,
            service_name: "Trim",
            price: 300,
            addons: [],
          },
        ],
        bookings: [
          {
            id: "b1",
            booking_number: "1001",
            customer_id: USER_MOTHER,
            group_booking_id: GROUP_ID,
            status: "confirmed",
            total_amount: 300,
            total_paid: 300,
            total_refunded: 0,
            wallet_amount: 0,
            gift_card_amount: 0,
            tip_amount: 0,
            currency: "ZAR",
            payment_status: "paid",
            additional_charges: [],
          },
          {
            id: "b2",
            booking_number: "1002",
            customer_id: USER_DAUGHTER,
            group_booking_id: GROUP_ID,
            status: "confirmed",
            total_amount: 300,
            total_paid: 300,
            total_refunded: 0,
            wallet_amount: 0,
            gift_card_amount: 0,
            tip_amount: 0,
            currency: "ZAR",
            payment_status: "paid",
            additional_charges: [],
          },
        ],
      }),
    );

    const { GET } = await import("../route");
    const req = new NextRequest(`http://localhost/api/me/group-bookings/${GROUP_ID}`);
    const res = await GET(req, { params: Promise.resolve({ id: GROUP_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.payment_status).toBe("paid");
    expect(body.data.amount_paid).toBe(600);
    expect(body.data.balance_due).toBe(0);
    expect(body.data.total_price).toBe(600);
    expect(body.data.currency).toBe("ZAR");
    expect(body.data.paid_by).toBe("Jane Doe");
    expect(body.data.is_primary_payer).toBe(true);
    expect(body.data.participants).toHaveLength(2);
  });

  it("returns 404 when the user is not a participant", async () => {
    mockRequireAuthInApi.mockResolvedValue({ user: { id: "cccccccc-cccc-cccc-cccc-cccccccccccc" } });
    mockGetSupabaseAdmin.mockReturnValue(
      buildSupabaseMock({
        id: GROUP_ID,
        ref_number: "GRP-002",
        title: "Group",
        status: "confirmed",
        scheduled_at: "2026-06-20T10:00:00.000Z",
        total_price: 200,
        booking_participants: [
          {
            id: "p1",
            booking_id: "b1",
            customer_id: USER_MOTHER,
            participant_name: "Jane",
            is_primary_contact: true,
            service_name: "Cut",
            price: 200,
            addons: [],
          },
        ],
        bookings: [
          {
            id: "b1",
            customer_id: USER_MOTHER,
            group_booking_id: GROUP_ID,
            status: "confirmed",
            total_amount: 200,
            total_paid: 200,
            total_refunded: 0,
            wallet_amount: 0,
            gift_card_amount: 0,
            payment_status: "paid",
            additional_charges: [],
          },
        ],
      }),
    );

    const { GET } = await import("../route");
    const req = new NextRequest(`http://localhost/api/me/group-bookings/${GROUP_ID}`);
    const res = await GET(req, { params: Promise.resolve({ id: GROUP_ID }) });
    expect(res.status).toBe(404);
  });
});
