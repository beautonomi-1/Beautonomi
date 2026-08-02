/**
 * Provider booking mobile shell — design tokens.
 * Mobile-first touch targets and mode accents for create / edit / view flows.
 */

/** Create flow accent (primary action, stepper, selected cards) */
export const CREATE_ACCENT = "#2563EB";
/** Edit flow accent */
export const EDIT_ACCENT = "#D97706";
/** View / read-only flow accent */
export const VIEW_ACCENT = "#4B5563";

export const BOOKING_BG = "#F7F7F7";
export const BOOKING_CARD_BG = "#FFFFFF";
export const BOOKING_TEXT_PRIMARY = "#222222";
export const BOOKING_TEXT_SECONDARY = "#6B7280";
export const BOOKING_BORDER = "#E5E7EB";
export const BOOKING_SUMMARY_BG = "#374151";

export const BOOKING_RADIUS_CARD = "24px";
export const BOOKING_RADIUS_SECTION = "16px";
export const BOOKING_RADIUS_BUTTON = "12px";
export const BOOKING_RADIUS_PILL = "9999px";

/** Touch-first minimum hit area (44pt) */
export const MIN_TAP = "min-h-[44px] min-w-[44px]";
export const BOOKING_ZONE_GAP = "16px";

export const BOOKING_TRANSITION =
  "transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]";
export const BOOKING_ACTIVE_SCALE = "active:scale-[0.98]";

export type BookingSheetMode = "create" | "edit" | "view";

export const MODE_ACCENT: Record<BookingSheetMode, string> = {
  create: CREATE_ACCENT,
  edit: EDIT_ACCENT,
  view: VIEW_ACCENT,
};

export const MODE_LABEL: Record<BookingSheetMode, string> = {
  create: "New booking",
  edit: "Edit booking",
  view: "Booking details",
};
