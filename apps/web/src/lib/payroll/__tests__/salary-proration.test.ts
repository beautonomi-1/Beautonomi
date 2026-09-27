import { describe, expect, it } from "vitest";
import { prorateMonthlySalary } from "../salary-proration";

describe("prorateMonthlySalary", () => {
  it("pays full salary for full calendar month", () => {
    expect(prorateMonthlySalary(30_000, "2026-09-01", "2026-09-30")).toBe(30_000);
  });

  it("prorates partial month by 12/365", () => {
    const amount = prorateMonthlySalary(36_500, "2026-09-01", "2026-09-07");
    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThan(36_500);
  });

  it("returns 0 when employment ends before period", () => {
    expect(
      prorateMonthlySalary(10_000, "2026-09-01", "2026-09-30", {
        employmentEnd: "2026-08-15",
      }),
    ).toBe(0);
  });
});
