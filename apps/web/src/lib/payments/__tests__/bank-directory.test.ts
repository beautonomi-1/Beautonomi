import { describe, expect, it } from "vitest";
import {
  normalizePaystackBankList,
  resolveIsoCountry,
  staticFallbackBanks,
} from "../bank-directory";

describe("bank-directory", () => {
  it("resolveIsoCountry maps Paystack slug to ISO", () => {
    expect(resolveIsoCountry("south africa", "ZA")).toBe("ZA");
    expect(resolveIsoCountry("NG", "ZA")).toBe("NG");
  });

  it("staticFallbackBanks uses basa for ZA", () => {
    const banks = staticFallbackBanks("ZA", "ZAR");
    expect(banks[0]?.type).toBe("basa");
    expect(banks.length).toBeGreaterThan(5);
  });

  it("normalizePaystackBankList unwraps nested Paystack data", () => {
    expect(normalizePaystackBankList({ data: [{ code: "1" }] })).toEqual([{ code: "1" }]);
    expect(normalizePaystackBankList([{ code: "2" }])).toEqual([{ code: "2" }]);
  });
});
