import { describe, expect, it } from "vitest";
import { timingSafeEqualUtf8 } from "../cron-auth";

describe("timingSafeEqualUtf8 (F3-26)", () => {
  it("returns true for identical strings of any length", () => {
    expect(timingSafeEqualUtf8("", "")).toBe(true);
    expect(timingSafeEqualUtf8("Bearer secret", "Bearer secret")).toBe(true);
  });

  it("returns false for different values including length mismatches", () => {
    expect(timingSafeEqualUtf8("Bearer a", "Bearer b")).toBe(false);
    expect(timingSafeEqualUtf8("Bearer secret", "Bearer")).toBe(false);
    expect(timingSafeEqualUtf8("Bearer secret", "")).toBe(false);
  });
});
