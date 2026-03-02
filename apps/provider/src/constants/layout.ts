/**
 * Layout constants for provider app.
 * Bottom padding for scroll/list content so it clears the bottom tab bar.
 * Tab bar height = 60 + safe area bottom (e.g. ~34 on iPhone) ≈ 94–100.
 * Use this for FlatList/ScrollView contentContainerStyle.paddingBottom.
 */
export const TAB_BAR_BASE_HEIGHT = 60;
/** Padding below scroll content so last items aren't hidden by the tab bar. */
export const CONTENT_BOTTOM_PADDING = 120;
