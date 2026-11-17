import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockIsFeatureEnabledServer = vi.fn();
const mockAllocate = vi.fn();
const mockWriteAuditLog = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({})),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { tenant_id: "tenant-1" }, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: (...args: unknown[]) => mockIsFeatureEnabledServer(...args),
}));

vi.mock("@/lib/terminal/create-terminal-order", () => ({
  allocateTerminalFromSubscription: (...args: unknown[]) => mockAllocate(...args),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
  extractRequestMeta: () => ({ ip_address: null, user_agent: null }),
}));

describe("POST /api/provider/terminal-orders/allocate-from-subscription (F3-27)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "owner-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue("prov-1");
    mockIsFeatureEnabledServer.mockResolvedValue(true);
    mockAllocate.mockResolvedValue({ order: { id: "ord-1" } });
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("returns 403 FEATURE_DISABLED when terminal ecommerce flags are off", async () => {
    mockIsFeatureEnabledServer.mockResolvedValue(false);
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/terminal-orders/allocate-from-subscription", {
        method: "POST",
        body: JSON.stringify({ product_id: "00000000-0000-4000-8000-000000000001", quantity: 1 }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error?.code).toBe("FEATURE_DISABLED");
  });

  it("returns 400 VALIDATION_ERROR for a missing product_id", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/terminal-orders/allocate-from-subscription", {
        method: "POST",
        body: JSON.stringify({ quantity: 1 }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });
});
