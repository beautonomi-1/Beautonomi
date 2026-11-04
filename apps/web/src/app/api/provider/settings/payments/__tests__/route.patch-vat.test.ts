import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockApplyTaxPatch = vi.fn();
const providerUpdate = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/tenant/provider-matches-host", () => ({
  PROVIDER_MARKET_MISMATCH_MSG: "mismatch",
  providerTenantMismatchResponse: vi.fn(async () => null),
}));

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: vi.fn(async () => true),
}));

vi.mock("@/lib/provider-settings/apply-provider-tax-settings-patch", () => ({
  applyProviderTaxSettingsPatch: (...args: unknown[]) => mockApplyTaxPatch(...args),
}));

function buildSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table !== "providers") throw new Error(`Unexpected table: ${table}`);
      const chain: Record<string, unknown> = {};
      chain.update = vi.fn((values: unknown) => {
        providerUpdate(values);
        return chain;
      });
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.single = vi.fn(async () => ({ data: { id: "provider-1" }, error: null }));
      return chain;
    }),
  };
}

function patch(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/provider/settings/payments", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PATCH /api/provider/settings/payments VAT fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetSupabaseServer.mockResolvedValue(buildSupabase());
    mockApplyTaxPatch.mockResolvedValue({
      ok: true,
      data: { tax_rate_percent: 15, is_vat_registered: true, vat_number: "4123456789", tax_inclusive: true },
    });
  });

  it("sends VAT fields through the shared tax helper and never writes a client tax rate", async () => {
    const { PATCH } = await import("../route");
    const res = await PATCH(
      patch({
        taxRatePercent: 99,
        isVatRegistered: true,
        vatNumber: "4123456789",
        taxInclusive: false,
        acceptCash: true,
      }),
    );

    expect(res.status).toBe(200);
    expect(mockApplyTaxPatch).toHaveBeenCalledWith(expect.anything(), "provider-1", {
      is_vat_registered: true,
      vat_number: "4123456789",
      tax_inclusive: false,
    });
    expect(providerUpdate).toHaveBeenCalledTimes(1);
    const written = providerUpdate.mock.calls[0]![0] as Record<string, unknown>;
    expect(written).toEqual({ accept_cash: true });
  });

  it("returns the helper's error and writes nothing else when VAT is rejected", async () => {
    mockApplyTaxPatch.mockResolvedValue({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "VAT number is required when registering for VAT",
      status: 400,
    });
    const { PATCH } = await import("../route");
    const res = await PATCH(patch({ isVatRegistered: true, vatNumber: "", acceptCash: true }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("VALIDATION_ERROR");
    expect(providerUpdate).not.toHaveBeenCalled();
  });

  it("skips the tax helper when no VAT field is sent", async () => {
    const { PATCH } = await import("../route");
    const res = await PATCH(patch({ acceptCash: false }));

    expect(res.status).toBe(200);
    expect(mockApplyTaxPatch).not.toHaveBeenCalled();
    expect(providerUpdate).toHaveBeenCalledWith({ accept_cash: false });
  });
});
