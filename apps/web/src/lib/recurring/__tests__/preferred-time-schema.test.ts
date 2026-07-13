import { describe, expect, it } from "vitest";
import { preferredTimeSchema } from "../preferred-time-schema";

describe("preferredTimeSchema", () => {
  it("accepts HH:MM and HH:MM:SS", () => {
    expect(preferredTimeSchema.safeParse("09:30").success).toBe(true);
    expect(preferredTimeSchema.safeParse("23:59:59").success).toBe(true);
  });

  it("rejects invalid times", () => {
    expect(preferredTimeSchema.safeParse("25:99").success).toBe(false);
    expect(preferredTimeSchema.safeParse("9:30").success).toBe(false);
    expect(preferredTimeSchema.safeParse("").success).toBe(false);
  });
});
