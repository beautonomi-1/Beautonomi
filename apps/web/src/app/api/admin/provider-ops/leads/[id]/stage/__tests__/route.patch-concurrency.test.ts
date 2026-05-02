import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAdminSection = vi.fn();
const mockResolveTenant = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockResolveTenant(...args),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
  extractRequestMeta: vi.fn(() => ({ ip_address: null, user_agent: null })),
}));

describe("PATCH /api/admin/provider-ops/leads/[id]/stage concurrency", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireAdminSection.mockResolvedValue({ user: { id: "admin-1", role: "admin_operations" } });
    mockResolveTenant.mockResolvedValue("tenant-1");
  });

  it("returns 409 CONCURRENT_UPDATE when expected_updated_at mismatches", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const mockFrom = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "lead-1",
                commercial_stage: "new",
                reopen_count: 0,
                updated_at: "2026-05-01T12:00:00.000Z",
              },
              error: null,
            }),
          })),
        })),
      })),
    }));
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: mockFrom } as never);

    const { PATCH } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/provider-ops/leads/lead-1/stage", {
      method: "PATCH",
      body: JSON.stringify({
        stage: "contacted",
        expected_updated_at: "2026-05-01T11:00:00.000Z",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "lead-1" }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error?.code).toBe("CONCURRENT_UPDATE");
  });
});
