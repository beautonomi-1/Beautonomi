/**
 * PostgREST embed fragments for `group_bookings`.
 *
 * `group_bookings` has two FK paths to `bookings`:
 * - `primary_contact_booking_id` → single primary booking
 * - reverse `bookings.group_booking_id` → child bookings in the group
 *
 * Never use bare `bookings:bookings(...)` — PostgREST returns 500 (ambiguous).
 */

/** Child bookings linked via `bookings.group_booking_id`. */
export const GROUP_CHILD_BOOKINGS_REL = "bookings!bookings_group_booking_id_fkey";

export function groupChildBookingsEmbed(columns: string): string {
  return `bookings:${GROUP_CHILD_BOOKINGS_REL}(${columns})`;
}

/**
 * Minimal fallback select for `group_bookings`.
 *
 * Used when `PROVIDER_GROUP_DETAIL_SELECT` fails (e.g. PostgREST FK-hint
 * mismatch or a missing column on an older DB instance).  Child bookings are
 * deliberately omitted here and fetched in a separate, simpler query so the
 * ambiguity between the two FK paths to `bookings` cannot cause a 500.
 */
export const PROVIDER_GROUP_DETAIL_SELECT_FALLBACK = `
  *,
  service_packages:package_id(id, name),
  booking_participants(
    id, booking_id, participant_name, participant_email, participant_phone,
    is_primary_contact, service_id, service_name, price, duration_minutes, addons,
    notes, checked_in_at, checked_out_at
  )
`;

/** Child bookings columns fetched independently (fallback path). */
export const PROVIDER_CHILD_BOOKINGS_SELECT = `
  id, booking_number, ref_number, status, scheduled_at, total_amount,
  total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, tip_amount,
  additional_charges(amount,status),
  customer:users!bookings_customer_id_fkey(id, full_name, email, phone, avatar_url)
`;

/** Provider portal / mobile group detail — payment + customer embed. */
export const PROVIDER_GROUP_DETAIL_SELECT = `
  *,
  ${groupChildBookingsEmbed(`
    id, booking_number, ref_number, status, scheduled_at, total_amount,
    total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, tip_amount,
    additional_charges(amount,status),
    customer:users!bookings_customer_id_fkey(id, full_name, email, phone, avatar_url)
  `)},
  service_packages:package_id(id, name),
  booking_participants(
    id, booking_id, participant_name, participant_email, participant_phone,
    is_primary_contact, service_id, service_name, price, duration_minutes, addons,
    notes, checked_in_at, checked_out_at
  )
`;

/** Customer `/api/me/group-bookings/[id]` detail. */
export const ME_GROUP_DETAIL_SELECT = `
  *,
  provider:providers(id, business_name, slug, phone, email, timezone),
  location:provider_locations(id, name, address_line1, address_line2, city, country),
  service_packages:package_id(id, name),
  booking_participants(
    id,
    booking_id,
    customer_id,
    participant_name,
    participant_email,
    participant_phone,
    is_primary_contact,
    service_id,
    service_name,
    price,
    duration_minutes,
    addons,
    checked_in_at,
    checked_out_at
  ),
  ${groupChildBookingsEmbed(`
    id,
    booking_number,
    customer_id,
    group_booking_id,
    status,
    scheduled_at,
    total_amount,
    total_paid,
    total_refunded,
    wallet_amount,
    gift_card_amount,
    tip_amount,
    currency,
    payment_status,
    additional_charges(amount,status)
  `)}
`;

/** Admin SPA group detail (no child bookings embed — participants carry booking_id). */
export const ADMIN_GROUP_DETAIL_SELECT = `
  *,
  providers(id, business_name, tenant_id),
  service_packages:package_id(id, name),
  booking_participants(
    id,
    booking_id,
    participant_name,
    participant_email,
    participant_phone,
    is_primary_contact,
    service_id,
    service_name,
    price,
    duration_minutes,
    checked_in_at,
    checked_out_at
  )
`;
