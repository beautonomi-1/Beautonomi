import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "@/__tests__/helpers/mock-supabase";
import { GET } from "../route";

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/api-helpers")>(
    "@/lib/supabase/api-helpers",
  );
  return {
    ...actual,
    getProviderIdForUser: vi.fn(),
  };
});

const owner = MOCK_USERS.provider_owner;

function createAwaitableChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, any> = {
    data: result.data,
    error: result.error,
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)),
  };
  return chain;
}

describe("GET /api/provider/waiting-room", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requirePermission } = await import("@/lib/auth/requirePermission");
    const { getProviderIdForUser } = await import("@/lib/supabase/api-helpers");
    vi.mocked(requirePermission).mockResolvedValue({ authorized: true, user: owner } as any);
    vi.mocked(getProviderIdForUser).mockResolvedValue("provider-1");
  });

  it("returns checked-in bookings mapped to waiting-room entries and staff names", async () => {
    const bookingChain = createAwaitableChain({
      data: [
        {
          id: "booking-1",
          booking_number: "B-1",
          scheduled_at: "2026-05-01T09:00:00.000Z",
          checked_in_time: "2026-05-01T08:55:00.000Z",
          status: "checked_in",
          notes: "Window seat",
          special_requests: null,
          is_group_booking: true,
          group_booking_id: "group-1",
          customers: {
            full_name: "Ada Lovelace",
            email: "ada@example.com",
            phone: "+27123456789",
          },
          booking_services: [
            {
              offering_id: "service-1",
              staff_id: "staff-1",
              scheduled_start_at: "2026-05-01T09:00:00.000Z",
              guest_name: null,
              offering: { title: "Cut" },
              staff: { id: "staff-1", name: "Grace" },
            },
          ],
        },
      ],
      error: null,
    });
    const supabase = {
      from: vi.fn(() => bookingChain),
    };
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as any);

    const response = await GET(
      createMockNextRequest({
        url: "http://localhost/api/provider/waiting-room",
        searchParams: { location_id: "loc-1", status: "waiting" },
      }) as any,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject([
      {
        id: "booking-1",
        client_name: "Ada Lovelace",
        service_name: "Cut",
        team_member_name: "Grace",
        status: "waiting",
        is_group_booking: true,
        group_booking_id: "group-1",
      },
    ]);
    expect(bookingChain.eq).toHaveBeenCalledWith("provider_id", "provider-1");
    expect(bookingChain.eq).toHaveBeenCalledWith("location_id", "loc-1");
    expect(bookingChain.in).toHaveBeenCalledWith("status", ["waiting", "checked_in", "confirmed"]);
  });

  it("maps in-progress status filter to active service entries", async () => {
    const bookingChain = createAwaitableChain({
      data: [
        {
          id: "booking-2",
          scheduled_at: "2026-05-01T09:00:00.000Z",
          checked_in_time: "2026-05-01T08:55:00.000Z",
          status: "in_progress",
          notes: null,
          special_requests: null,
          is_group_booking: false,
          group_booking_id: null,
          customers: { full_name: "Client", email: null, phone: null },
          booking_services: [
            {
              offering_id: "off-1",
              staff_id: null,
              scheduled_start_at: "2026-05-01T09:00:00.000Z",
              guest_name: null,
              offering: { title: "Service" },
              staff: null,
            },
          ],
        },
      ],
      error: null,
    });
    const supabase = { from: vi.fn(() => bookingChain) };
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as any);

    const response = await GET(
      createMockNextRequest({
        url: "http://localhost/api/provider/waiting-room",
        searchParams: { status: "in_service" },
      }) as any,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0]).toMatchObject({ id: "booking-2", status: "in_service" });
    expect(bookingChain.eq).toHaveBeenCalledWith("status", "in_progress");
  });

  it("returns not found when the user is not linked to a provider", async () => {
    const { getProviderIdForUser } = await import("@/lib/supabase/api-helpers");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getProviderIdForUser).mockResolvedValue(null);
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn() } as any);

    const response = await GET(createMockNextRequest() as any);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error?.message).toBe("Provider not found");
  });
});
