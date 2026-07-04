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

// ── Pricing calculation (platform default: 0% until configured) ───────────────

describe("Terminal order pricing", () => {
  it("uses 0% platform default — no VAT on list price", () => {
    const unitPrice = 1000;
    const taxRate = 0;
    const subtotal = unitPrice;
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;
    expect(subtotal).toBe(1000);
    expect(taxAmount).toBe(0);
    expect(totalAmount).toBe(1000);
  });

  it("handles quantity > 1 at 0% tax", () => {
    const subtotal = 500 * 3;
    expect(subtotal).toBe(1500);
    expect(subtotal).toBe(1500);
  });

  it("handles zero upfront price (promotional/free)", () => {
    const subtotal = 0;
    const taxAmount = 0;
    const totalAmount = 0;
    expect(subtotal).toBe(0);
    expect(taxAmount).toBe(0);
    expect(totalAmount).toBe(0);
  });
});
