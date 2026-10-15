import { describe, expect, it } from "vitest";
import { publicStaffSubtitle } from "./publicStaffSubtitle";

describe("publicStaffSubtitle", () => {
  it("hides workplace permissions", () => {
    expect(publicStaffSubtitle("owner")).toBeNull();
    expect(publicStaffSubtitle("Owner")).toBeNull();
    expect(publicStaffSubtitle("OWNER")).toBeNull();
    expect(publicStaffSubtitle(" manager ")).toBeNull();
    expect(publicStaffSubtitle("employee")).toBeNull();
    expect(publicStaffSubtitle("admin")).toBeNull();
    expect(publicStaffSubtitle("provider_owner")).toBeNull();
    expect(publicStaffSubtitle("provider_manager")).toBeNull();
    expect(publicStaffSubtitle("provider_staff")).toBeNull();
  });

  it("hides the old public placeholders", () => {
    expect(publicStaffSubtitle("Staff")).toBeNull();
    expect(publicStaffSubtitle("Your specialist")).toBeNull();
  });

  it("returns nothing when the role is missing", () => {
    expect(publicStaffSubtitle(null)).toBeNull();
    expect(publicStaffSubtitle(undefined)).toBeNull();
    expect(publicStaffSubtitle("")).toBeNull();
    expect(publicStaffSubtitle("   ")).toBeNull();
  });

  it("keeps a subtitle that is not a workplace permission", () => {
    expect(publicStaffSubtitle("  Nail Technician  ")).toBe("Nail Technician");
  });
});
