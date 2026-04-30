import { describe, it, expect } from "vitest";
import {
  mergeLedgerRowsByIdPreferProvider,
  normalizeAdminLedgerRange,
  resolveFinanceLedgerRowCustomerId,
  resolveFinanceLedgerRowProviderId,
} from "./finance-ledger-tenant";

describe("mergeLedgerRowsByIdPreferProvider", () => {
  it("dedupes by id with provider path winning", () => {
    const provider = [{ id: "a", amount: 1 }];
    const booking = [{ id: "a", amount: 99 }, { id: "b", amount: 2 }];
    const out = mergeLedgerRowsByIdPreferProvider(provider, booking);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.id === "a")?.amount).toBe(1);
    expect(out.find((r) => r.id === "b")?.amount).toBe(2);
  });

  it("returns only booking rows when provider list is empty", () => {
    const out = mergeLedgerRowsByIdPreferProvider([], [{ id: "x", amount: 5 }]);
    expect(out).toEqual([{ id: "x", amount: 5 }]);
  });
});

describe("normalizeAdminLedgerRange", () => {
  it("expands date-only admin filters to inclusive UTC day bounds", () => {
    expect(normalizeAdminLedgerRange({ start: "2026-04-30", end: "2026-04-30" })).toEqual({
      start: "2026-04-30T00:00:00.000Z",
      end: "2026-04-30T23:59:59.999Z",
    });
  });

  it("keeps explicit timestamps unchanged", () => {
    expect(
      normalizeAdminLedgerRange({
        start: "2026-04-29T22:00:00.000Z",
        end: "2026-04-30T21:59:59.999Z",
      }),
    ).toEqual({
      start: "2026-04-29T22:00:00.000Z",
      end: "2026-04-30T21:59:59.999Z",
    });
  });
});

describe("resolveFinanceLedgerRowProviderId", () => {
  it("prefers direct provider_id on the row", () => {
    expect(
      resolveFinanceLedgerRowProviderId({
        id: "1",
        provider_id: "p1",
        booking: { provider_id: "p2" },
      }),
    ).toBe("p1");
  });

  it("falls back to booking.provider_id", () => {
    expect(
      resolveFinanceLedgerRowProviderId({
        id: "1",
        booking: { provider_id: "p2" },
      }),
    ).toBe("p2");
  });
});

describe("resolveFinanceLedgerRowCustomerId", () => {
  it("reads customer_id from booking embed", () => {
    expect(
      resolveFinanceLedgerRowCustomerId({
        id: "1",
        booking: { customer_id: "u1" },
      }),
    ).toBe("u1");
  });

  it("returns null when missing", () => {
    expect(resolveFinanceLedgerRowCustomerId({ id: "1", booking: {} })).toBeNull();
  });
});
