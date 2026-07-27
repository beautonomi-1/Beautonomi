import { describe, expect, it, vi } from "vitest";

import {
  eachReportDateKey,
  filterLedgerRowsForLocation,
  filterProductOrdersForLocation,
  productOrderReportLocationId,
  reportDateRangeFromParams,
} from "./provider-report-utils";

describe("provider report utilities", () => {
  it("builds provider-timezone day boundaries instead of UTC calendar boundaries", () => {
    const params = new URLSearchParams({ from: "2026-04-30", to: "2026-04-30" });

    const range = reportDateRangeFromParams(params, "Africa/Johannesburg");

    expect(range.fromDate.toISOString()).toBe("2026-04-29T22:00:00.000Z");
    expect(range.toDate.toISOString()).toBe("2026-04-30T21:59:59.999Z");
    expect(range.fromYmd).toBe("2026-04-30");
    expect(range.toYmd).toBe("2026-04-30");
  });

  it("accepts ISO datetime params from provider web filters", () => {
    const params = new URLSearchParams({
      from: "2026-04-30T13:45:00.000Z",
      to: "2026-05-01T08:15:00.000Z",
    });

    const range = reportDateRangeFromParams(params, "Africa/Johannesburg");

    expect(range.fromDate.toISOString()).toBe("2026-04-29T22:00:00.000Z");
    expect(range.toDate.toISOString()).toBe("2026-05-01T21:59:59.999Z");
    expect(range.fromYmd).toBe("2026-04-30");
    expect(range.toYmd).toBe("2026-05-01");
  });

  it("enumerates report date keys without UTC drift", () => {
    expect(eachReportDateKey("2026-04-29", "2026-05-01")).toEqual([
      "2026-04-29",
      "2026-04-30",
      "2026-05-01",
    ]);
  });

  it("keeps booking-linked and product-order-linked rows for a selected location", async () => {
    const rows = [
      { id: "booking-ok", booking_id: "booking-1", product_order_id: null },
      { id: "booking-other", booking_id: "booking-2", product_order_id: null },
      { id: "order-ok", booking_id: null, product_order_id: "order-1" },
      { id: "provider-level", booking_id: null, product_order_id: null },
    ];
    const table = vi.fn((name: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: name === "provider_locations" ? { id: "location-1" } : null,
      }),
      in: vi.fn().mockResolvedValue({
        data: name === "bookings"
          ? [{ id: "booking-1" }]
          : [{ id: "order-1", fulfillment_type: "delivery", collection_location_id: null }],
      }),
    }));

    const filtered = await filterLedgerRowsForLocation(
      { from: table } as any,
      "provider-1",
      rows,
      "location-1",
    );

    expect(filtered.map((row) => row.id)).toEqual(["booking-ok", "order-ok"]);
    expect(table).toHaveBeenCalledWith("bookings");
    expect(table).toHaveBeenCalledWith("product_orders");
  });

  it("includes unattributed rows when unattributedRows is include", async () => {
    const rows = [
      { id: "booking-ok", booking_id: "booking-1", product_order_id: null },
      { id: "payout", booking_id: null, product_order_id: null },
    ];
    const table = vi.fn((name: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: name === "provider_locations" ? { id: "location-1" } : null,
      }),
      in: vi.fn().mockResolvedValue({
        data: name === "bookings" ? [{ id: "booking-1" }] : [],
      }),
    }));

    const filtered = await filterLedgerRowsForLocation(
      { from: table } as any,
      "provider-1",
      rows,
      "location-1",
      { unattributedRows: "include" },
    );

    expect(filtered.map((row) => row.id)).toEqual(["booking-ok", "payout"]);
  });

  it("attributes delivery product orders to the provider primary salon location for location reports", async () => {
    expect(
      productOrderReportLocationId(
        { id: "delivery-order", fulfillment_type: "delivery", collection_location_id: null },
        "primary-location",
      ),
    ).toBe("primary-location");
    expect(
      productOrderReportLocationId(
        { id: "collection-order", fulfillment_type: "collection", collection_location_id: "pickup-location" },
        "primary-location",
      ),
    ).toBe("pickup-location");
  });

  it("keeps delivery product orders when filtering by primary location", async () => {
    const orders = [
      { id: "delivery-ok", fulfillment_type: "delivery", collection_location_id: null },
      { id: "collection-ok", fulfillment_type: "collection", collection_location_id: "location-1" },
      { id: "collection-other", fulfillment_type: "collection", collection_location_id: "location-2" },
    ];
    const table = vi.fn((name: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: name === "provider_locations" ? { id: "location-1" } : null,
      }),
    }));

    const filtered = await filterProductOrdersForLocation(
      { from: table } as any,
      "provider-1",
      orders,
      "location-1",
    );

    expect(filtered.map((order) => order.id)).toEqual(["delivery-ok", "collection-ok"]);
  });
});
