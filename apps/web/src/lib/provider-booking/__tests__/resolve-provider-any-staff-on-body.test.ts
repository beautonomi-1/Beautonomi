import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const pickMock = vi.fn();
vi.mock("@/lib/bookings/resolve-any-staff-for-public-booking", () => ({
  pickFirstStaffForNullStaffLines: (...args: unknown[]) => pickMock(...args),
}));

import { resolveProviderAnyStaffOnBookingBody } from "../resolve-provider-any-staff-on-create";
import { staffIdsEligibleForOfferings } from "@/lib/provider/staff-ids-eligible-for-offerings";

const STAFF_A = "550e8400-e29b-41d4-a716-446655440001";
const STAFF_B = "550e8400-e29b-41d4-a716-446655440002";
const WALK_IN_OFFERING = "650e8400-e29b-41d4-a716-446655440009";

function fakeSupabase(rows: Record<string, unknown[]> = {}): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        in: async () => ({ data: rows[table] ?? [], error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const baseArgs = {
  providerId: "prov",
  locationId: "loc",
  providerTimeZone: "Africa/Johannesburg",
  scheduledAt: "2026-11-05T08:00:00.000Z",
  locationType: "at_salon",
};

describe("resolveProviderAnyStaffOnBookingBody", () => {
  beforeEach(() => pickMock.mockReset());

  it("resolves any on a walk-in custom line (catalog offering set by resolveCustomServicesInBookingBody)", async () => {
    pickMock.mockResolvedValueOnce({ ok: true, staffId: STAFF_B });
    const body = {
      services: [
        {
          serviceId: WALK_IN_OFFERING,
          service_id: WALK_IN_OFFERING,
          offering_id: WALK_IN_OFFERING,
          staff_id: "any",
          duration_minutes: 45,
        },
      ],
    };
    const res = await resolveProviderAnyStaffOnBookingBody({
      ...baseArgs,
      supabaseAdmin: fakeSupabase(),
      body,
    });
    expect(res).toEqual({ ok: true });
    expect(body.services[0]!.staff_id).toBe(STAFF_B);
    expect(pickMock).toHaveBeenCalledTimes(1);
    const call = pickMock.mock.calls[0]![0] as {
      staffPool: string;
      bookingServicesData: { offering_id: string }[];
    };
    expect(call.staffPool).toBe("provider");
    expect(call.bookingServicesData[0]!.offering_id).toBe(WALK_IN_OFFERING);
  });

  it("leaves explicit staff untouched and only resolves any lines", async () => {
    pickMock.mockResolvedValueOnce({ ok: true, staffId: STAFF_B });
    const body = {
      services: [
        { service_id: "svc-1", staff_id: STAFF_A, duration_minutes: 30 },
        { service_id: "svc-2", staff_id: "any", duration_minutes: 30 },
      ],
    };
    const res = await resolveProviderAnyStaffOnBookingBody({
      ...baseArgs,
      supabaseAdmin: fakeSupabase(),
      body,
    });
    expect(res).toEqual({ ok: true });
    expect(body.services[0]!.staff_id).toBe(STAFF_A);
    expect(body.services[1]!.staff_id).toBe(STAFF_B);
    expect(pickMock).toHaveBeenCalledTimes(1);
  });

  it("returns NO_STAFF_AVAILABLE when nobody is free", async () => {
    pickMock.mockResolvedValueOnce({ ok: false });
    const body = { services: [{ service_id: "svc-1", staff_id: "any" }] };
    const res = await resolveProviderAnyStaffOnBookingBody({
      ...baseArgs,
      supabaseAdmin: fakeSupabase(),
      body,
    });
    expect(res).toMatchObject({ ok: false, code: "NO_STAFF_AVAILABLE" });
    expect(body.services[0]!.staff_id).toBe("any");
  });

  it("rejects unknown staff tokens with INVALID_STAFF before picking", async () => {
    const body = { services: [{ service_id: "svc-1", staff_id: "someone" }] };
    const res = await resolveProviderAnyStaffOnBookingBody({
      ...baseArgs,
      supabaseAdmin: fakeSupabase(),
      body,
    });
    expect(res).toMatchObject({ ok: false, code: "INVALID_STAFF" });
    expect(pickMock).not.toHaveBeenCalled();
  });

  it("resolves top-level team_member_id any when no services array is sent", async () => {
    pickMock.mockResolvedValueOnce({ ok: true, staffId: STAFF_A });
    const body: Record<string, unknown> = {
      service_id: "svc-1",
      team_member_id: "any",
      staff_id: "any",
      duration_minutes: 60,
    };
    const res = await resolveProviderAnyStaffOnBookingBody({
      ...baseArgs,
      supabaseAdmin: fakeSupabase(),
      body,
    });
    expect(res).toEqual({ ok: true });
    expect(body.team_member_id).toBe(STAFF_A);
    expect(body.staff_id).toBe(STAFF_A);
  });
});

describe("staffIdsEligibleForOfferings (walk-in custom offering)", () => {
  it("does not narrow candidates when the offering has no staff_services rows", async () => {
    const result = await staffIdsEligibleForOfferings(
      fakeSupabase({ staff_services: [] }),
      [STAFF_A, STAFF_B],
      [WALK_IN_OFFERING],
    );
    expect(result).toEqual([STAFF_A, STAFF_B]);
  });

  it("narrows when the offering has mappings", async () => {
    const result = await staffIdsEligibleForOfferings(
      fakeSupabase({ staff_services: [{ offering_id: "svc-1", staff_id: STAFF_B }] }),
      [STAFF_A, STAFF_B],
      ["svc-1"],
    );
    expect(result).toEqual([STAFF_B]);
  });
});
