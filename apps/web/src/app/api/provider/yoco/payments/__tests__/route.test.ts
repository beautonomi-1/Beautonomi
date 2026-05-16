import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockCheckYocoFeatureAccess = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockGetTenantRegionConfig = vi.fn();

vi.mock("@/lib/auth/requireRole", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  unauthorizedResponse: (message = "Authentication required") =>
    new Response(JSON.stringify({ data: null, error: { message } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
}));

vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkYocoFeatureAccess: (...args: unknown[]) => mockCheckYocoFeatureAccess(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) =>
    mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: (...args: unknown[]) => mockGetTenantRegionConfig(...args),
}));

function createSupabaseForLegacyTerminalFlow() {
  return {
    from: vi.fn((table: string) => {
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: "provider-1", tenant_id: "tenant-1" },
            error: null,
          }),
        };
      }

      if (table === "provider_yoco_devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };
      }

      if (table === "provider_yoco_terminals") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "legacy-terminal-row-1",
              device_id: "legacy-device-22",
              device_name: "Legacy front desk terminal",
              active: true,
              secret_key: "legacy-secret-key",
              api_key: null,
            },
            error: null,
          }),
        };
      }

      if (table === "provider_yoco_integrations") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { is_enabled: false, secret_key: null, public_key: null },
            error: null,
          }),
        };
      }

      if (table === "provider_yoco_payments") {
        const paymentInsertRow = {
          id: "payment-row-1",
          yoco_payment_id: "yp_legacy_123",
        };
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: paymentInsertRow,
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table queried: ${table}`);
    }),
  };
}

describe("POST /api/provider/yoco/payments", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ user: { id: "provider-user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockCheckYocoFeatureAccess.mockResolvedValue({ enabled: true });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-1");
    mockGetTenantRegionConfig.mockResolvedValue({
      defaultCurrency: "ZAR",
    });
    mockGetSupabaseServer.mockResolvedValue(createSupabaseForLegacyTerminalFlow());
  });

  it("falls back to legacy terminal when modern device row is missing", async () => {
    const fetchMock = vi
      .fn()
      // Device probe
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "legacy-device-22" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      // Payment create
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "yp_legacy_123", status: "pending" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("../route");

    const res = await POST(
      new Request("http://localhost/api/provider/yoco/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: "legacy-terminal-row-1",
          amount: 125,
        }),
      }),
    );

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data?.yoco_payment_id).toBe("yp_legacy_123");
    expect(body.data?.device_name).toBe("Legacy front desk terminal");
    // Legacy path returns request device id because no modern billing device row exists.
    expect(body.data?.device_id).toBe("legacy-terminal-row-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [probeUrl, probeInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(probeUrl)).toContain("legacy-device-22");
    expect(probeInit.method).toBe("GET");
    expect((probeInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer legacy-secret-key",
    );

    const [createUrl, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(String(createUrl)).toContain("legacy-device-22");
    expect(createInit.method).toBe("POST");
    expect((createInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer legacy-secret-key",
    );
  });
});

