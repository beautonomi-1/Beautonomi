import { beforeAll, describe, expect, it } from "vitest";
import { initI18n } from "@beautonomi/i18n";
import { escapeCsvCell, humanizeExportHeader } from "./export";

beforeAll(() => {
  initI18n("en");
});

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
