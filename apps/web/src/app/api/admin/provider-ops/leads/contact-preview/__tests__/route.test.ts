import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/provider-ops/ops-route-auth", () => ({
  requireProviderOpsSales: vi.fn(async () => ({ user: { id: "u1", role: "admin" } })),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  })),
}));

describe("POST /api/admin/provider-ops/leads/contact-preview", () => {
  it("returns 400 for empty ids", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/provider-ops/leads/contact-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
