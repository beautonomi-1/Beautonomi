/**
 * Bookings tab.
 *
 * §Provider-audit 2026-04: Replaces the previous "Transaction History" tab
 * (which is now reached via More → Sales history) with a bookings-first
 * tab, matching how providers actually run their day. Behaviour mirrors
 * the screen under `more/bookings/index.tsx` so there's a single source
 * of truth — we re-export its default component here.
 */
export { default } from "./more/bookings/index";
