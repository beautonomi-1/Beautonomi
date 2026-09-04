import { describe, expect, it, vi } from "vitest";

import {
  filterLedgerRowsByScope,
  ledgerRowMatchesLocation,
  resolveLedgerLocationScope,
} from "./provider-ledger-location-scope";

describe("provider ledger location scope", () => {
  it("includes at-home bookings with null location_id under a selected branch", async () => {
    const rows = [
      { id: "at-home", booking_id: "booking-at-home", product_order_id: null },
      { id: "other-branch", booking_id: "booking-other", product_order_id: null },
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
        data: name === "bookings" ? [{ id: "booking-at-home" }] : [],
      }),
    }));

    const scope = await resolveLedgerLocationScope(
      { from: table } as any,
      "provider-1",
      rows,
      "location-1",
      { unattributedRows: "include" },
    );

    expect(filterLedgerRowsByScope(rows, scope).map((r) => r.id)).toEqual(["at-home"]);
  });

  it("includes unattributed payout rows when unattributedRows is include", async () => {
    const rows = [
      { id: "payout", booking_id: null, product_order_id: null },
      { id: "earning", booking_id: "booking-1", product_order_id: null },
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

    const scope = await resolveLedgerLocationScope(
      { from: table } as any,
      "provider-1",
      rows,
      "location-1",
      { unattributedRows: "include" },
    );

    expect(filterLedgerRowsByScope(rows, scope).map((r) => r.id)).toEqual(["payout", "earning"]);
  });

  it("retries the booking location filter when booking_source is rejected", async () => {
    const rows = [{ id: "earning", booking_id: "booking-1", product_order_id: null }];
    let bookingLookups = 0;
    const table = vi.fn((name: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data: name === "provider_locations" ? { id: "location-1" } : null,
          }),
        in: () => {
          if (name === "bookings") {
            bookingLookups += 1;
            if (bookingLookups === 1) {
              return Promise.resolve({ data: null, error: { code: "42703" } });
            }
            return Promise.resolve({ data: [{ id: "booking-1" }] });
          }
          return Promise.resolve({ data: [] });
        },
      };
      return chain;
    });

    const scope = await resolveLedgerLocationScope(
      { from: table } as never,
      "provider-1",
      rows,
      "location-1",
    );

    expect(bookingLookups).toBeGreaterThan(1);
    expect(filterLedgerRowsByScope(rows, scope).map((r) => r.id)).toEqual(["earning"]);
  });

  it("excludes unattributed payout rows when unattributedRows is exclude", async () => {
    const scope = {
      scopedByLocation: true,
      locationId: "location-1",
      allowedBookingIds: new Set<string>(),
      allowedOrderIds: new Set<string>(),
      primaryLocationId: "location-1",
      unattributedRows: "exclude" as const,
    };

    expect(
      ledgerRowMatchesLocation({ booking_id: null, product_order_id: null }, scope, {
        unattributedRows: "exclude",
      }),
    ).toBe(false);
  });
});
