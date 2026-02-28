/**
 * Express Booking — Liquid Glass & Consistency design system.
 * Premium, high-conversion UI with depth, transparency, and physics-based motion.
 */

/** Beautonomi Pink (logo / home brand) — active states, primary CTAs, stepper, selected cards. Matches primary_color in config. */
export const BOOKING_ACCENT = "#FF0077";
/** Rose-tinted waitlist/warning: background */
export const BOOKING_WAITLIST_BG = "#FFF1F3";
/** Rose-tinted waitlist/warning: text */
export const BOOKING_WAITLIST_TEXT = "#FF0077";

/** App background */
export const BOOKING_BG = "#F7F7F7";
/** Elevated cards */
export const BOOKING_CARD_BG = "#FFFFFF";
/** Primary text */
export const BOOKING_TEXT_PRIMARY = "#222222";
/** Secondary text */
export const BOOKING_TEXT_SECONDARY = "#6B7280";
/** Summary card background (softer than black, works with white text) */
export const BOOKING_SUMMARY_BG = "#374151";
/** High-contrast borders */
export const BOOKING_BORDER = "#E5E7EB";
/** Hairline edge (glass) */
export const BOOKING_EDGE = "rgba(0,0,0,0.05)";

/** Liquid glass surface */
export const BOOKING_GLASS_BG = "rgba(255, 255, 255, 0.7)";
export const BOOKING_GLASS_BLUR = "blur(16px) saturate(180%)";
/** Main container shadow */
export const BOOKING_SHADOW_MAIN = "0 24px 64px rgba(0, 0, 0, 0.08)";
/** Softer card shadow */
export const BOOKING_SHADOW_CARD = "0 8px 32px rgba(0, 0, 0, 0.06)";

/** Concentric geometry (hardware-aligned) */
export const BOOKING_RADIUS_OUTER = "48px";   // Main app container
export const BOOKING_RADIUS_CARD = "32px";    // Inner cards/sections
export const BOOKING_RADIUS_SECTION = "24px"; // Smaller sections
export const BOOKING_RADIUS_BUTTON = "16px";  // Buttons / toggles
export const BOOKING_RADIUS_PILL = "12px";    // Pills / chips

/** Touch-first: minimum hit area (44pt) */
export const MIN_TAP = "min-h-[44px] min-w-[44px]";
/** Minimum spacing between interactive zones */
export const BOOKING_ZONE_GAP = "16px";

export const PLATFORM_NAME = "Beautonomi";

/** Spring-like motion (stiffness ~300, damping ~30 → ease-out-expo feel) */
export const BOOKING_TRANSITION = "transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]";
/** Button press tactile */
export const BOOKING_ACTIVE_SCALE = "active:scale-[0.98]";
