import { describe, expect, it } from "vitest";
import {
  MAX_CLIENT_AMOUNT_MAJOR,
  MIN_ADS_CPC_BUDGET_MAJOR,
  adsCpcBudgetError,
  clientMajorAmountSchema,
} from "../client-amount-bounds";

describe("adsCpcBudgetError (F3-09)", () => {
  it("allows unpaid draft budget 0", () => {
    expect(adsCpcBudgetError(0)).toBeNull();
  });

  it("rejects below the floor and above the ceiling", () => {
    expect(adsCpcBudgetError(MIN_ADS_CPC_BUDGET_MAJOR - 1)).toMatch(/between/i);
    expect(adsCpcBudgetError(MAX_CLIENT_AMOUNT_MAJOR + 1)).toMatch(/between/i);
  });

  it("rejects more than 2 decimal places", () => {
    expect(adsCpcBudgetError(10.123)).toMatch(/decimal/i);
  });

  it("accepts a normal CPC budget", () => {
    expect(adsCpcBudgetError(250.5)).toBeNull();
    expect(adsCpcBudgetError(MIN_ADS_CPC_BUDGET_MAJOR)).toBeNull();
    expect(adsCpcBudgetError(MAX_CLIENT_AMOUNT_MAJOR)).toBeNull();
  });
});

describe("clientMajorAmountSchema", () => {
  it("rejects non-positive and oversized amounts", () => {
    expect(clientMajorAmountSchema.safeParse(0).success).toBe(false);
    expect(clientMajorAmountSchema.safeParse(-1).success).toBe(false);
    expect(clientMajorAmountSchema.safeParse(MAX_CLIENT_AMOUNT_MAJOR + 1).success).toBe(false);
    expect(clientMajorAmountSchema.safeParse(50).success).toBe(true);
  });
});
