/**
 * Shared mobile layout constants – aligned with web client portal mobile view.
 * Use these when adding new screens to ensure consistent spacing across the app.
 */
import { Platform } from "react-native";
import { Colors } from "./colors";

/** Horizontal padding for screen content (matches web px-4) */
export const SCREEN_PADDING = 16;

/** Modern rounded corners – use for onboarding and account screens */
export const RADIUS_INPUT = 16;
export const RADIUS_CARD = 20;
export const RADIUS_BUTTON = 16;
export const RADIUS_BUTTON_PILL = 999;
export const RADIUS_SM = 12;

/** Minimum bottom inset inside tab bar (iOS home indicator when OS reports 0) */
export const TAB_BAR_MIN_BOTTOM_INSET = 8;
/** Android edge-to-edge fallback when `useSafeAreaInsets().bottom` is 0 (gesture / nav bar) */
export const TAB_BAR_ANDROID_MIN_BOTTOM_INSET = 24;
/**
 * Fixed tab bar height excluding safe bottom: paddingTop (8) + icon (24) + label row (~28).
 * Keep in sync with `app/(app)/(tabs)/_layout.tsx` tabBarStyle.
 */
export const TAB_BAR_FIXED_HEIGHT = 60;

/** Tab label typography — shared with `(tabs)/_layout.tsx` tabBarLabelStyle. */
export const TAB_BAR_LABEL_FONT_SIZE = 11;
export const TAB_BAR_LABEL_LINE_HEIGHT = 14;
/** Narrow phones (<360dp): slightly smaller labels so 6 tabs fit. */
export const TAB_BAR_LABEL_FONT_SIZE_NARROW = 10;
export const TAB_BAR_LABEL_LINE_HEIGHT_NARROW = 12;
export const TAB_BAR_NARROW_WIDTH_THRESHOLD = 360;

/** Bottom padding for tab bar and sticky chrome; prefers OS inset, with platform fallbacks. */
export function tabBarBottomInset(insetsBottom: number): number {
  const min =
    Platform.OS === "android" ? TAB_BAR_ANDROID_MIN_BOTTOM_INSET : TAB_BAR_MIN_BOTTOM_INSET;
  return Math.max(insetsBottom, min);
}

/** Total tab bar height including safe-area padding at the bottom */
export function tabBarOuterHeight(insetsBottom: number): number {
  return TAB_BAR_FIXED_HEIGHT + tabBarBottomInset(insetsBottom);
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
