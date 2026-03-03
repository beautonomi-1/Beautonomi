/**
 * Shared mobile layout constants – aligned with web client portal mobile view.
 * Use these when adding new screens to ensure consistent spacing across the app.
 */

/** Horizontal padding for screen content (matches web px-4) */
export const SCREEN_PADDING = 16;

/** Bottom padding for ScrollView when tab bar is visible (Home, Explore, Bookings, Chats, Profile) */
export const TAB_CONTENT_PADDING_BOTTOM = 100;

/** Bottom padding for full-screen stack screens (account-settings, partner-profile, book, etc.) */
export const STACK_CONTENT_PADDING_BOTTOM = 48;

/**
 * Brand accent color.
 * @deprecated Use `Colors.primary` from `@/constants/colors` instead.
 */
export const BRAND_COLOR = "#FF0077";

/** Standard scroll content style for tab screens */
export const tabScrollContentStyle = {
  paddingHorizontal: SCREEN_PADDING,
  paddingBottom: TAB_CONTENT_PADDING_BOTTOM,
};

/** Standard scroll content style for stack screens */
export const stackScrollContentStyle = {
  padding: SCREEN_PADDING,
  paddingBottom: STACK_CONTENT_PADDING_BOTTOM,
};
