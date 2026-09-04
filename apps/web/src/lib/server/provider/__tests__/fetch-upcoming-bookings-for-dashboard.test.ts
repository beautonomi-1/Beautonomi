import { describe, expect, it } from "vitest";
import { mapStatusToProvider } from "@/lib/utils/booking-status";
import {
  dashboardBookingLocationOrFilter,
  dashboardGroupBookingLocationOrFilter,
} from "../dashboard-booking-location-filter";
import {
  fetchUpcomingBookingsForDashboard,
  UPCOMING_BOOKING_DB_STATUSES,
} from "../fetch-upcoming-bookings-for-dashboard";

function thenableQuery(table: string, orCalls: Array<{ table: string; filter: string }>, error?: unknown) {
  const chain: {
    select: () => typeof chain;
    eq: () => typeof chain;
    is: () => typeof chain;
    in: () => typeof chain;
    gte: () => typeof chain;
    lte: () => typeof chain;
    order: () => typeof chain;
    limit: () => typeof chain;
    or: (filter: string) => typeof chain;
    then: (
      onfulfilled?: ((value: { data: unknown[]; error: unknown }) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null,
    ) => Promise<unknown>;
  } = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    or: (filter: string) => {
      orCalls.push({ table, filter });
      return chain;
    },
    then: (onfulfilled, onrejected) =>
      Promise.resolve({ data: [], error: error ?? null }).then(onfulfilled, onrejected),
  };
  return chain;
}

describe("fetch-upcoming-bookings-for-dashboard", () => {
  it("maps confirmed DB status to booked without excluding from provider display filter", () => {
    expect(mapStatusToProvider("confirmed")).toBe("booked");
    expect(UPCOMING_BOOKING_DB_STATUSES).toContain("confirmed");
    expect(UPCOMING_BOOKING_DB_STATUSES).toContain("in_progress");
    expect(UPCOMING_BOOKING_DB_STATUSES).toContain("pending_payment");
  });

  it("includes in_progress so started appointments are not dropped at SQL layer", () => {
    expect(UPCOMING_BOOKING_DB_STATUSES).toContain("in_progress");
    expect(mapStatusToProvider("in_progress")).toBe("started");
  });

  it("location filter keeps at-home and walk-in without branch", () => {
    const clause = dashboardBookingLocationOrFilter("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(clause).toContain("location_type.eq.at_home");
    expect(clause).toContain("booking_source.eq.walk_in");
  });

  it("queries group_bookings with the group location filter, not booking_source", async () => {
    const locationId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const orCalls: Array<{ table: string; filter: string }> = [];
    const supabase = {
      from(table: string) {
        return thenableQuery(table, orCalls);
      },
    };

    const result = await fetchUpcomingBookingsForDashboard(supabase as never, {
      providerId: "provider-1",
      timezone: "Africa/Johannesburg",
      locationId,
    });

    expect(result.bookings).toEqual([]);
    const groupOr = orCalls.find((call) => call.table === "group_bookings");
    expect(groupOr?.filter).toBe(dashboardGroupBookingLocationOrFilter(locationId));
    expect(groupOr?.filter).not.toContain("booking_source");
    expect(orCalls.some((call) => call.table === "bookings")).toBe(true);
  });

  it("retries bookings location filter when booking_source is rejected", async () => {
    const locationId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const orCalls: Array<{ table: string; filter: string }> = [];
    let bookingAttempts = 0;
    const supabase = {
      from(table: string) {
        if (table === "bookings") {
          bookingAttempts += 1;
          return thenableQuery(
            table,
            orCalls,
            bookingAttempts === 1 ? { code: "42703", message: "column booking_source does not exist" } : null,
          );
        }
        return thenableQuery(table, orCalls);
      },
    };

    await fetchUpcomingBookingsForDashboard(supabase as never, {
      providerId: "provider-1",
      timezone: "Africa/Johannesburg",
      locationId,
    });

    expect(orCalls.filter((call) => call.table === "bookings").length).toBeGreaterThan(1);
    expect(orCalls.some((call) => call.table === "bookings" && !call.filter.includes("booking_source"))).toBe(
      true,
    );
  });
});
