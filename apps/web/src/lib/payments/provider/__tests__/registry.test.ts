import { describe, it, expect } from "vitest";
import { resolveSettlementModel } from "../settlement-model";
import { getPaymentProviderById } from "../registry";

describe("payment provider registry", () => {
  it("resolves settlement_model from region gateway config", () => {
    expect(resolveSettlementModel({ settlement_model: "connected_mor_destination" })).toBe(
      "connected_mor_destination",
    );
    expect(resolveSettlementModel({})).toBe("platform_mor_transfer");
    expect(resolveSettlementModel({ settlement_model: "invalid" })).toBe("platform_mor_transfer");
  });

  it("registers paystack, stripe, and flutterwave providers", () => {
    expect(getPaymentProviderById("paystack")?.id).toBe("paystack");
    expect(getPaymentProviderById("stripe")?.id).toBe("stripe");
    expect(getPaymentProviderById("flutterwave")?.id).toBe("flutterwave");
    expect(getPaymentProviderById("unknown")).toBeNull();
  });

  it("paystack supports refunds", () => {
    expect(getPaymentProviderById("paystack")?.capabilities.supportsRefunds).toBe(true);
  });

  it("flutterwave supports saved cards and refunds but not native subscriptions", () => {
    const fw = getPaymentProviderById("flutterwave");
    expect(fw?.capabilities.supportsSavedCards).toBe(true);
    expect(fw?.capabilities.supportsRefunds).toBe(true);
    expect(fw?.capabilities.supportsSubscriptions).toBe(false);
  });
});
