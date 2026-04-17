/**
 * Layout constants for provider app — aligned with bottom tab bar in `(tabs)/_layout.tsx`.
 */

/** Minimum bottom inset inside tab bar (home indicator / gesture bar when OS reports 0). */
export const TAB_BAR_MIN_BOTTOM_INSET = 8;
/** Fixed tab bar height excluding safe bottom: paddingTop (~8) + icon + label row (~44). */
export const TAB_BAR_FIXED_HEIGHT = 52;

/** Total tab bar height including safe-area padding at the bottom. */
export function tabBarOuterHeight(insetsBottom: number): number {
  return TAB_BAR_FIXED_HEIGHT + Math.max(insetsBottom, TAB_BAR_MIN_BOTTOM_INSET);
}

/** Scroll / list content padding so items clear the tab bar. */
export function tabScreenScrollBottomPadding(insetsBottom: number, extraSlack = 16): number {
  return tabBarOuterHeight(insetsBottom) + extraSlack;
}

/** @deprecated Use tabBarOuterHeight / tabScreenScrollBottomPadding with insets */
export const TAB_BAR_BASE_HEIGHT = 60;
/** @deprecated Prefer tabScreenScrollBottomPadding(useSafeAreaInsets().bottom) */
export const CONTENT_BOTTOM_PADDING = 120;
