/**
 * Responsive layout hook for mobile/tablet detection.
 * Provides breakpoints and layout utilities.
 */
import { useState, useEffect } from "react";
import { Dimensions, ScaledSize } from "react-native";

export interface ResponsiveInfo {
  width: number;
  height: number;
  isPhone: boolean;
  isTablet: boolean;
  isLandscape: boolean;
  /** Number of columns for grid layouts */
  columns: 1 | 2 | 3 | 4;
  /** Horizontal padding for the screen */
  screenPadding: number;
  /** Card width for grid items */
  cardWidth: number;
}

function calculate(window: ScaledSize): ResponsiveInfo {
  const { width, height } = window;
  const isLandscape = width > height;
  const isTablet = width >= 768;

  let columns: 1 | 2 | 3 | 4 = 1;
  if (width >= 1024) columns = 4;
  else if (width >= 768) columns = isLandscape ? 3 : 2;
  else if (width >= 480 && isLandscape) columns = 2;

  const screenPadding = isTablet ? 24 : 16;
  const gap = isTablet ? 16 : 12;
  const totalGaps = (columns - 1) * gap;
  const cardWidth = (width - screenPadding * 2 - totalGaps) / columns;

  return { width, height, isPhone: !isTablet, isTablet, isLandscape, columns, screenPadding, cardWidth };
}

export function useResponsive(): ResponsiveInfo {
  const [info, setInfo] = useState(() => calculate(Dimensions.get("window")));

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setInfo(calculate(window));
    });
    return () => sub.remove();
  }, []);

  return info;
}
