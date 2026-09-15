import { describe, expect, it } from "vitest";
import { appleLedgerRowProceeds } from "../settlement-import";

describe("appleLedgerRowProceeds", () => {
  it("uses net when non-zero (legacy rows)", () => {
    expect(appleLedgerRowProceeds({ amount: 100, fees: 15, net: 85 })).toBe(85);
  });

  it("uses amount minus fees when Phase 11 net is zero", () => {
    expect(appleLedgerRowProceeds({ amount: 100, fees: 15, net: 0 })).toBe(85);
  });

  it("returns zero when amount does not exceed fees", () => {
    expect(appleLedgerRowProceeds({ amount: 10, fees: 15, net: 0 })).toBe(0);
  });
});
