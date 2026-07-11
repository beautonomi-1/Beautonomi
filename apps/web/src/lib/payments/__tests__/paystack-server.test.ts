import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(),
}));

vi.mock("@/lib/regions/payment-gateways", () => ({
  getPrimaryOnlinePaymentGatewayForRegion: vi.fn(),
}));

import { getTenantRegionConfig } from "@/lib/regions/config";
import { getPrimaryOnlinePaymentGatewayForRegion } from "@/lib/regions/payment-gateways";
import { ensurePaystackPrimaryGatewayForTenant } from "@/lib/payments/paystack-server";

describe("ensurePaystackPrimaryGatewayForTenant", () => {
  beforeEach(() => {
    vi.mocked(getTenantRegionConfig).mockReset();
    vi.mocked(getPrimaryOnlinePaymentGatewayForRegion).mockReset();
  });

  it("no-ops when tenant id is absent", async () => {
    await expect(ensurePaystackPrimaryGatewayForTenant(null)).resolves.toBeUndefined();
    expect(getTenantRegionConfig).not.toHaveBeenCalled();
  });

  it("throws when tenant has no region configuration", async () => {
    vi.mocked(getTenantRegionConfig).mockResolvedValue(null);
    await expect(ensurePaystackPrimaryGatewayForTenant("tenant-1")).rejects.toThrow(
      /No region configuration/,
    );
  });

  it("throws when region has no primary online gateway", async () => {
    vi.mocked(getTenantRegionConfig).mockResolvedValue({ regionId: "region-za" } as any);
    vi.mocked(getPrimaryOnlinePaymentGatewayForRegion).mockResolvedValue(null);
    await expect(ensurePaystackPrimaryGatewayForTenant("tenant-1")).rejects.toThrow(
      /No primary online payment gateway/,
    );
  });

  it("throws when primary gateway is not Paystack", async () => {
    vi.mocked(getTenantRegionConfig).mockResolvedValue({ regionId: "region-za" } as any);
    vi.mocked(getPrimaryOnlinePaymentGatewayForRegion).mockResolvedValue({
      gateway: "stripe",
    } as any);
    await expect(ensurePaystackPrimaryGatewayForTenant("tenant-1")).rejects.toThrow(/not Paystack/);
  });

  it("passes when primary gateway is Paystack", async () => {
    vi.mocked(getTenantRegionConfig).mockResolvedValue({ regionId: "region-za" } as any);
    vi.mocked(getPrimaryOnlinePaymentGatewayForRegion).mockResolvedValue({
      gateway: "paystack",
    } as any);
    await expect(ensurePaystackPrimaryGatewayForTenant("tenant-1")).resolves.toBeUndefined();
  });
});
