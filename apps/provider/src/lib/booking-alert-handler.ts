export interface BookingAlertRow {
  id: string;
  group_booking_id?: string | null;
  status: string;
  db_status?: string | null;
  booking_number?: string;
  customer_id?: string;
  scheduled_at?: string;
}

export function shouldAlertForBooking(row: BookingAlertRow): boolean {
  const status = String(row.db_status || row.status || "").toLowerCase();
  return ["pending", "booked", "confirmed", "pending_payment"].includes(status);
}

export type BookingAlertDispatch = {
  showIndividualAlert: (row: BookingAlertRow) => void;
  showGroupAlert: (groupBookingId: string) => void;
};

/**
 * Dedupes individual booking ids and consolidates group child inserts into one alert.
 * When the app is inactive, rows are queued (not marked seen) for flush on foreground.
 */
export function handleBookingAlertRow(
  row: BookingAlertRow,
  seenBookingIds: Set<string>,
  seenGroupBookingIds: Set<string>,
  appStateActive: boolean,
  dispatch: BookingAlertDispatch,
  pendingWhenInactive: BookingAlertRow[],
): void {
  if (!shouldAlertForBooking(row)) return;
  if (seenBookingIds.has(row.id)) return;

  if (!appStateActive) {
    pendingWhenInactive.push(row);
    return;
  }

  dispatchBookingAlertRow(row, seenBookingIds, seenGroupBookingIds, dispatch);
}

export function dispatchBookingAlertRow(
  row: BookingAlertRow,
  seenBookingIds: Set<string>,
  seenGroupBookingIds: Set<string>,
  dispatch: BookingAlertDispatch,
): void {
  if (!shouldAlertForBooking(row)) return;
  if (seenBookingIds.has(row.id)) return;
  seenBookingIds.add(row.id);

  const groupId = row.group_booking_id?.trim();
  if (groupId) {
    if (seenGroupBookingIds.has(groupId)) return;
    seenGroupBookingIds.add(groupId);
    dispatch.showGroupAlert(groupId);
    return;
  }

  dispatch.showIndividualAlert(row);
}

/** Flush rows that arrived while the app was backgrounded. */
export function flushPendingBookingAlerts(
  pending: BookingAlertRow[],
  seenBookingIds: Set<string>,
  seenGroupBookingIds: Set<string>,
  dispatch: BookingAlertDispatch,
): void {
  if (pending.length === 0) return;
  const batch = pending.splice(0, pending.length);
  for (const row of batch) {
    dispatchBookingAlertRow(row, seenBookingIds, seenGroupBookingIds, dispatch);
  }
}
