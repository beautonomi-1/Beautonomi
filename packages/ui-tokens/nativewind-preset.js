/**
 * NativeWind preset for Expo/React Native
 * Aligned with @beautonomi/ui-tokens design system (see src/colors.ts).
 * Use: presets: [require("nativewind/preset"), require("@beautonomi/ui-tokens/nativewind-preset")]
 *
 * Semantic tokens:
 * - primary = brand accent (hot pink) — CTAs, links
 * - secondary = dark neutral — headings, body
 * - muted = soft gray — backgrounds, borders
 * - tertiary = teal — secondary CTAs
 */

const colors = {
  background: "#ffffff",
  foreground: "#0a0a0a",
  primary: "#FF0077",
  primaryHover: "#D60565",
  primaryForeground: "#ffffff",
  secondary: "#222222",
  secondaryForeground: "#fafafa",
  tertiary: "#008489",
  accent: "#f5f5f5",
  accentForeground: "#171717",
  muted: "#f5f5f5",
  mutedForeground: "#737373",
  destructive: "#ef4444",
  destructiveForeground: "#fafafa",
  border: "#e5e5e5",
  input: "#e5e5e5",
  ring: "#a3a3a3",
  card: "#ffffff",
  cardForeground: "#0a0a0a",
  popover: "#ffffff",
  popoverForeground: "#0a0a0a",
  brand: { primary: "#FF0077", secondary: "#008489", dark: "#222222" },
};

const spacing = {
  0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 3.5: 14, 4: 16,
  5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 40, 11: 44, 12: 48,
  14: 56, 16: 64, 20: 80, 24: 96,
};

const borderRadius = {
  0: 0, none: 0, sm: 2, DEFAULT: 6, md: 6, lg: 8, xl: 12,
  "2xl": 16, "3xl": 24, full: 9999,
};

const boxShadow = {
  none: "none",
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
};

module.exports = {
  theme: {
    extend: {
      colors: {
        border: colors.border,
        input: colors.input,
        ring: colors.ring,
        background: colors.background,
        foreground: colors.foreground,
        primary: { DEFAULT: colors.primary, hover: colors.primaryHover, foreground: colors.primaryForeground },
        secondary: { DEFAULT: colors.secondary, foreground: colors.secondaryForeground },
        destructive: { DEFAULT: colors.destructive, foreground: colors.destructiveForeground },
        muted: { DEFAULT: colors.muted, foreground: colors.mutedForeground },
        accent: { DEFAULT: colors.accent, foreground: colors.accentForeground },
        popover: { DEFAULT: colors.popover, foreground: colors.popoverForeground },
        card: { DEFAULT: colors.card, foreground: colors.cardForeground },
        tertiary: colors.tertiary,
        brand: colors.brand,
      },
      spacing: { ...spacing },
      borderRadius: { ...borderRadius },
      fontFamily: {
        beautonomi: ["AirbnbCereal", "sans-serif"],
        sans: ["system-ui", "sans-serif"],
      },
      fontSize: {
        xs: ["12px", { lineHeight: "1rem" }],
        sm: ["14px", { lineHeight: "1.25rem" }],
        base: ["16px", { lineHeight: "1.5rem" }],
        lg: ["18px", { lineHeight: "1.75rem" }],
        xl: ["20px", { lineHeight: "1.75rem" }],
        "2xl": ["24px", { lineHeight: "2rem" }],
        "3xl": ["30px", { lineHeight: "2.25rem" }],
        "4xl": ["36px", { lineHeight: "2.5rem" }],
      },
      boxShadow: { ...boxShadow },
    },
  },
};
