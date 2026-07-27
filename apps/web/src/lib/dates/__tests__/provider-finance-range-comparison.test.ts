import { describe, expect, it } from "vitest";

import { resolveProviderFinanceRangeBounds } from "@/lib/dates/provider-finance-range";

describe("provider finance range comparison window", () => {
  it("places lastPeriodStart before the selected range start for month", () => {
    const now = new Date("2026-04-15T12:00:00.000Z");
    const bounds = resolveProviderFinanceRangeBounds("month", "Africa/Johannesburg", now);

    expect(bounds.comparable).toBe(true);
    expect(bounds.lastPeriodStart.getTime()).toBeLessThan(new Date(bounds.startIso).getTime());
    expect(bounds.lastPeriodEnd.getTime()).toBeLessThanOrEqual(new Date(bounds.startIso).getTime());
  });

  it("requires ledger fetch start to be min(startIso, lastPeriodStart) for growth", () => {
    const now = new Date("2026-04-15T12:00:00.000Z");
    const bounds = resolveProviderFinanceRangeBounds("month", "Africa/Johannesburg", now);
    const ledgerFetchStartIso = new Date(
      Math.min(new Date(bounds.startIso).getTime(), bounds.lastPeriodStart.getTime()),
    ).toISOString();

    expect(ledgerFetchStartIso).toBe(bounds.lastPeriodStart.toISOString());
    // Prior-period rows would be missing if fetch used startIso alone.
    expect(new Date(ledgerFetchStartIso).getTime()).toBeLessThan(new Date(bounds.startIso).getTime());
  });
});
