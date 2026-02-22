/**
 * NativeWind preset for Expo/React Native
 * Self-contained tokens - no runtime deps on built package.
 * Use: presets: [require("nativewind/preset"), require("@beautonomi/ui-tokens/nativewind-preset")]
 */

const colors = {
  background: "#ffffff",
  foreground: "hsl(0, 0%, 3.9%)",
  primary: "#f7f7f7",
  primaryForeground: "hsl(0, 0%, 3.9%)",
  secondary: "#222222",
  secondaryForeground: "hsl(0, 0%, 98%)",
  tertiary: "#008489",
  accent: "#dddddd",
  accentForeground: "hsl(0, 0%, 9%)",
  muted: "#FF0077",
  mutedForeground: "hsl(0, 0%, 45.1%)",
  destructive: "#6A6A6A",
  destructiveForeground: "hsl(0, 0%, 98%)",
  border: "hsl(0, 0%, 89.8%)",
  input: "hsl(0, 0%, 89.8%)",
  ring: "hsl(0, 0%, 63.9%)",
  card: "#ffffff",
  cardForeground: "hsl(0, 0%, 3.9%)",
  popover: "#717171",
  popoverForeground: "hsl(0, 0%, 98%)",
  brand: { primary: "#008489", secondary: "#222222" },
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
        primary: { DEFAULT: colors.primary, foreground: colors.primaryForeground },
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
