import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const PROVIDER_ID = "44444444-4444-4444-8444-444444444444";

const mockGetSupabaseAdmin = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockRequirePermission = vi.fn();
const groupDeleteEq = vi.fn();

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

function makeBookings(overrides: Record<string, unknown>[] = []) {
  const base = [
    {
      id: B1,
      customer_id: "c1",
      provider_id: PROVIDER_ID,
      scheduled_at: "2026-06-01T10:00:00.000Z",
      booking_number: "1001",
      customer_name: "Alex",
      customer_email: "a@test.com",
      customer_phone: "+27111111111",
      service_id: null,
      service_name: "Cut",
      group_booking_id: null,
      package_id: null,
    },
    {
      id: B2,
      customer_id: "c2",
      provider_id: PROVIDER_ID,
      scheduled_at: "2026-06-01T10:00:00.000Z",
      booking_number: "1002",
      customer_name: "Blake",
      customer_email: "b@test.com",
      customer_phone: "+27222222222",
      service_id: null,
      service_name: "Trim",
      group_booking_id: null,
      package_id: null,
    },
  ];
  return base.map((row, i) => ({ ...row, ...(overrides[i] ?? {}) }));
}

function buildAdmin(options: {
  bookings: ReturnType<typeof makeBookings>;
  participantInsertError?: { message: string } | null;
}) {
  groupDeleteEq.mockResolvedValue({ error: null });

  const admin = {
    rpc: vi.fn().mockResolvedValue({ data: "GB-TEST-001", error: null }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: options.bookings, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      if (table === "group_bookings") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: GROUP_ID,
                  provider_id: PROVIDER_ID,
                  ref_number: "GB-TEST-001",
                  scheduled_at: options.bookings[0]?.scheduled_at,
                  status: "confirmed",
                },
                error: null,
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({ eq: groupDeleteEq }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: GROUP_ID, booking_participants: [] },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "booking_participants") {
        return {
          insert: vi.fn().mockResolvedValue({
            error: options.participantInsertError ?? null,
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return admin;
}

describe("POST /api/provider/group-bookings/from-bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
    mockGetSupabaseServer.mockResolvedValue({});
  });

  it("returns 409 when a booking is already in a group", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      buildAdmin({
        bookings: makeBookings([{ group_booking_id: "existing-group" }, {}]),
      })
    );

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/group-bookings/from-bookings", {
        method: "POST",
        body: JSON.stringify({ booking_ids: [B1, B2] }),
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error?.code ?? body.code).toBe("CONFLICT");
  });

  it("returns TIME_DIVERGENCE warning when schedules differ by more than 30 minutes", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      buildAdmin({
        bookings: makeBookings([
          {},
          { scheduled_at: "2026-06-01T12:00:00.000Z" },
        ]),
      })
    );

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/group-bookings/from-bookings", {
        method: "POST",
        body: JSON.stringify({ booking_ids: [B1, B2] }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.warnings?.[0]?.code).toBe("TIME_DIVERGENCE");
  });

  it("rolls back the group row when participant insert fails", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      buildAdmin({
        bookings: makeBookings(),
        participantInsertError: { message: "insert failed" },
      })
    );

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/group-bookings/from-bookings", {
        method: "POST",
        body: JSON.stringify({ booking_ids: [B1, B2] }),
      })
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(groupDeleteEq).toHaveBeenCalledWith("id", GROUP_ID);
  });
});
