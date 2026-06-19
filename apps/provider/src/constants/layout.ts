import { Platform } from "react-native";

/**
 * Layout constants for provider app — aligned with bottom tab bar in `(tabs)/_layout.tsx`.
 *
 * UX / journey rules (tab shell):
 * - Main tab content sits below `AppHeader` (status bar inset is already applied there).
 *   Do not add `SafeAreaView` `edges={['top']}` on tab screens — it double-reserves space.
 * - Prefer `ScreenContainer` for tab routes: it applies horizontal padding from `useResponsive`,
 *   max-width centering on tablet, and `tabScreenScrollBottomPadding` so scroll content clears
 *   the tab bar + home indicator.
 * - Stack routes without `AppHeader` (`notifications`, `search`, `chat/[id]`, etc.) should use
 *   `ScreenContainer` with `edges={['top']}` where the screen implements its own header.
 * - Replace ad-hoc `paddingBottom: 120` on manual `ScrollView`s with `tabScreenScrollBottomPadding`
 *   (or migrate the screen to `ScreenContainer`).
 */

/** Minimum bottom inset inside tab bar (iOS home indicator when OS reports 0). */
export const TAB_BAR_MIN_BOTTOM_INSET = 8;
/** Android edge-to-edge fallback when `useSafeAreaInsets().bottom` is 0 (gesture / nav bar). */
export const TAB_BAR_ANDROID_MIN_BOTTOM_INSET = 24;
/** Fixed tab bar height excluding safe bottom: paddingTop (~8) + icon (24) + label row (~28). */
export const TAB_BAR_FIXED_HEIGHT = 60;

/** Tab label typography — shared with `(tabs)/_layout.tsx` tabBarLabelStyle. */
export const TAB_BAR_LABEL_FONT_SIZE = 11;
export const TAB_BAR_LABEL_LINE_HEIGHT = 14;

/** Bottom padding for tab bar and sticky chrome; prefers OS inset, with platform fallbacks. */
export function tabBarBottomInset(insetsBottom: number): number {
  const min =
    Platform.OS === "android" ? TAB_BAR_ANDROID_MIN_BOTTOM_INSET : TAB_BAR_MIN_BOTTOM_INSET;
  return Math.max(insetsBottom, min);
}

/** Total tab bar height including safe-area padding at the bottom. */
export function tabBarOuterHeight(insetsBottom: number): number {
  return TAB_BAR_FIXED_HEIGHT + tabBarBottomInset(insetsBottom);
}

/** Scroll / list content padding so items clear the tab bar. */
export function tabScreenScrollBottomPadding(insetsBottom: number, extraSlack = 16): number {
  return tabBarOuterHeight(insetsBottom) + extraSlack;
}

/** @deprecated Use tabBarOuterHeight / tabScreenScrollBottomPadding with insets */
export const TAB_BAR_BASE_HEIGHT = 60;
/** @deprecated Prefer tabScreenScrollBottomPadding(useSafeAreaInsets().bottom) */
export const CONTENT_BOTTOM_PADDING = 120;
