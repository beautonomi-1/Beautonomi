import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/provider-ops/ops-route-auth", () => ({
  requireProviderOpsSales: vi.fn(async () => ({ user: { id: "u1", role: "admin_sales" } })),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
  extractRequestMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: vi.fn() })),
}));

const changeProviderLeadStage = vi.fn();
vi.mock("@/lib/provider-ops/lead-stage-update", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/provider-ops/lead-stage-update")>();
  return {
    ...actual,
    changeProviderLeadStage,
  };
});

const LEAD_A = "550e8400-e29b-41d4-a716-446655440001";
const LEAD_B = "550e8400-e29b-41d4-a716-446655440002";

describe("POST /api/admin/provider-ops/leads/bulk-stage (integration)", () => {
  beforeEach(() => {
    changeProviderLeadStage.mockReset();
  });

  it("aggregates updated, conflicts, and not_found per item", async () => {
    changeProviderLeadStage
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, code: "CONCURRENT_UPDATE", message: "conflict" })
      .mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "missing" });

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/provider-ops/leads/bulk-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "contacted",
          items: [
            { id: LEAD_A, expected_updated_at: "2020-01-01T00:00:00.000Z" },
            { id: LEAD_B },
            { id: "550e8400-e29b-41d4-a716-446655440003" },
          ],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.updated).toEqual([LEAD_A]);
    expect(body.data.skipped).toHaveLength(0);
    expect(body.data.conflicts).toEqual([LEAD_B]);
    expect(body.data.not_found).toHaveLength(1);
    expect(changeProviderLeadStage).toHaveBeenCalledTimes(3);
  });

  it("skips matched stage without matched_provider_id (same as single PATCH)", async () => {
    changeProviderLeadStage.mockResolvedValue({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "matched_provider_id is required to move a lead to matched",
    });

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/provider-ops/leads/bulk-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "matched",
          items: [{ id: LEAD_A }],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.updated).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].reason).toContain("matched_provider_id");
  });
});
