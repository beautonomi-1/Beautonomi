import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const PROVIDER_ID = "44444444-4444-4444-8444-444444444444";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const CHILD_B1 = "11111111-1111-4111-8111-111111111111";
const CHILD_B2 = "22222222-2222-4222-8222-222222222222";

const mockGetSupabaseAdmin = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockRequirePermission = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockGetTenantRegionConfig = vi.fn();
const mockValidateAndPriceGroupPackage = vi.fn();
const mockCreateGroupParticipantChildBooking = vi.fn();

const capturedParticipantRows: Record<string, unknown>[] = [];
const groupDeleteEq = vi.fn();
let participantInsertError: { message: string; code?: string } | null = null;

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
  requireAnyPermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: (...args: unknown[]) => mockGetTenantRegionConfig(...args),
}));

vi.mock("@/lib/bookings/group-booking-package-pricing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bookings/group-booking-package-pricing")>();
  return {
    ...actual,
    validateAndPriceGroupPackage: (...args: unknown[]) => mockValidateAndPriceGroupPackage(...args),
  };
});

vi.mock("@/lib/bookings/create-group-participant-booking", () => ({
  createGroupParticipantChildBooking: (...args: unknown[]) =>
    mockCreateGroupParticipantChildBooking(...args),
  notifyGroupParticipantBooking: vi.fn(),
}));

function buildCreateAdmin() {
  groupDeleteEq.mockResolvedValue({ error: null });
  const groupUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const bookingsUpdateIn = vi.fn().mockResolvedValue({ error: null });

  return {
    rpc: vi.fn().mockResolvedValue({ data: "GB-TEST-CREATE", error: null }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "group_bookings") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: GROUP_ID,
                  provider_id: PROVIDER_ID,
                  ref_number: "GB-TEST-CREATE",
                  scheduled_at: "2026-06-01T10:00:00.000Z",
                  status: "confirmed",
                  total_price: 250,
                  booking_participants: [],
                },
                error: null,
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({ eq: groupDeleteEq }),
          update: vi.fn().mockReturnValue({ eq: groupUpdateEq }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: GROUP_ID,
                  ref_number: "GB-TEST-CREATE",
                  status: "confirmed",
                  total_price: 250,
                  scheduled_at: "2026-06-01T10:00:00.000Z",
                  booking_participants: capturedParticipantRows,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "booking_participants") {
        return {
          insert: vi.fn().mockImplementation((rows: Record<string, unknown>[]) => {
            capturedParticipantRows.splice(0, capturedParticipantRows.length, ...rows);
            return Promise.resolve({ error: participantInsertError });
          }),
        };
      }
      if (table === "bookings") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ in: bookingsUpdateIn }),
          }),
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("POST /api/provider/group-bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    participantInsertError = null;
    capturedParticipantRows.length = 0;
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
    mockGetSupabaseServer.mockResolvedValue({});
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-1");
    mockGetTenantRegionConfig.mockResolvedValue({ defaultCurrency: "ZAR" });
    mockValidateAndPriceGroupPackage.mockResolvedValue({ ok: true, packageDiscount: 0 });
    mockCreateGroupParticipantChildBooking
      .mockResolvedValueOnce({ bookingId: CHILD_B1 })
      .mockResolvedValueOnce({ bookingId: CHILD_B2 });
    mockGetSupabaseAdmin.mockReturnValue(buildCreateAdmin());
  });

  it("returns VALIDATION_ERROR when scheduled_at is missing", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/group-bookings", {
        method: "POST",
        body: JSON.stringify({ title: "Bridal party" }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code ?? body.code).toBe("VALIDATION_ERROR");
  });

  it("returns GROUP_CAPACITY_EXCEEDED when participants exceed max_participants", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/group-bookings", {
        method: "POST",
        body: JSON.stringify({
          scheduled_at: "2026-06-01T10:00:00.000Z",
          max_participants: 2,
          participants: [
            { participant_name: "A", price: 100 },
            { participant_name: "B", price: 100 },
            { participant_name: "C", price: 100 },
          ],
        }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code ?? body.code).toBe("GROUP_CAPACITY_EXCEEDED");
  });

  it("creates confirmed group with participants, child bookings, and primary contact link", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/group-bookings", {
        method: "POST",
        body: JSON.stringify({
          scheduled_at: "2026-06-01T10:00:00.000Z",
          allow_override: true,
          service_id: "svc-1",
          send_notification: false,
          participants: [
            { participant_name: "Alice", price: 100, customer_id: "cust-a" },
            {
              participant_name: "Bob",
              price: 150,
              customer_id: "cust-b",
              is_primary_contact: true,
            },
          ],
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data?.ref_number ?? body.ref_number).toBe("GB-TEST-CREATE");
    expect(body.data?.status ?? body.status).toBe("confirmed");
    expect(mockCreateGroupParticipantChildBooking).toHaveBeenCalledTimes(2);

    const primaryRows = capturedParticipantRows.filter((p) => p.is_primary_contact === true);
    expect(primaryRows).toHaveLength(1);
    expect(primaryRows[0]?.participant_name).toBe("Bob");
    expect(primaryRows[0]?.booking_id).toBe(CHILD_B2);
  });

  it("rolls back group and returns PARTICIPANT_DB_ERROR when participant insert fails", async () => {
    participantInsertError = { message: "duplicate key", code: "23505" };
    mockCreateGroupParticipantChildBooking.mockReset();
    mockCreateGroupParticipantChildBooking.mockResolvedValue({ bookingId: CHILD_B1 });

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/group-bookings", {
        method: "POST",
        body: JSON.stringify({
          scheduled_at: "2026-06-01T10:00:00.000Z",
          allow_override: true,
          service_id: "svc-1",
          send_notification: false,
          participants: [{ participant_name: "Alice", price: 100, customer_id: "cust-a" }],
        }),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code ?? body.code).toBe("PARTICIPANT_UNIQUE_VIOLATION");
    expect(groupDeleteEq).toHaveBeenCalledWith("id", GROUP_ID);
  });
});
