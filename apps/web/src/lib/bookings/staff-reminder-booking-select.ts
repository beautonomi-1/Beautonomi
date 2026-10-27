/** PostgREST select for staff appointment reminders (no bookings.staff_id — column does not exist). */
export const STAFF_REMINDER_BOOKING_SELECT = `
        id,
        booking_number,
        scheduled_at,
        customer_id,
        provider_id,
        tenant_id,
        customers:users!bookings_customer_id_fkey ( id, full_name ),
        booking_services ( staff_id, offering:offerings!inner ( title ) )
      `;
