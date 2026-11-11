import { describe, expect, it } from "vitest";
import { redactStaffPayFields } from "@/lib/auth/provider-team-roster-access";

describe("redactStaffPayFields", () => {
  it("clears pay fields that are present and leaves the rest of the row", () => {
    const row = redactStaffPayFields(
      { id: "s2", name: "Other", commission_rate: 40 },
      false,
    );
    expect(row).toEqual({ id: "s2", name: "Other", commission_rate: null });
  });

  it("keeps pay fields when the viewer may see them", () => {
    expect(redactStaffPayFields({ commission_rate: 40, time_clock_pin: "1234" }, true)).toEqual({
      commission_rate: 40,
      time_clock_pin: "1234",
    });
  });
});
