const CONTACT_KEYS = [
  "email",
  "phone",
  "participant_email",
  "participant_phone",
  "client_email",
  "client_phone",
  "customer_email",
  "customer_phone",
] as const;

function withoutContact<T extends object>(row: T): T {
  const next = { ...row } as Record<string, unknown>;
  for (const key of CONTACT_KEYS) {
    if (key in next) next[key] = null;
  }
  if (next.customer && typeof next.customer === "object" && !Array.isArray(next.customer)) {
    next.customer = withoutContact(next.customer as object);
  }
  return next as T;
}

/** Drop customer email and phone on a booking payload. Names stay so the calendar still works. */
export function redactBookingCustomerContact<T>(booking: T, canViewClients: boolean): T {
  if (canViewClients || booking == null || typeof booking !== "object") return booking;
  const next = { ...(booking as object) } as Record<string, unknown>;
  for (const key of CONTACT_KEYS) {
    if (key in next) next[key] = null;
  }
  if (next.customers && typeof next.customers === "object" && !Array.isArray(next.customers)) {
    next.customers = withoutContact(next.customers as object);
  }
  if (next.customer && typeof next.customer === "object" && !Array.isArray(next.customer)) {
    next.customer = withoutContact(next.customer as object);
  }
  if (next.users && typeof next.users === "object" && !Array.isArray(next.users)) {
    next.users = withoutContact(next.users as object);
  }
  if (next.booking && typeof next.booking === "object" && !Array.isArray(next.booking)) {
    const booking = { ...(next.booking as object) } as Record<string, unknown>;
    if (booking.customer && typeof booking.customer === "object" && !Array.isArray(booking.customer)) {
      booking.customer = withoutContact(booking.customer as object);
    }
    next.booking = booking;
  }
  if (Array.isArray(next.participants)) {
    next.participants = next.participants.map((participant) =>
      participant && typeof participant === "object" ? withoutContact(participant) : participant,
    );
  }
  if (Array.isArray(next.booking_participants)) {
    next.booking_participants = next.booking_participants.map((participant) =>
      participant && typeof participant === "object" ? withoutContact(participant) : participant,
    );
  }
  if (Array.isArray(next.participant_phones)) next.participant_phones = [];
  if (Array.isArray(next.bookings)) {
    next.bookings = next.bookings.map((child) =>
      child && typeof child === "object" ? withoutContact(child) : child,
    );
  }
  if (Array.isArray(next.items)) {
    next.items = next.items.map((item) =>
      item && typeof item === "object" ? withoutContact(item) : item,
    );
  }
  return next as T;
}

export function redactBookingCustomerContacts<T>(rows: T[], canViewClients: boolean): T[] {
  if (canViewClients) return rows;
  return rows.map((row) => redactBookingCustomerContact(row, false));
}

/**
 * Copy stored on an on-demand row that staff can select directly.
 * Email and phone stay on the user row (`customer_id`); the draft keeps the name and address.
 */
export function stripStoredOnDemandContact<T>(payload: T): T {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const next = { ...(payload as object) } as Record<string, unknown>;
  for (const key of CONTACT_KEYS) {
    if (key in next) next[key] = null;
  }
  if (next.client_info && typeof next.client_info === "object" && !Array.isArray(next.client_info)) {
    next.client_info = redactBookingCustomerContact(next.client_info, false);
  }
  return next as T;
}

/** Incoming request payloads carry the customer's booking draft, including contact. */
export function redactOnDemandRequest<T>(row: T, canViewClients: boolean): T {
  if (canViewClients || row == null || typeof row !== "object") return row;
  const next = { ...(row as object) } as Record<string, unknown>;
  const payload = next.request_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return next as T;
  const copy = { ...(payload as object) } as Record<string, unknown>;
  if (copy.client_info && typeof copy.client_info === "object" && !Array.isArray(copy.client_info)) {
    copy.client_info = redactBookingCustomerContact(copy.client_info, false);
  }
  next.request_payload = copy;
  return next as T;
}
