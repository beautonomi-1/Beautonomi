import { describe, it, expect } from "vitest";
import { isPostgresUniqueViolation } from "@/lib/payment/webhook-idempotency";

describe("isPostgresUniqueViolation", () => {
  it("detects 23505", () => {
    expect(isPostgresUniqueViolation({ code: "23505" })).toBe(true);
  });
  it("detects duplicate message", () => {
    expect(isPostgresUniqueViolation({ message: "duplicate key value" })).toBe(true);
  });
  it("returns false for null", () => {
    expect(isPostgresUniqueViolation(null)).toBe(false);
  });
});
