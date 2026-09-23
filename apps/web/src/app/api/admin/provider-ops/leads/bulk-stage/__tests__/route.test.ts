import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/provider-ops/ops-route-auth", () => ({
  requireProviderOpsSales: vi.fn(async () => ({ user: { id: "u1", role: "admin" } })),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
  extractRequestMeta: vi.fn(() => ({})),
}));

const changeProviderLeadStage = vi.fn();
vi.mock("@/lib/provider-ops/lead-stage-update", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/provider-ops/lead-stage-update")>();
  return {
    ...actual,
    changeProviderLeadStage,
  };
});

describe("POST /api/admin/provider-ops/leads/bulk-stage", () => {
  beforeEach(async () => {
    changeProviderLeadStage.mockReset();
    vi.resetModules();
  });

  it("returns validation error for empty items", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/provider-ops/leads/bulk-stage", {
        method: "POST",
        body: JSON.stringify({ stage: "new", items: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid stage values", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/provider-ops/leads/bulk-stage", {
        method: "POST",
        body: JSON.stringify({
          stage: "not_a_real_stage",
          items: [{ id: "550e8400-e29b-41d4-a716-446655440000" }],
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });
});
