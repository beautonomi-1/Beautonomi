import { describe, expect, it, vi } from "vitest";
import {
  getProviderGamificationEarnings,
  sumProviderGamificationLedgerNet,
} from "../sum-gamification-ledger-net";

vi.mock("@/lib/reports/fetch-all-ledger-pages", () => ({
  fetchAllLedgerPages: vi.fn(),
}));

import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";

const mockFetch = vi.mocked(fetchAllLedgerPages);

const db = {
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          order: () => ({}),
        }),
      }),
    }),
  }),
} as any;

describe("getProviderGamificationEarnings", () => {
  it("returns recognized revenue and net after refunds (finance-aligned)", async () => {
    mockFetch.mockResolvedValueOnce([
      { net: 100, amount: 100, transaction_type: "provider_earnings", refund_component: null },
      { net: 20, amount: 20, transaction_type: "tip", refund_component: null },
      { net: 15, amount: 15, transaction_type: "travel_fee", refund_component: null },
      { net: -30, amount: -30, transaction_type: "refund", refund_component: "provider_earnings" },
      { net: -12, amount: -12, transaction_type: "refund", refund_component: "platform_fee" },
    ]);

    const result = await getProviderGamificationEarnings(db, "p");

    expect(result.recognized_revenue).toBe(135);
    expect(result.refund_deduction).toBe(30);
    expect(result.net_earnings_after_refunds).toBe(105);
  });

  it("includes walk-in additional charges in recognized revenue", async () => {
    mockFetch.mockResolvedValueOnce([
      { net: 50, amount: 50, transaction_type: "provider_earnings", refund_component: null },
      { net: 25, amount: 25, transaction_type: "walk_in_additional_charge", refund_component: null },
    ]);

    const result = await getProviderGamificationEarnings(db, "p");
    expect(result.recognized_revenue).toBe(75);
  });
});

describe("sumProviderGamificationLedgerNet", () => {
  it("returns recognized revenue for backward compatibility", async () => {
    mockFetch.mockResolvedValueOnce([
      { net: 200, amount: 200, transaction_type: "provider_earnings", refund_component: null },
    ]);

    const total = await sumProviderGamificationLedgerNet(db, "p");
    expect(total).toBe(200);
  });
});
