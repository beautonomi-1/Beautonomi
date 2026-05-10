import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../bulk/route";

const updateMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: vi.fn(async () => ({ user: { id: "provider-user-1" } })),
  getProviderIdForUser: vi.fn(async () => "provider-1"),
  successResponse: vi.fn((data) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ),
  errorResponse: vi.fn((message, _code, status = 400) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ),
  handleApiError: vi.fn((error) =>
    new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
  ),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

function createServerClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: { tenant_id: "tenant-1" }, error: null })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: { full_name: "Provider User" }, error: null })),
      };
    }),
  };
}

function createAdminClient(bookings: Array<Record<string, unknown>>) {
  updateMock.mockReset();
  const bookingQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn(async () => ({ data: bookings, error: null })),
    update: updateMock.mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      select: vi.fn(async () => ({ data: [{ id: bookings[0]?.id }], error: null })),
    }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "bookings") return bookingQuery;
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: { full_name: "Provider User" }, error: null })),
        insert: vi.fn(async () => ({ data: null, error: null })),
      };
    }),
    rpc: vi.fn(),
  };
}

function bulkRequest(body: Record<string, unknown>) {
  return new Request("https://example.test/api/provider/bookings/bulk", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

describe("POST /api/provider/bookings/bulk transition gating", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue(createServerClient() as never);
  });

  it("rejects invalid bulk transitions before updating rows", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      createAdminClient([
        {
          id: "booking-1",
          status: "pending_payment",
          payment_status: "pending",
          version: 0,
        },
      ]) as never,
    );

    const response = await POST(bulkRequest({ action: "confirm", booking_ids: ["booking-1"] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.failed_count).toBe(1);
    expect(body.results.failed[0].reason).toContain("waiting for payment verification");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows valid bulk transitions", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      createAdminClient([
        {
          id: "booking-2",
          status: "pending",
          payment_status: "paid",
          version: 3,
        },
      ]) as never,
    );

    const response = await POST(bulkRequest({ action: "confirm", booking_ids: ["booking-2"] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success_count).toBe(1);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "confirmed",
        version: 4,
      }),
    );
  });
});
