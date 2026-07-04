/**
 * Unit tests for terminal order tax totals (platform default tax engine).
 */

import { describe, expect, it } from "vitest";
import { computeTerminalOrderTotalsSync } from "@/lib/terminal/compute-terminal-order-totals";

describe("computeTerminalOrderTotalsSync", () => {
  it("defaults to 0% tax — total equals list price", () => {
    const { subtotal, taxAmount, totalAmount, taxRatePercent } = computeTerminalOrderTotalsSync({
      unitPrice: 1000,
    });
    expect(taxRatePercent).toBe(0);
    expect(subtotal).toBe(1000);
    expect(taxAmount).toBe(0);
    expect(totalAmount).toBe(1000);
  });

  it("handles quantity with zero tax", () => {
    const { subtotal, totalAmount } = computeTerminalOrderTotalsSync({
      unitPrice: 500,
      quantity: 3,
    });
    expect(subtotal).toBe(1500);
    expect(totalAmount).toBe(1500);
  });

  it("adds exclusive tax when platform rate is configured", () => {
    const { subtotal, taxAmount, totalAmount } = computeTerminalOrderTotalsSync({
      unitPrice: 1000,
      taxRatePercent: 15,
      taxIncluded: false,
    });
    expect(subtotal).toBe(1000);
    expect(taxAmount).toBeCloseTo(150);
    expect(totalAmount).toBeCloseTo(1150);
  });

  it("extracts tax from inclusive list price", () => {
    const { subtotal, taxAmount, totalAmount, taxIncluded } = computeTerminalOrderTotalsSync({
      unitPrice: 1150,
      taxRatePercent: 15,
      taxIncluded: true,
    });
    expect(taxIncluded).toBe(true);
    expect(totalAmount).toBe(1150);
    expect(subtotal).toBeCloseTo(1000);
    expect(taxAmount).toBeCloseTo(150);
  });

  it("handles zero unit price", () => {
    const { subtotal, taxAmount, totalAmount } = computeTerminalOrderTotalsSync({ unitPrice: 0 });
    expect(subtotal).toBe(0);
    expect(taxAmount).toBe(0);
    expect(totalAmount).toBe(0);
  });
});
