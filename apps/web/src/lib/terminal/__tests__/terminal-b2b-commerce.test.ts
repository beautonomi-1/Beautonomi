import { describe, expect, it } from "vitest";
import { validateTerminalOrderFulfillment } from "@/lib/terminal/terminal-order-fulfillment";
import {
  resolveIntegrationSetupPath,
  resolveIntegrationSetupUrl,
} from "@/lib/terminal/resolve-integration-setup-url";
import { assertCommercialModelEligible } from "@/lib/terminal/terminal-checkout-eligibility";
import { validateTerminalOrderPaystackPayment } from "@/lib/terminal/validate-terminal-order-paystack-payment";

describe("terminal-order-fulfillment", () => {
  it("requires delivery address for courier", () => {
    expect(() =>
      validateTerminalOrderFulfillment({
        fulfillment_type: "courier",
        delivery_address: null,
      }),
    ).toThrow(/Delivery address/);
  });

  it("requires collection location for pickup", () => {
    expect(() =>
      validateTerminalOrderFulfillment({
        fulfillment_type: "collection",
        collection_location_id: null,
      }),
    ).toThrow(/Collection location/);
  });

  it("allows digital activation without address", () => {
    expect(() =>
      validateTerminalOrderFulfillment({
        fulfillment_type: "digital_activation",
      }),
    ).not.toThrow();
  });
});

describe("resolve-integration-setup-url", () => {
  it("routes yoco to yoco integration page", () => {
    expect(resolveIntegrationSetupPath({ vendor: "yoco" })).toBe(
      "/provider/settings/sales/yoco-integration",
    );
  });

  it("routes generic vendors to terminal integrations hub", () => {
    expect(resolveIntegrationSetupPath({ vendor: "wappoint" })).toBe(
      "/provider/settings/sales/terminal-integrations/wappoint",
    );
  });

  it("includes order id in setup url query", () => {
    const url = resolveIntegrationSetupUrl({ vendor: "ikhokha" }, "order-123");
    expect(url).toContain("order=order-123");
    expect(url).toContain("terminal-integrations/ikhokha");
  });
});

describe("assertCommercialModelEligible", () => {
  it("rejects models not in eligibility options", () => {
    expect(() =>
      assertCommercialModelEligible("rental", {
        options: [{ commercial_model: "once_off_purchase", label: "Buy", price: 100, currency: "ZAR", requires_payment: true }],
        bundle: {
          enabled: false,
          includedTerminalCount: null,
          terminalModel: null,
          planName: null,
          planId: null,
          subscriptionId: null,
          usedCount: 0,
          remainingCount: null,
        },
        subscription_bundle_flag_enabled: false,
      }),
    ).toThrow(/not available/);
  });
});

describe("validateTerminalOrderPaystackPayment", () => {
  function mockSupabase(order: Record<string, unknown> | null) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: order, error: null }),
          }),
        }),
      }),
    } as never;
  }

  it("rejects provider mismatch from metadata", async () => {
    const result = await validateTerminalOrderPaystackPayment(
      mockSupabase({
        id: "order-1",
        provider_id: "provider-a",
        tenant_id: null,
        total_amount: 100,
        invoice_status: "pending",
        commercial_model: "once_off_purchase",
        paystack_reference: null,
        order_status: "pending",
      }),
      {
        terminalOrderId: "order-1",
        amountMajor: 100,
        reference: "ref-1",
        metadataProviderId: "provider-b",
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("provider_mismatch");
  });

  it("rejects amount mismatch for new reference", async () => {
    const result = await validateTerminalOrderPaystackPayment(
      mockSupabase({
        id: "order-1",
        provider_id: "provider-a",
        tenant_id: null,
        total_amount: 100,
        invoice_status: "pending",
        commercial_model: "once_off_purchase",
        paystack_reference: null,
        order_status: "pending",
      }),
      {
        terminalOrderId: "order-1",
        amountMajor: 50,
        reference: "ref-1",
        metadataProviderId: "provider-a",
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("amount_mismatch");
  });

  it("accepts matching amount and provider", async () => {
    const result = await validateTerminalOrderPaystackPayment(
      mockSupabase({
        id: "order-1",
        provider_id: "provider-a",
        tenant_id: null,
        total_amount: 115,
        invoice_status: "pending",
        commercial_model: "once_off_purchase",
        paystack_reference: null,
        order_status: "pending",
      }),
      {
        terminalOrderId: "order-1",
        amountMajor: 115,
        reference: "ref-1",
        metadataProviderId: "provider-a",
      },
    );
    expect(result.ok).toBe(true);
  });
});
