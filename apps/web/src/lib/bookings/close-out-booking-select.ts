/** PostgREST select for provider close-out queue (no bookings.staff_id — column does not exist). */
export const CLOSE_OUT_BOOKING_SELECT = `
        id,
        booking_number,
        scheduled_at,
        status,
        location_type,
        current_stage,
        customer_id,
        customer_running_late_at,
        customer_running_late_minutes,
        customer:users!bookings_customer_id_fkey(id, full_name, phone),
        booking_services(
          scheduled_end_at,
          duration_minutes,
          staff_id,
          offering:offerings(title, duration_minutes)
        )
      `;

export type CloseOutBookingRow = {
  booking_services?: Array<{
    staff_id?: string | null;
    offering?: { title?: string; duration_minutes?: number } | null;
    offerings?: { title?: string; duration_minutes?: number } | null;
  }> | null;
};

/** Mirror embedded offering onto offerings for legacy provider app clients. */
export function mirrorOfferingAliasOnCloseOutRows<T extends CloseOutBookingRow>(rows: T[]): T[] {
  return rows.map((row) => ({
    ...row,
    booking_services: (row.booking_services ?? []).map((bs) => {
      const offering = bs.offering ?? bs.offerings ?? null;
      return {
        ...bs,
        offering,
        offerings: offering,
      };
    }),
  }));
}
