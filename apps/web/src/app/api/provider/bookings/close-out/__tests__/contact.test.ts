import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockHasPermission = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: async () => "prov-1",
  };
});

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    hasPermission: (...args: unknown[]) => mockHasPermission(...args),
  };
});

vi.mock("@/lib/auth/calendar-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/calendar-scope")>();
  return {
    ...actual,
    getCalendarScopeForUser: async () => ({ scope: "all", staffId: null, isOwner: false }),
  };
});

const bookingRow = {
  id: "b1",
  booking_number: "B1",
  scheduled_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  status: "in_progress",
  location_type: "at_salon",
  current_stage: null,
  customer_id: "c1",
  customer: { id: "c1", full_name: "Ada", phone: "0820000000" },
  booking_services: [
    {
      duration_minutes: 30,
      staff_id: "s1",
      offerings: { title: "Cut", duration_minutes: 30 },
    },
  ],
};

const chain: Record<string, unknown> = {};
for (const method of ["select", "eq", "in", "gte", "order", "limit", "or"]) {
  chain[method] = () => chain;
}
chain.maybeSingle = async () => ({ data: null, error: null });
chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
  Promise.resolve({ data: [bookingRow], error: null }).then(resolve, reject);

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => chain,
  }),
}));

describe("GET /api/provider/bookings/close-out contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "staff-1", role: "provider_staff" },
    });
  });

  it("drops the customer phone unless the viewer has view_clients", async () => {
    mockHasPermission.mockResolvedValue(false);
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/bookings/close-out"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.bookings[0].customer.full_name).toBe("Ada");
    expect(body.data.bookings[0].customer.phone).toBeNull();
    expect(bookingRow.customer.phone).toBe("0820000000");
  });

  it("keeps the customer phone for a viewer with view_clients", async () => {
    mockHasPermission.mockResolvedValue(true);
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/bookings/close-out"));
    const body = await res.json();
    expect(body.data.bookings[0].customer.phone).toBe("0820000000");
  });
});
