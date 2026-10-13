import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockYocoGate = vi.fn();
const mockPaycloudGate = vi.fn();
const mockPaycloudReadiness = vi.fn();

vi.mock("@/lib/auth/requireRole", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: "auth" }), { status: 401 }),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/payments/yoco-feature-gate", () => ({
  requireYocoPlatformEnabledForProvider: (...args: unknown[]) => mockYocoGate(...args),
}));

vi.mock("@/lib/payments/paycloud-feature-gate", () => ({
  requirePaycloudPlatformEnabledForProvider: (...args: unknown[]) => mockPaycloudGate(...args),
}));

vi.mock("@/lib/payments/paycloud-readiness", () => ({
  computePaycloudReadiness: (...args: unknown[]) => mockPaycloudReadiness(...args),
}));

function tableQuery(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("GET /api/provider/card-machines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ user: { id: "u1" } });
    mockGetProviderIdForUser.mockResolvedValue("prov-1");
    mockYocoGate.mockResolvedValue(null);
    mockPaycloudGate.mockResolvedValue(null);
    mockPaycloudReadiness.mockResolvedValue({ ready: true, blockers: [] });
  });

  it("returns merged machines from yoco devices and paycloud terminals", async () => {
    const from = vi.fn((table: string) => {
      if (table === "provider_yoco_devices") {
        return tableQuery([
          {
            id: "yd-1",
            name: "Yoco Front",
            location_id: null,
            is_active: true,
            credential_mode: "oauth",
          },
        ]);
      }
      if (table === "paycloud_terminals") {
        return tableQuery([
          {
            id: "pt-1",
            display_name: "Salon 1",
            location_id: "loc-1",
            is_active: true,
            status: "active",
          },
        ]);
      }
      if (table === "provider_card_machine_defaults") {
        return tableQuery([]);
      }
      return tableQuery([]);
    });
    mockGetSupabaseServer.mockResolvedValue({ from });

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/provider/card-machines"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.machines).toHaveLength(2);
    expect(json.data.machines.map((m: { provider: string }) => m.provider).sort()).toEqual([
      "paycloud",
      "yoco",
    ]);
  });
});
