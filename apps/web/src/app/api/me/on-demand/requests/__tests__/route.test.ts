import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockGetRequestNowAvailability = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  successResponse: (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  errorResponse: (message: string, code: string, status: number) =>
    Response.json({ data: null, error: { message, code } }, { status }),
  handleApiError: (error: unknown, fallback: string) =>
    Response.json(
      { data: null, error: { message: error instanceof Error ? error.message : fallback } },
      { status: 500 },
    ),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/on-demand/request-now-availability", () => ({
  getRequestNowAvailability: (...args: unknown[]) => mockGetRequestNowAvailability(...args),
}));

function makeAdmin() {
  return {
    from(table: string) {
      if (table === "provider_online_booking_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { on_demand_accept_enabled: true }, error: null }),
            }),
          }),
        };
      }
      if (table === "on_demand_module_config") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { provider_accept_window_seconds: 30 }, error: null }),
            }),
          }),
        };
      }
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "00000000-0000-4000-8000-000000000001",
                  tenant_id: "tenant-1",
                  user_id: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "provider_staff") {
        return {
          select: () => ({
            eq: () => ({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected admin table ${table}`);
    },
  };
}

function makeUserClient(inserted: { current?: Record<string, unknown> }) {
  return {
    from(table: string) {
      if (table !== "on_demand_requests") throw new Error(`Unexpected user table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: (payload: Record<string, unknown>) => {
          inserted.current = payload;
          return {
            select: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "request-1", ...payload },
                error: null,
              }),
            }),
          };
        },
      };
    },
  };
}

describe("POST /api/me/on-demand/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "customer-1" } });
    mockGetSupabaseAdmin.mockReturnValue(makeAdmin());
    mockGetRequestNowAvailability.mockResolvedValue({
      enabled: true,
      providerAcceptWindowSeconds: 30,
    });
  });

  it("does not reuse the old hour-bucket fallback idempotency key", async () => {
    const inserted: { current?: Record<string, unknown> } = {};
    mockGetSupabaseServer.mockResolvedValue(makeUserClient(inserted));

    const { POST } = await import("../route");
    const req = new NextRequest("https://app.example.com/api/me/on-demand/requests", {
      method: "POST",
      body: JSON.stringify({
        provider_id: "00000000-0000-4000-8000-000000000001",
        request_payload: { selected_datetime: "2026-04-24T10:00:00.000Z" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(inserted.current?.idempotency_key).toEqual(expect.stringMatching(/^od-customer-1-/));
    expect(inserted.current?.idempotency_key).not.toContain("2026-");
  });

  it("rejects requests when admin disables Request Now globally", async () => {
    const inserted: { current?: Record<string, unknown> } = {};
    mockGetSupabaseServer.mockResolvedValue(makeUserClient(inserted));
    mockGetRequestNowAvailability.mockResolvedValue({
      enabled: false,
      providerAcceptWindowSeconds: 30,
    });

    const { POST } = await import("../route");
    const req = new NextRequest("https://app.example.com/api/me/on-demand/requests", {
      method: "POST",
      body: JSON.stringify({
        provider_id: "00000000-0000-4000-8000-000000000001",
        request_payload: { selected_datetime: "2026-04-24T10:00:00.000Z" },
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("ON_DEMAND_DISABLED");
    expect(inserted.current).toBeUndefined();
  });
});
