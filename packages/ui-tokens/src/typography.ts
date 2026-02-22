/**
 * Beautonomi typography scale
 * Web: rem/px | RN: fontSize in dp
 */

export const fontFamily = {
  beautonomi: ["AirbnbCereal", "sans-serif"],
  sans: ["system-ui", "sans-serif"],
  mono: ["ui-monospace", "monospace"],
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
  "5xl": 48,
} as const;

export const fontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const lineHeight = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
} as const;
