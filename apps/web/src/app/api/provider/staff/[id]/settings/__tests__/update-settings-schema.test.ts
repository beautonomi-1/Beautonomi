import { describe, expect, it } from "vitest";
import { z } from "zod";

/** Mirrors bookable_from on updateSettingsSchema in settings/route.ts */
const bookableFromField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();

describe("staff settings bookable_from", () => {
  it("accepts YYYY-MM-DD or null", () => {
    expect(bookableFromField.parse("2026-12-01")).toBe("2026-12-01");
    expect(bookableFromField.parse(null)).toBeNull();
    expect(bookableFromField.parse(undefined)).toBeUndefined();
  });

  it("rejects empty string and invalid dates", () => {
    expect(bookableFromField.safeParse("").success).toBe(false);
    expect(bookableFromField.safeParse("2026/12/01").success).toBe(false);
  });
});
