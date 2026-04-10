/**
 * Shared mobile layout constants – aligned with web client portal mobile view.
 * Use these when adding new screens to ensure consistent spacing across the app.
 */
import { Colors } from "./colors";

/** Horizontal padding for screen content (matches web px-4) */
export const SCREEN_PADDING = 16;

/** Modern rounded corners – use for onboarding and account screens */
export const RADIUS_INPUT = 16;
export const RADIUS_CARD = 20;
export const RADIUS_BUTTON = 16;
export const RADIUS_BUTTON_PILL = 999;
export const RADIUS_SM = 12;

/** Minimum bottom inset inside tab bar (home indicator / gesture bar when OS reports 0) */
export const TAB_BAR_MIN_BOTTOM_INSET = 8;
/**
 * Fixed tab bar height excluding safe bottom: paddingTop (8) + icon + label row (~44).
 * Keep in sync with `app/(app)/(tabs)/_layout.tsx` tabBarStyle.
 */
export const TAB_BAR_FIXED_HEIGHT = 52;

/** Total tab bar height including safe-area padding at the bottom */
export function tabBarOuterHeight(insetsBottom: number): number {
  return TAB_BAR_FIXED_HEIGHT + Math.max(insetsBottom, TAB_BAR_MIN_BOTTOM_INSET);
}

/** Scroll content padding so lists clear the tab bar */
export function tabScrollContentPaddingBottom(insetsBottom: number, extraSlack = 16): number {
  return tabBarOuterHeight(insetsBottom) + extraSlack;
}

/**
 * Fallback when hooks are unavailable (e.g. static styles).
 * Prefer `useTabContentPaddingBottom()` for correct device insets.
 */
export const TAB_CONTENT_PADDING_BOTTOM = 100;

/** Bottom padding for full-screen stack screens (account-settings, partner-profile, book, etc.) */
export const STACK_CONTENT_PADDING_BOTTOM = 48;

/**
 * Brand accent color (derived from Colors.primary).
 * @deprecated Prefer `Colors.primary` from `@/constants/colors` for new code.
 */
export const BRAND_COLOR = Colors.primary;

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

/** Home section spacing – aligned with web (mb-8 md:mb-12, mb-4 md:mb-6) */
export const HOME_SECTION_MARGIN_BOTTOM = 32;
export const HOME_SECTION_HEADER_MARGIN_BOTTOM = 16;
export const HOME_SECTION_HEADER_MARGIN_TOP = 24;
/** Section title – web uses text-xl md:text-2xl font-normal */
export const HOME_SECTION_TITLE_FONT_SIZE = 20;
