import { describe, expect, it } from "vitest";
import { mapMoneySqlError } from "../map-money-sql-error";

describe("mapMoneySqlError", () => {
  it("maps payout INVALID_STATUS (F4-02) to 400", () => {
    const mapped = mapMoneySqlError({ message: "INVALID_STATUS", code: "P0001" });
    expect(mapped).toMatchObject({ code: "INVALID_STATUS", status: 400 });
  });

  it("maps fail-closed ledger posting (F2-31) to 409", () => {
    const mapped = mapMoneySqlError({
      message: "finance ledger posting failed for booking abc payment def: boom",
      code: "P0001",
    });
    expect(mapped).toMatchObject({ code: "LEDGER_POSTING_FAILED", status: 409 });
    expect(mapped?.message).toMatch(/ledger/i);
  });

  it("maps over-refund check_violation (F2-22) to 400 OVER_REFUND", () => {
    const mapped = mapMoneySqlError({
      message: "new_total_refunded exceeds collected",
      code: "23514",
    });
    expect(mapped).toMatchObject({ code: "OVER_REFUND", status: 400 });
  });

  it("maps generic CHECK constraints (F3-01) to 400 VALIDATION_ERROR", () => {
    const mapped = mapMoneySqlError({
      message: 'new row for relation "products" violates check constraint "products_retail_price_range"',
      code: "23514",
    });
    expect(mapped).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("maps locked financial period (F2-49) to 409", () => {
    const mapped = mapMoneySqlError({
      message: "financial period is locked for this tenant",
      code: "P0001",
    });
    expect(mapped).toMatchObject({ code: "PERIOD_LOCKED", status: 409 });
  });

  it("returns null for unrelated errors", () => {
    expect(mapMoneySqlError({ message: "column does not exist", code: "42703" })).toBeNull();
    expect(mapMoneySqlError(null)).toBeNull();
  });
});
