/**
 * Mirrors filtered summary math in more/transactions.tsx
 */
import { describe, it, expect } from "@jest/globals";

type Tx = { type: string; amount: number; sign?: number };

function signedContributionForSummary(t: Tx): number {
  if (t.type === "earning" || t.type === "tip") return t.amount;
  if (t.type === "payout" || t.type === "refund" || t.type === "fee") return -t.amount;
  if (t.type === "adjustment") return (t.sign ?? 1) * t.amount;
  return 0;
}

function computeFilteredSummary(filtered: Tx[]) {
  const totalIn = filtered
    .filter((t) => t.type === "earning" || t.type === "tip")
    .reduce((s, t) => s + t.amount, 0);
  const net = filtered.reduce((s, t) => s + signedContributionForSummary(t), 0);
  const totalOut = Math.max(0, totalIn - net);
  return { totalIn, totalOut, net };
}

describe("transaction filtered summary", () => {
  it("totalOut includes fees so in minus out equals net", () => {
    const filtered: Tx[] = [
      { type: "earning", amount: 100 },
      { type: "fee", amount: 10 },
      { type: "payout", amount: 50 },
    ];
    const { totalIn, totalOut, net } = computeFilteredSummary(filtered);
    expect(totalIn).toBe(100);
    expect(net).toBe(40);
    expect(totalOut).toBe(60);
    expect(totalIn - totalOut).toBe(net);
  });
});
