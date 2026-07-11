import { describe, it, expect } from "vitest";
import { escapeCsvCell, humanizeExportHeader } from "./export";

describe("export helpers", () => {
  it("quotes CSV cells with commas or quotes", () => {
    expect(escapeCsvCell('Say "hello", world')).toBe('"Say ""hello"", world"');
    expect(escapeCsvCell("plain")).toBe("plain");
  });

  it("humanizes known and camelCase headers", () => {
    expect(humanizeExportHeader("totalBookings")).toBe("Total bookings");
    expect(humanizeExportHeader("custom_metric")).toBe("Custom Metric");
  });
});
