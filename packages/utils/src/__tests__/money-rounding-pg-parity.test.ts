import { describe, it, expect } from "vitest";
import { percentOf, roundCurrency, toMinorUnits, multiplyMoney } from "../money";

/**
 * Reference decimal implementation of Postgres `ROUND(numeric, 2)` for
 * `amount * rate / 100` using BigInt so no float is involved.
 *
 * amountCents: integer cents (2dp amount)
 * rateMilli:   rate percent * 1000 (so up to 3dp rates)
 *
 * exact cents = amountCents * rateMilli / 100_000; round half away from zero.
 */
function pgPercentCents(amountCents: bigint, rateMilli: bigint): bigint {
  const num = amountCents * rateMilli;
  const den = 100_000n;
  const neg = num < 0n;
  const absNum = neg ? -num : num;
  let q = absNum / den;
  const rem = absNum % den;
  if (rem * 2n >= den) q += 1n;
  return neg ? -q : q;
}

/** mulberry32 — deterministic PRNG so the table is reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("rounding parity with Postgres ROUND(numeric, 2) — half away from zero", () => {
  // Known cases from the audit (04 §6) where float-then-round disagreed with PG.
  const table: Array<[number, number, number]> = [
    // [amount, ratePercent, expected]
    [4304.36, 12.5, 538.05],
    [7731.5, 15, 1159.73],
    [13.24, 15, 1.99],
    [25.33, 12.5, 3.17],
    [0.01, 15, 0],
    [0.03, 15, 0],
    [0.04, 15, 0.01],
    [100, 15, 15],
    [333.33, 15, 50],
    [1.005, 100, 1.01],
  ];

  it.each(table)("percentOf(%s, %s) === %s", (amount, rate, expected) => {
    expect(percentOf(amount, rate, "ZAR")).toBe(expected);
  });

  it("roundCurrency rounds a float product the same way PG rounds the exact decimal", () => {
    expect(roundCurrency(4304.36 * 0.125, "ZAR")).toBe(538.05);
    expect(roundCurrency(7731.5 * 0.15, "ZAR")).toBe(1159.73);
    expect(roundCurrency(538.045, "ZAR")).toBe(538.05);
    expect(roundCurrency(8.325, "ZAR")).toBe(8.33);
    expect(roundCurrency(1.005, "ZAR")).toBe(1.01);
    expect(roundCurrency(2.675, "ZAR")).toBe(2.68);
    expect(roundCurrency(1234.565, "ZAR")).toBe(1234.57);
  });

  it("roundCurrency rounds half away from zero for negatives (PG semantics, not Math.round)", () => {
    expect(roundCurrency(-2.675, "ZAR")).toBe(-2.68);
    expect(roundCurrency(-0.005, "ZAR")).toBe(-0.01);
    expect(roundCurrency(-538.045, "ZAR")).toBe(-538.05);
    expect(roundCurrency(-1.5, "JPY")).toBe(-2);
    expect(Object.is(roundCurrency(0, "ZAR"), 0)).toBe(true);
  });

  it("toMinorUnits uses the same decimal-safe rounding", () => {
    expect(toMinorUnits(538.045, "ZAR")).toBe(53805);
    expect(toMinorUnits(8.325, "ZAR")).toBe(833);
    expect(toMinorUnits(-8.325, "ZAR")).toBe(-833);
    expect(toMinorUnits(10.005, "ZAR")).toBe(1001);
  });

  it("multiplyMoney agrees with percentOf", () => {
    expect(multiplyMoney(4304.36, 0.125, "ZAR")).toBe(538.05);
    expect(multiplyMoney(7731.5, 0.15, "ZAR")).toBe(1159.73);
  });

  it("property: percentOf matches the reference decimal implementation on 20 000 random cases", () => {
    const rand = mulberry32(0xbeef);
    const rates = [15, 12.5, 7.5, 3.9, 20, 2.95, 0.5, 100, 33.333, 1.75];
    let mismatches = 0;
    const examples: string[] = [];
    for (let i = 0; i < 20_000; i++) {
      const cents = Math.floor(rand() * 999_999) + 1; // 0.01 .. 9 999.99
      const rate = rates[Math.floor(rand() * rates.length)]!;
      const amount = cents / 100;
      const expected = Number(pgPercentCents(BigInt(cents), BigInt(Math.round(rate * 1000)))) / 100;
      const actual = percentOf(amount, rate, "ZAR");
      if (actual !== expected) {
        mismatches++;
        if (examples.length < 5) examples.push(`${amount} × ${rate}% → ${actual} (pg ${expected})`);
      }
    }
    expect(mismatches, examples.join("; ")).toBe(0);
  });

  it("property: roundCurrency(amount * rate / 100) matches the reference on 20 000 random cases", () => {
    const rand = mulberry32(0xcafe);
    const rates = [15, 12.5, 7.5, 3.9, 20, 2.95, 0.5, 100, 1.75];
    let mismatches = 0;
    const examples: string[] = [];
    for (let i = 0; i < 20_000; i++) {
      const cents = Math.floor(rand() * 999_999) + 1;
      const rate = rates[Math.floor(rand() * rates.length)]!;
      const amount = cents / 100;
      const expected = Number(pgPercentCents(BigInt(cents), BigInt(Math.round(rate * 1000)))) / 100;
      const actual = roundCurrency((amount * rate) / 100, "ZAR");
      if (actual !== expected) {
        mismatches++;
        if (examples.length < 5) examples.push(`${amount} × ${rate}% → ${actual} (pg ${expected})`);
      }
    }
    expect(mismatches, examples.join("; ")).toBe(0);
  });
});
