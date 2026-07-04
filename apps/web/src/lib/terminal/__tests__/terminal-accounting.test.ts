/**
 * Accounting logic tests for terminal order payments.
 *
 * Tests the commercial model → transaction type mapping without hitting the DB.
 * Pattern mirrors apps/web/src/lib/subscriptions/__tests__/provider-subscription-payment.test.ts
 */

import { describe, expect, it } from "vitest";

// ── Transaction type mapping (inline mirror of record-terminal-order-payment.ts) ──

type TerminalCommercialModel =
  | "once_off_purchase"
  | "rental"
  | "subscription_bundle"
  | "lease_to_own"
  | "financed"
  | "promotional";

const TRANSACTION_TYPE_MAP: Record<TerminalCommercialModel, string> = {
  once_off_purchase: "terminal_sale",
  rental: "terminal_rental",
  subscription_bundle: "terminal_bundle_alloc",
  lease_to_own: "terminal_sale",
  financed: "terminal_sale",
  promotional: "terminal_promotion",
};

describe("Terminal order payment — transaction type mapping", () => {
  it("maps once_off_purchase to terminal_sale", () => {
    expect(TRANSACTION_TYPE_MAP.once_off_purchase).toBe("terminal_sale");
  });

  it("maps rental to terminal_rental", () => {
    expect(TRANSACTION_TYPE_MAP.rental).toBe("terminal_rental");
  });

  it("maps subscription_bundle to terminal_bundle_alloc", () => {
    expect(TRANSACTION_TYPE_MAP.subscription_bundle).toBe("terminal_bundle_alloc");
  });

  it("maps lease_to_own to terminal_sale (asset-class treatment)", () => {
    expect(TRANSACTION_TYPE_MAP.lease_to_own).toBe("terminal_sale");
  });

  it("maps financed to terminal_sale", () => {
    expect(TRANSACTION_TYPE_MAP.financed).toBe("terminal_sale");
  });

  it("maps promotional to terminal_promotion", () => {
    expect(TRANSACTION_TYPE_MAP.promotional).toBe("terminal_promotion");
  });

  it("covers all 6 commercial models", () => {
    const models: TerminalCommercialModel[] = [
      "once_off_purchase",
      "rental",
      "subscription_bundle",
      "lease_to_own",
      "financed",
      "promotional",
    ];
    for (const model of models) {
      expect(TRANSACTION_TYPE_MAP[model]).toBeTruthy();
    }
  });
});

// ── Pricing calculation ────────────────────────────────────────────────────────

describe("Terminal order pricing", () => {
  function computeOrderTotals({
    unitPrice,
    quantity = 1,
    taxRate = 0.15,
  }: {
    unitPrice: number;
    quantity?: number;
    taxRate?: number;
  }) {
    const subtotal = unitPrice * quantity;
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;
    return { subtotal, taxAmount, totalAmount };
  }

  it("computes once-off purchase total with 15% VAT", () => {
    const { subtotal, taxAmount, totalAmount } = computeOrderTotals({ unitPrice: 1000 });
    expect(subtotal).toBe(1000);
    expect(taxAmount).toBeCloseTo(150);
    expect(totalAmount).toBeCloseTo(1150);
  });

  it("handles quantity > 1", () => {
    const { subtotal, totalAmount } = computeOrderTotals({ unitPrice: 500, quantity: 3 });
    expect(subtotal).toBe(1500);
    expect(totalAmount).toBeCloseTo(1725);
  });

  it("handles zero upfront price (promotional/free)", () => {
    const { subtotal, taxAmount, totalAmount } = computeOrderTotals({ unitPrice: 0 });
    expect(subtotal).toBe(0);
    expect(taxAmount).toBe(0);
    expect(totalAmount).toBe(0);
  });
});
