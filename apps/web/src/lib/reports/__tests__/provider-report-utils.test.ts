import { describe, expect, it } from "vitest";

import {
  eachReportDateKey,
  reportDateKey,
  summarizeLedgerLocationAttribution,
} from "../provider-report-utils";

describe("provider-report-utils", () => {
  it("reportDateKey buckets by provider civil calendar, not UTC midnight split", () => {
    const utcInstant = "2025-06-15T22:30:00.000Z";
    expect(reportDateKey(utcInstant, "Africa/Johannesburg")).toBe("2025-06-16");
    expect(new Date(utcInstant).toISOString().slice(0, 10)).toBe("2025-06-15");
  });

  it("eachReportDateKey returns inclusive YMD sequence", () => {
    expect(eachReportDateKey("2025-01-01", "2025-01-03")).toEqual([
      "2025-01-01",
      "2025-01-02",
      "2025-01-03",
    ]);
  });

  it("eachReportDateKey returns empty for inverted range", () => {
    expect(eachReportDateKey("2025-02-01", "2025-01-01")).toEqual([]);
  });

  it("summarizes unattributed provider-level ledger rows under location filters", () => {
    expect(
      summarizeLedgerLocationAttribution(
        [
          { booking_id: "booking-1" },
          { product_order_id: "order-1" },
          { booking_id: null, product_order_id: null },
        ],
        "location-1",
      ),
    ).toMatchObject({
      scopedByLocation: true,
      excludedUnattributedRows: 1,
    });
  });
});
