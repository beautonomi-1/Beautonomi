import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../bookings/route";

const tenantId = "tenant-1";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireAdminSection: vi.fn(async () => ({})),
  successResponse: vi.fn((data) => Response.json(data)),
  handleApiError: vi.fn((error: unknown) =>
    Response.json({ error: String(error) }, { status: 500 }),
  ),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn(async () => tenantId),
}));

let bookings: Record<string, unknown>[];
let mockSupabase: { from: ReturnType<typeof vi.fn> };

function request(path = "/api/admin/reports/bookings?period=30d") {
  return { url: `https://example.test${path}` } as never;
}

beforeEach(() => {
  bookings = [
    {
      scheduled_at: "2026-05-01T10:00:00.000Z",
      status: "completed",
      provider_id: "p1",
      booking_source: "online",
    },
    {
      scheduled_at: "2026-05-02T10:00:00.000Z",
      status: "cancelled",
      provider_id: "p1",
      booking_source: "walk_in",
    },
    {
      scheduled_at: "2026-05-03T10:00:00.000Z",
      status: "completed",
      provider_id: "p1",
      booking_source: null,
    },
  ];

  mockSupabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => ({
                  order: () => ({
                    range: async () => ({ data: bookings, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [{ id: "p1", business_name: "Salon One" }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    }),
  };
});

describe("GET /api/admin/reports/bookings", () => {
  it("returns channelBreakdown with null booking_source treated as online", async () => {
    const res = await GET(request());
    const data = await res.json();

    expect(data.channelBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "online", count: 2 }),
        expect.objectContaining({ channel: "walk_in", count: 1 }),
      ]),
    );
    expect(data.channelBasisNote).toContain("booking_source");
  });
});
