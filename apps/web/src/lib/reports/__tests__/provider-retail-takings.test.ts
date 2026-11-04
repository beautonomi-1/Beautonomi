import { describe, expect, it } from "vitest";
import { addDaysToYmd } from "@/lib/dates/provider-tz";
import { providerRetailTakingsAmount } from "@/lib/reports/provider-retail-takings";

describe("provider-retail-takings date keys", () => {
  it("addDaysToYmd extends windows for 7-day retail week totals", () => {
    expect(addDaysToYmd("2026-06-01", 6)).toBe("2026-06-07");
  });

  it("counts till cash only and leaves platform-held money in earnings", () => {
    expect(
      providerRetailTakingsAmount({
        total_amount: 100,
        wallet_amount: 40,
        payment_method: "yoco",
      }),
    ).toBe(60);
    expect(
      providerRetailTakingsAmount({
        total_amount: 100,
        payment_method: "paystack",
      }),
    ).toBe(0);
    expect(
      providerRetailTakingsAmount({
        total_amount: 80,
        payment_method: "cash",
      }),
    ).toBe(80);
  });
});
