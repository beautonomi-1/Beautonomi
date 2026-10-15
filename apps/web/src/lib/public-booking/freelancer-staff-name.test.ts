import { describe, expect, it } from "vitest";
import { freelancerPublicStaffName } from "./freelancer-staff-name";

describe("freelancerPublicStaffName", () => {
  it("uses the person's name when the staff row stored the business name", () => {
    expect(
      freelancerPublicStaffName({
        staffName: "Lindi Nails",
        personName: "Lindi Dlamini",
        businessName: "Lindi Nails",
      }),
    ).toBe("Lindi Dlamini");
  });

  it("uses the person's name when the staff row stored the Owner placeholder", () => {
    expect(
      freelancerPublicStaffName({
        staffName: "Owner",
        personName: "Lindi Dlamini",
        businessName: "Lindi Nails",
      }),
    ).toBe("Lindi Dlamini");
  });

  it("keeps a staff name the freelancer set themselves", () => {
    expect(
      freelancerPublicStaffName({
        staffName: "Lindi",
        personName: "Lindi Dlamini",
        businessName: "Lindi Nails",
      }),
    ).toBe("Lindi");
  });

  it("falls back to the business name when no person name was captured", () => {
    expect(
      freelancerPublicStaffName({
        staffName: "Lindi Nails",
        personName: null,
        businessName: "Lindi Nails",
      }),
    ).toBe("Lindi Nails");
  });
});
