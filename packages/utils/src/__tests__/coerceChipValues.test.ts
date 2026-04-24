import { describe, it, expect } from "vitest";
import {
  coerceChipMultiValue,
  coerceChipSingleRow,
  coerceProfileStringList,
} from "../coerceChipValues";

describe("coerceChipMultiValue", () => {
  it("returns empty for non-arrays", () => {
    expect(coerceChipMultiValue(null)).toEqual([]);
    expect(coerceChipMultiValue(undefined)).toEqual([]);
    expect(coerceChipMultiValue("x")).toEqual([]);
    expect(coerceChipMultiValue({})).toEqual([]);
  });

  it("keeps strings and coerces numbers", () => {
    expect(coerceChipMultiValue([" Hair ", "Nails", 42])).toEqual(["Hair", "Nails", "42"]);
  });

  it("drops null/empty after trim", () => {
    expect(coerceChipMultiValue(["", "  ", null, "ok"])).toEqual(["ok"]);
  });
});

describe("coerceChipSingleRow", () => {
  it("returns empty for nullish or blank", () => {
    expect(coerceChipSingleRow(null)).toEqual([]);
    expect(coerceChipSingleRow("")).toEqual([]);
    expect(coerceChipSingleRow("   ")).toEqual([]);
  });

  it("trims one value", () => {
    expect(coerceChipSingleRow("  hello  ")).toEqual(["hello"]);
    expect(coerceChipSingleRow(99)).toEqual(["99"]);
  });
});

describe("coerceProfileStringList", () => {
  it("skips objects and null", () => {
    expect(coerceProfileStringList(["a", null, { x: 1 }, " b "])).toEqual(["a", "b"]);
  });

  it("keeps numbers as string tokens", () => {
    expect(coerceProfileStringList([1, true, "x"])).toEqual(["1", "true", "x"]);
  });
});
