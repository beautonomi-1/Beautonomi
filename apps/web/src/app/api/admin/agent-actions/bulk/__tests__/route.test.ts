import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
  extractRequestMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: vi.fn(async () => ({ user: { id: "u1", role: "superadmin" } })),
    requireAdminSection: vi.fn(async () => ({ user: { id: "u1", role: "superadmin" } })),
  };
});

describe("POST /api/admin/agent-actions/bulk", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects more than 50 ids", async () => {
    const validIds = Array.from({ length: 51 }, () => "550e8400-e29b-41d4-a716-446655440000");

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/agent-actions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: validIds, decision: "approve" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects empty ids", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/agent-actions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [], decision: "reject" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
