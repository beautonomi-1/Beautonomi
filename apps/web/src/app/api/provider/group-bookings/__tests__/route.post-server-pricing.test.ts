import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * F4-04 — participant `price` and group `travel_fee` must be derived
 * server-side (offerings catalogue / provider travel settings), never taken
 * from the client payload.
 */

const PROVIDER_ID = "44444444-4444-4444-8444-444444444444";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const SVC_ID = "55555555-5555-4555-8555-555555555555";
const ADDON_ID = "66666666-6666-4666-8666-666666666666";
const CHILD_B1 = "11111111-1111-4111-8111-111111111111";

const mockGetSupabaseAdmin = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockRequirePermission = vi.fn();
const mockValidateAndPriceGroupPackage = vi.fn();
const mockCreateGroupParticipantChildBooking = vi.fn();
const mockCalculateTravelFeeForHold = vi.fn();

const capturedParticipantRows: Record<string, unknown>[] = [];
const capturedGroupInsert: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => mockGetSupabaseAdmin() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return { ...actual, getProviderIdForUser: (...a: unknown[]) => mockGetProviderIdForUser(...a) };
});
vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
  requireAnyPermission: (...a: unknown[]) => mockRequirePermission(...a),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    hasPermission: vi.fn(async () => true),
  };
});
vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));
vi.mock("@/lib/bookings/group-booking-package-pricing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bookings/group-booking-package-pricing")>();
  return { ...actual, validateAndPriceGroupPackage: (...a: unknown[]) => mockValidateAndPriceGroupPackage(...a) };
});
vi.mock("@/lib/bookings/assert-provider-group-bookings-enabled", () => ({
  assertProviderStaffGroupBookingsEnabled: vi.fn(async () => true),
}));
vi.mock("@/lib/bookings/create-group-participant-booking", () => ({
  createGroupParticipantChildBooking: (...a: unknown[]) => mockCreateGroupParticipantChildBooking(...a),
  notifyGroupParticipantBooking: vi.fn(),
}));
vi.mock("@/lib/travel/calculateTravelFeeForHold", () => ({
  calculateTravelFeeForHold: (...a: unknown[]) => mockCalculateTravelFeeForHold(...a),
}));

function buildAdmin() {
  return {
    rpc: vi.fn().mockResolvedValue({ data: "GB-PRICE", error: null }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "offerings") {
        const c: Record<string, unknown> = {};
        c.select = vi.fn(() => c);
        c.in = vi.fn(() => c);
        c.eq = vi.fn(async () => ({
          data: [
            { id: SVC_ID, price: 300, provider_id: PROVIDER_ID },
            { id: ADDON_ID, price: 50, provider_id: PROVIDER_ID },
          ],
          error: null,
        }));
        return c;
      }
      if (table === "group_bookings") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            capturedGroupInsert.push(row);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: GROUP_ID, provider_id: PROVIDER_ID, ref_number: "GB-PRICE", status: "confirmed", scheduled_at: "2026-06-01T10:00:00.000Z" },
                  error: null,
                }),
              }),
            };
          }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: GROUP_ID, ref_number: "GB-PRICE", status: "confirmed", scheduled_at: "2026-06-01T10:00:00.000Z", booking_participants: capturedParticipantRows },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "booking_participants") {
        return {
          insert: vi.fn((rows: Record<string, unknown>[]) => {
            capturedParticipantRows.splice(0, capturedParticipantRows.length, ...rows);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { timezone: "Africa/Johannesburg" }, error: null }),
            }),
          }),
        };
      }
      if (table === "bookings") {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }) }),
          delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }),
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { total_amount: 300 }, error: null }) }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

function post(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/provider/group-bookings", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/provider/group-bookings — server-side pricing (F4-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedParticipantRows.length = 0;
    capturedGroupInsert.length = 0;
    mockRequirePermission.mockResolvedValue({ authorized: true, user: { id: "user-1", role: "provider_owner" } });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
    mockValidateAndPriceGroupPackage.mockResolvedValue({ ok: true, packageDiscount: 0 });
    mockCreateGroupParticipantChildBooking.mockResolvedValue({ bookingId: CHILD_B1 });
    mockCalculateTravelFeeForHold.mockResolvedValue({ travelFee: 120, distanceKm: 8, withinServiceArea: true });
    mockGetSupabaseAdmin.mockReturnValue(buildAdmin());
  });

  it("ignores the client participant price and uses the catalogue price (+ add-ons)", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      post({
        scheduled_at: "2026-06-01T10:00:00.000Z",
        allow_override: true,
        service_id: SVC_ID,
        send_notification: false,
        participants: [
          {
            participant_name: "Alice",
            price: 1, // tampered
            customer_id: "cust-a",
            addons: [{ id: ADDON_ID, addon_id: ADDON_ID, name: "Gloss", price: 1 }],
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    // group total = 300 (service) + 50 (add-on)
    expect(Number(capturedGroupInsert[0]?.total_price)).toBe(350);
    expect(Number(capturedParticipantRows[0]?.price)).toBe(350);
    const childInput = mockCreateGroupParticipantChildBooking.mock.calls[0]?.[2] as { price: number };
    expect(childInput.price).toBe(350);
  });

  it("ignores the client travel_fee and uses the provider travel-fee engine for at-home sessions", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      post({
        scheduled_at: "2026-06-01T10:00:00.000Z",
        allow_override: true,
        service_id: SVC_ID,
        send_notification: false,
        location_type: "at_home",
        address_line1: "1 Test Street",
        address_latitude: -26.2,
        address_longitude: 28.04,
        travel_fee: 1, // tampered
        participants: [{ participant_name: "Alice", price: 300, customer_id: "cust-a" }],
      }),
    );
    expect(res.status).toBe(200);
    expect(mockCalculateTravelFeeForHold).toHaveBeenCalledTimes(1);
    expect(Number(capturedGroupInsert[0]?.travel_fee)).toBe(120);
    expect(Number(capturedGroupInsert[0]?.total_price)).toBe(420);
  });

  it("rejects a participant whose service is not in the provider catalogue", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      post({
        scheduled_at: "2026-06-01T10:00:00.000Z",
        allow_override: true,
        send_notification: false,
        participants: [
          { participant_name: "Alice", price: 5, customer_id: "cust-a", service_id: "77777777-7777-4777-8777-777777777777" },
        ],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe("INVALID_SERVICE");
    expect(capturedGroupInsert).toHaveLength(0);
  });
});
