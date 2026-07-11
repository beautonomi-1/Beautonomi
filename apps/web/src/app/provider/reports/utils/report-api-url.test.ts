import { describe, it, expect } from "vitest";
import { appendReportDateParams } from "./report-api-url";

describe("appendReportDateParams", () => {
  it("writes inclusive civil dates as YYYY-MM-DD (not UTC ISO timestamps)", () => {
    const params = new URLSearchParams();
    appendReportDateParams(params, {
      from: new Date(2026, 6, 1, 0, 0, 0),
      to: new Date(2026, 6, 11, 23, 59, 59),
    });
    expect(params.get("from")).toBe("2026-07-01");
    expect(params.get("to")).toBe("2026-07-11");
    expect(params.get("from")).not.toContain("T");
    expect(params.get("to")).not.toContain("T");
  });

  it("omits missing bounds", () => {
    const params = new URLSearchParams();
    appendReportDateParams(params, { from: new Date(2026, 0, 5) });
    expect(params.get("from")).toBe("2026-01-05");
    expect(params.get("to")).toBeNull();
  });
});
