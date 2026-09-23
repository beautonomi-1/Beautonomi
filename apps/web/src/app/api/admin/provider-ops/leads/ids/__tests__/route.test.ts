import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

vi.mock("@/lib/provider-ops/ops-route-auth", () => ({
  requireProviderOpsSales: vi.fn(async () => ({ user: { id: "u1", role: "admin" } })),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/provider-ops/lead-list-filters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/provider-ops/lead-list-filters")>();
  return {
    ...actual,
    resolveLeadListFilterContext: vi.fn(async () => ({
      categoryLeadIds: null,
      slaBreachedLeadIds: ["sla-lead-1"],
    })),
  };
});

function chainable(result: { data?: unknown; count?: number; error?: null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.order = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.in = vi.fn(self);
  chain.or = vi.fn(self);
  chain.is = vi.fn(self);
  chain.not = vi.fn(self);
  chain.neq = vi.fn(self);
  chain.range = vi.fn(self);
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

describe("GET /api/admin/provider-ops/leads/ids", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("returns ids, total, and capped flag", async () => {
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return chainable({ count: 1200, error: null });
      }
      return chainable({
        data: [{ id: "550e8400-e29b-41d4-a716-446655440000" }],
        error: null,
      });
    });

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("http://localhost/api/admin/provider-ops/leads/ids?sla_breached=1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(1200);
    expect(body.data.capped).toBe(true);
    expect(body.data.ids).toHaveLength(1);
  });
});
