import { describe, it, expect } from "vitest";
import { safeNum } from "../safeNum";

describe("safeNum", () => {
  it("returns finite numbers unchanged", () => {
    expect(safeNum(0)).toBe(0);
    expect(safeNum(1.5)).toBe(1.5);
    expect(safeNum(-42)).toBe(-42);
  });

  it("coerces numeric strings", () => {
    expect(safeNum("0")).toBe(0);
    expect(safeNum("1.5")).toBe(1.5);
    expect(safeNum("-42")).toBe(-42);
  });

  it("falls back to 0 for NaN / Infinity / junk inputs", () => {
    expect(safeNum(NaN)).toBe(0);
    expect(safeNum(Infinity)).toBe(0);
    expect(safeNum(-Infinity)).toBe(0);
    expect(safeNum("")).toBe(0);
    expect(safeNum("abc")).toBe(0);
    expect(safeNum(null)).toBe(0);
    expect(safeNum(undefined)).toBe(0);
    expect(safeNum({})).toBe(0);
  });

  it("handles whitespace strings correctly", () => {
    // Number(" 42 ") === 42, which is the runtime-consistent behaviour
    // we want — anything JavaScript itself coerces to a finite number
    // passes through.
    expect(safeNum(" 42 ")).toBe(42);
    expect(safeNum("   ")).toBe(0);
  });
});
