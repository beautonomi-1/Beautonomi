import { describe, expect, it, vi } from "vitest";
import {
  resolvePaystackGatewayFees,
  resolveStripeGatewayFees,
  resolveOnlineChargeFees,
} from "../resolve-gateway-fees";

describe("resolveStripeGatewayFees", () => {
  it("returns stripe fee source when fee minor is positive", () => {
    const result = resolveStripeGatewayFees({ feeMinor: 345, currency: "ZAR" });
    expect(result.feesMajor).toBe(3.45);
    expect(result.feeSource).toBe("stripe");
  });

  it("returns stripe_fee_missing when fee is zero", () => {
    const result = resolveStripeGatewayFees({ feeMinor: 0, currency: "ZAR" });
    expect(result.feesMajor).toBe(0);
    expect(result.feeSource).toBe("stripe_fee_missing");
  });
});

describe("resolvePaystackGatewayFees", () => {
  it("uses paystack source when fees are present", async () => {
    const supabase = { rpc: vi.fn() } as unknown as Parameters<
      typeof resolvePaystackGatewayFees
    >[0];
    const result = await resolvePaystackGatewayFees(supabase, {
      feesSmallestOrMajor: 250,
      amountMajor: 100,
      currency: "ZAR",
    });
    expect(result.feesMajor).toBe(2.5);
    expect(result.feeSource).toBe("paystack");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("resolveOnlineChargeFees", () => {
  it("routes stripe fees without Paystack conversion on fee minor", async () => {
    const supabase = { rpc: vi.fn() } as unknown as Parameters<
      typeof resolveOnlineChargeFees
    >[0];
    const result = await resolveOnlineChargeFees(supabase, "stripe", {
      amountSmallest: 10_000,
      feesSmallest: 290,
      currency: "ZAR",
    });
    expect(result.feesInCurrency).toBe(2.9);
    expect(result.feeSource).toBe("stripe");
  });
});
