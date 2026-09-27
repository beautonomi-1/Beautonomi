import { describe, it, expect } from "vitest";
import { estimateZaPaye } from "../jurisdictions/packs/za";

const brackets2026 = [
  { upTo: 237_100, rate: 18, base: 0 },
  { upTo: 370_500, rate: 26, base: 42_678 },
  { upTo: 512_800, rate: 31, base: 77_362 },
  { upTo: 673_000, rate: 36, base: 121_475 },
  { upTo: 857_900, rate: 39, base: 179_147 },
  { upTo: 1_817_000, rate: 41, base: 251_258 },
  { upTo: null, rate: 45, base: 644_489 },
];

const rebates = { primary: 17_235, secondary: 26_679, tertiary: 29_877 };

describe("estimateZaPaye", () => {
  it("computes monthly PAYE for mid-bracket annual income", () => {
    const monthly = estimateZaPaye(30_000, 12, brackets2026, rebates);
    expect(monthly).toBeGreaterThan(0);
    expect(monthly).toBeLessThan(30_000);
  });

  it("returns zero monthly PAYE below rebate threshold", () => {
    const monthly = estimateZaPaye(500, 12, brackets2026, rebates);
    expect(monthly).toBe(0);
  });

  it("matches SARS-style annual tax on R300k (before rebate)", () => {
    const monthly = estimateZaPaye(25_000, 12, brackets2026, { primary: 0, secondary: 0, tertiary: 0 });
    // Seeded bracket base 42678 + 26% * (300000 - 237100) = 59032 annual → 4919.33/mo
    expect(monthly).toBeCloseTo(4919.33, 1);
  });

  it("uses secondary rebate for age 65+", () => {
    const young = estimateZaPaye(25_000, 12, brackets2026, rebates, 30);
    const senior = estimateZaPaye(25_000, 12, brackets2026, rebates, 66);
    expect(senior).toBeLessThanOrEqual(young);
  });
});
