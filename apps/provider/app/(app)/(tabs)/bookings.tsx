/**
 * Bookings tab.
 *
 * §Provider-audit 2026-04: Replaces the previous "Transaction History" tab
 * (which is now reached via More → Sales history) with a bookings-first
 * tab, matching how providers actually run their day. The nested
 * `bookings/[id]` route owns booking details so opening an appointment
 * keeps the Bookings tab selected instead of moving the user into More.
 */
export { default } from "./bookings/index";
