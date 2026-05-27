/**
 * GET/PATCH /api/provider/bookings/[id] when id is synthetic `group:…`:
 * in-process forward to /api/provider/group-bookings/:id must preserve
 * Authorization (Bearer) and other proxy headers on `fetch`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "../route";
import { POST as POSTRefund } from "../refund/route";
import { mockUser } from "@/lib/test-utils/setup";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: vi.fn().mockResolvedValue("prov-test-1"),
  };
});

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: vi.fn(async () => ({ authorized: true, user: mockUser })),
  requireAnyPermission: vi.fn(async () => ({ authorized: true, user: mockUser })),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn().mockResolvedValue("test-tenant-id"),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn().mockResolvedValue({
    tenantId: "test-tenant-id",
    tenantSlug: "za",
    regionCode: "ZA",
    defaultCurrency: "ZAR",
    defaultLanguage: "en",
    defaultTimezone: "Africa/Johannesburg",
    regionDisplayName: "South Africa",
    phoneCountryCode: "+27",
    regionId: null,
  }),
}));

vi.mock("@/lib/provider-booking/booking-branch-access", () => ({
  assertProviderUserCanAccessBookingBranch: vi.fn().mockResolvedValue({ allowed: true }),
}));

function headersToRecord(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return { ...(h as Record<string, string>) };
}

const groupUuid = "11111111-1111-1111-1111-111111111111";
const syntheticId = `group:${groupUuid}`;

const minimalGroupDetail = {
  id: groupUuid,
  provider_id: "prov-test-1",
  ref_number: "G-TEST-REF",
  status: "booked",
  scheduled_at: "2026-05-01T12:00:00.000Z",
  booking_participants: [],
  products: [],
  bookings: [],
  location_id: null,
  staff_id: null,
};

describe("GET/PATCH /api/provider/bookings/[id] for synthetic group: ids", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const adminChain = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };
    vi.mocked(getSupabaseServer).mockResolvedValue(adminChain as any);
    vi.mocked(getSupabaseAdmin).mockReturnValue(adminChain as any);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("GET forwards Authorization (and optional Cookie) on internal fetch to group-bookings", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ data: minimalGroupDetail }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = new URL(`http://localhost:3000/api/provider/bookings/${encodeURIComponent(syntheticId)}`);
    const req = new NextRequest(url, {
      method: "GET",
      headers: {
        authorization: "Bearer fake-test-auth-header",
        cookie: "sb-test=session",
        "x-csrf-token": "csrf-test",
        "x-provider-id": "prov-header-1",
      },
    });

    const res = await GET(req, { params: Promise.resolve({ id: syntheticId }) });
    expect(res.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(calledUrl)).toContain(`/api/provider/group-bookings/${groupUuid}`);
    expect(init?.method ?? "GET").toBe("GET");
    const h = headersToRecord(init?.headers);
    expect(h.Authorization).toBe("Bearer fake-test-auth-header");
    expect(h.Cookie).toBe("sb-test=session");
    expect(h["x-csrf-token"]).toBe("csrf-test");
    expect(h["x-provider-id"]).toBe("prov-header-1");

    const json = await res.json();
    expect(json.data).toMatchObject({
      id: syntheticId,
      is_group_booking: true,
      group_booking_id: groupUuid,
    });
  });

  it("PATCH forwards Authorization and pickGroupBookingPatchPayload body on internal fetch", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = new URL(`http://localhost:3000/api/provider/bookings/${encodeURIComponent(syntheticId)}`);
    const patchBody = {
      team_member_id: "staff-forward-1",
      products: [{ id: "p1", quantity: 1, unit_price: 10 }],
    };
    const req = new NextRequest(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer fake-patch-auth-header",
      },
      body: JSON.stringify(patchBody),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: syntheticId }) });
    expect(res.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(calledUrl)).toContain(`/api/provider/group-bookings/${groupUuid}`);
    expect(init?.method).toBe("PATCH");
    const h = headersToRecord(init?.headers);
    expect(h.Authorization).toBe("Bearer fake-patch-auth-header");
    expect(h["Content-Type"]).toBe("application/json");
    const forwarded = JSON.parse((init?.body as string) ?? "{}");
    expect(forwarded).toEqual({
      staff_id: "staff-forward-1",
      products: patchBody.products,
    });
  });

  it("PATCH cancel (status cancelled) forwards Authorization on DELETE to group-bookings", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ data: { cancelled: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = new URL(`http://localhost:3000/api/provider/bookings/${encodeURIComponent(syntheticId)}`);
    const req = new NextRequest(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer fake-delete-auth-header",
      },
      body: JSON.stringify({ status: "cancelled", cancellation_reason: "  no longer needed  " }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: syntheticId }) });
    expect(res.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(calledUrl)).toContain(`/api/provider/group-bookings/${groupUuid}`);
    expect(init?.method).toBe("DELETE");
    const h = headersToRecord(init?.headers);
    expect(h.Authorization).toBe("Bearer fake-delete-auth-header");
    expect(h["Content-Type"]).toBe("application/json");
    expect(JSON.parse((init?.body as string) ?? "{}")).toEqual({
      cancellation_reason: "no longer needed",
    });
  });

  it("POST refund on synthetic group id returns GROUP_REFUND_UNSUPPORTED", async () => {
    const url = new URL(`http://localhost:3000/api/provider/bookings/${encodeURIComponent(syntheticId)}/refund`);
    const req = new NextRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer fake-refund-auth-header",
      },
      body: JSON.stringify({ amount: 50, reason: "customer request" }),
    });

    const res = await POSTRefund(req, { params: Promise.resolve({ id: syntheticId }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("GROUP_REFUND_UNSUPPORTED");
  });
});
