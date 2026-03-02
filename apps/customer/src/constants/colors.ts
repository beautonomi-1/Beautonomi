/**
 * Centralized color constants for the customer app.
 * Use these in `style` objects. For NativeWind className, use the
 * Tailwind theme colors defined in tailwind.config.js (e.g. bg-primary).
 */

import { Platform, type ViewStyle } from "react-native";

export const Colors = {
  primary: "#FF0077",
  primaryLight: "rgba(255, 0, 119, 0.05)",

  white: "#FFFFFF",
  black: "#000000",

  gray: {
    50: "#F9FAFB",
    100: "#F3F4F6",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2937",
    900: "#111827",
  },

  success: "#22C55E",
  warning: "#EAB308",
  error: "#EF4444",
  info: "#3B82F6",
} as const;

/**
 * Cross-platform shadow helper. Uses `boxShadow` on web (RN 0.81+),
 * native shadow* props + elevation on iOS/Android.
 */
export function shadow(
  offsetY: number,
  radius: number,
  opacity: number,
  elevation: number = Math.round(radius / 2),
  color = "#000",
  offsetX = 0,
): ViewStyle {
  if (Platform.OS === "web") {
    return {
      boxShadow: `${offsetX}px ${offsetY}px ${radius}px rgba(0,0,0,${opacity})`,
    } as ViewStyle;
  }
  return {
    shadowColor: color,
    shadowOffset: { width: offsetX, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };
}

export const Shadows = {
  card: shadow(2, 8, 0.1, 2),
  cardSmall: shadow(1, 4, 0.05, 1),
  cardSubtle: shadow(1, 2, 0.1, 2),
  tabBar: shadow(-2, 6, 0.06, 8),
} as const;
