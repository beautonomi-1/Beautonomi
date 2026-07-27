import {
  dashboardBookingLocationOrFilter,
  dashboardGroupBookingLocationOrFilter,
  groupMatchesDashboardLocation,
} from "@/lib/server/provider/dashboard-booking-location-filter";

/** DB statuses that require provider review (confirm / decline). */
export const PENDING_REVIEW_DB_STATUSES = ["pending", "pending_payment"] as const;

export type PendingVisibilityReason =
  | "visible"
  | "group_child"
  | "group_parent_status_mismatch"
  | "group_parent_location_filtered"
  | "group_parent_missing";

type ScopedQuery = {
  in: (col: string, values: readonly string[]) => ScopedQuery;
  is: (col: string, value: null) => ScopedQuery;
  or: (filter: string) => ScopedQuery;
};

/**
 * Standalone pending bookings only — group children are represented by their
 * parent `group_bookings` row in the provider list.
 */
export function applyPendingBookingsScope<Q extends ScopedQuery>(
  query: Q,
  locationId?: string | null,
): Q {
  let q = query
    .in("status", [...PENDING_REVIEW_DB_STATUSES])
    .is("group_booking_id", null) as Q;
  if (locationId) {
    q = q.or(dashboardBookingLocationOrFilter(locationId)) as Q;
  }
  return q;
}

/** Pending group parents (`group_bookings.status = pending`). */
export function applyPendingGroupsScope<Q extends ScopedQuery>(
  query: Q,
  locationId?: string | null,
): Q {
  let q = query.in("status", ["pending"]) as Q;
  if (locationId) {
    q = q.or(dashboardGroupBookingLocationOrFilter(locationId)) as Q;
  }
  return q;
}
export function classifyPendingBookingVisibility(input: {
  booking: {
    id: string;
    status: string;
    group_booking_id?: string | null;
    booking_number?: string | null;
    scheduled_at?: string | null;
  };
  groupBooking?: {
    id: string;
    status: string;
    location_id?: string | null;
    location_type?: string | null;
    ref_number?: string | null;
  } | null;
  locationId?: string | null;
}): {
  list_visibility: PendingVisibilityReason;
  would_count_in_nav: boolean;
  would_show_in_list: boolean;
} {
  const { booking, groupBooking, locationId } = input;

  if (booking.group_booking_id) {
    if (!groupBooking) {
      return {
        list_visibility: "group_parent_missing",
        would_count_in_nav: false,
        would_show_in_list: false,
      };
    }
    if (!groupMatchesDashboardLocation(locationId, groupBooking)) {
      return {
        list_visibility: "group_parent_location_filtered",
        would_count_in_nav: false,
        would_show_in_list: false,
      };
    }
    const parentPending = groupBooking.status === "pending";
    if (!parentPending) {
      return {
        list_visibility: "group_parent_status_mismatch",
        would_count_in_nav: false,
        would_show_in_list: false,
      };
    }
    return {
      list_visibility: "visible",
      would_count_in_nav: false,
      would_show_in_list: true,
    };
  }

  return {
    list_visibility: "visible",
    would_count_in_nav: true,
    would_show_in_list: true,
  };
}
