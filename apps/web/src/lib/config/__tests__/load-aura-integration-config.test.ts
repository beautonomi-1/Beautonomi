import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFetchScopedSingle = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedSingle: (...args: unknown[]) => mockFetchScopedSingle(...args),
}));

describe("loadAuraIntegrationConfig", () => {
  beforeEach(() => {
    mockFetchScopedSingle.mockReset();
  });

  it("returns tenant row when present (even when disabled)", async () => {
    mockFetchScopedSingle.mockResolvedValueOnce({
      data: { enabled: false, api_key_secret: "k", org_id: "o" },
      source: "tenant",
    });
    const { loadAuraIntegrationConfig } = await import("../load-aura-integration-config");
    const row = await loadAuraIntegrationConfig("production", "tenant-a");
    expect(row?.enabled).toBe(false);
    expect(mockFetchScopedSingle).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a", table: "aura_integration_config" }),
    );
  });

  it("falls back to global when tenant has no row", async () => {
    mockFetchScopedSingle.mockResolvedValueOnce({
      data: { enabled: true, api_key_secret: "g", org_id: null },
      source: "global",
    });
    const { loadAuraIntegrationConfig } = await import("../load-aura-integration-config");
    const row = await loadAuraIntegrationConfig("production", "tenant-a");
    expect(row?.enabled).toBe(true);
  });
});
