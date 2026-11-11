import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockHasPermission = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    hasPermission: (...args: unknown[]) => mockHasPermission(...args),
  };
});

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: async () => "prov-1",
  };
});

const bookingRow = {
  id: "b1",
  status: "waiting",
  scheduled_at: "2026-11-10T10:00:00.000Z",
  checked_in_time: "2026-11-10T10:05:00.000Z",
  customers: { full_name: "Ada", email: "ada@example.com", phone: "0820000000" },
  booking_services: [{ offering: { title: "Cut" }, staff: { name: "Sam" } }],
};

const chain: Record<string, unknown> = {};
for (const method of ["select", "eq", "in", "not", "order", "update"]) {
  chain[method] = () => chain;
}
chain.single = async () => ({ data: bookingRow, error: null });

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => chain,
  }),
}));

describe("GET /api/provider/waiting-room/[id] contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "staff-1", role: "provider_staff" },
    });
  });

  it("drops the customer email and phone unless the viewer has view_clients", async () => {
    mockHasPermission.mockResolvedValue(false);
    const { GET } = await import("../[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/waiting-room/b1"), {
      params: Promise.resolve({ id: "b1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.client_name).toBe("Ada");
    expect(body.data.client_email).toBeNull();
    expect(body.data.client_phone).toBeNull();
    expect(bookingRow.customers.email).toBe("ada@example.com");
  });

  it("keeps the customer email and phone for a viewer with view_clients", async () => {
    mockHasPermission.mockResolvedValue(true);
    const { GET } = await import("../[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/waiting-room/b1"), {
      params: Promise.resolve({ id: "b1" }),
    });
    const body = await res.json();
    expect(body.data.client_email).toBe("ada@example.com");
    expect(body.data.client_phone).toBe("0820000000");
  });
});
