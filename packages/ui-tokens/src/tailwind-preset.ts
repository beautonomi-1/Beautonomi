/**
 * Tailwind preset for web
 * Full Beautonomi theme - use via presets: [require("@beautonomi/ui-tokens").beautonomiPreset]
 */

import { colors } from "./colors";
import { spacing } from "./spacing";
import { radius } from "./radius";
import { fontFamily, fontSize, fontWeight, lineHeight } from "./typography";
import { shadows } from "./shadows";

export const beautonomiPreset = {
  theme: {
    extend: {
      colors: {
        border: colors.border,
        input: colors.input,
        ring: colors.ring,
        background: colors.background,
        foreground: colors.foreground,
        primary: {
          DEFAULT: colors.primary,
          foreground: colors.primaryForeground,
        },
        secondary: {
          DEFAULT: colors.secondary,
          foreground: colors.secondaryForeground,
        },
        destructive: {
          DEFAULT: colors.destructive,
          foreground: colors.destructiveForeground,
        },
        muted: {
          DEFAULT: colors.muted,
          foreground: colors.mutedForeground,
        },
        accent: {
          DEFAULT: colors.accent,
          foreground: colors.accentForeground,
        },
        popover: {
          DEFAULT: colors.popover,
          foreground: colors.popoverForeground,
        },
        card: {
          DEFAULT: colors.card,
          foreground: colors.cardForeground,
        },
        tertiary: colors.tertiary,
        brand: colors.brand,
      },
      spacing: { ...spacing },
      borderRadius: {
        ...radius,
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: { ...fontFamily },
      fontSize: {
        xs: ["12px", { lineHeight: "1rem" }],
        sm: ["14px", { lineHeight: "1.25rem" }],
        base: ["16px", { lineHeight: "1.5rem" }],
        lg: ["18px", { lineHeight: "1.75rem" }],
        xl: ["20px", { lineHeight: "1.75rem" }],
        "2xl": ["24px", { lineHeight: "2rem" }],
        "3xl": ["30px", { lineHeight: "2.25rem" }],
        "4xl": ["36px", { lineHeight: "2.5rem" }],
        "5xl": ["48px", { lineHeight: "1" }],
      },
      fontWeight: { ...fontWeight },
      lineHeight: { ...lineHeight },
      boxShadow: { ...shadows },
    },
  },
};
