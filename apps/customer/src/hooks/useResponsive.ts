/**
 * Responsive layout hook for phone/tablet detection.
 * Provides dynamic values that update on orientation change or window resize.
 */
import { useWindowDimensions } from "react-native";

/** Max content width on tablet (dp); content is centered when wider. On phone, same as width (no cap). */
export const TABLET_CONTENT_MAX_WIDTH = 640;

export interface ResponsiveValues {
  /** Screen width in dp */
  width: number;
  /** Screen height in dp */
  height: number;
  /** true when shortest side >= 600dp (standard tablet breakpoint) */
  isTablet: boolean;
  /** true when device is in portrait orientation */
  isPortrait: boolean;
  /** Number of grid columns (2 on phone, 3-4 on tablet) */
  columns: number;
  /** Horizontal content padding (larger on tablet) */
  contentPadding: number;
  /** Max width for main content area on tablet; on phone equals width so no cap */
  contentMaxWidth: number;
  /** Width of a horizontal card (75% on phone, 45% on tablet) */
  cardWidth: number;
}

export function useResponsive(): ResponsiveValues {
  const { width, height } = useWindowDimensions();
  const isPortrait = height >= width;
  const shortSide = Math.min(width, height);
  const isTablet = shortSide >= 600;

  const columns = isTablet ? (isPortrait ? 3 : 4) : 2;
  const contentPadding = isTablet ? 24 : 16;
  const contentMaxWidth = isTablet ? TABLET_CONTENT_MAX_WIDTH : width;
  const cardWidth = isTablet ? width * 0.45 : width * 0.75;

  return {
    width,
    height,
    isTablet,
    isPortrait,
    columns,
    contentPadding,
    contentMaxWidth,
    cardWidth,
  };
}
