/**
 * Beautonomi color palette
 * Clean, modern, professional aesthetic
 * Usable in Tailwind + NativeWind
 *
 * Naming conventions:
 * - `primary` = brand accent (hot pink) — main CTA color
 * - `secondary` = dark neutral — headings, body text
 * - `tertiary` = teal brand accent — secondary CTA
 * - `muted` = soft gray backgrounds & borders
 * - `destructive` = red — errors, danger, delete
 * - `accent` = light gray — subtle highlights
 */

export const colors = {
  // Background & surface
  background: "#ffffff",
  foreground: "#0a0a0a",

  // Primary — brand accent (hot pink)
  primary: "#FF0077",
  primaryForeground: "#ffffff",

  // Secondary — dark neutral
  secondary: "#222222",
  secondaryForeground: "#fafafa",

  // Accent & tertiary (teal brand)
  tertiary: "#008489",
  accent: "#f5f5f5",
  accentForeground: "#171717",

  // Muted — subtle backgrounds
  muted: "#f5f5f5",
  mutedForeground: "#737373",

  // Destructive — errors / danger
  destructive: "#ef4444",
  destructiveForeground: "#fafafa",

  // UI elements
  border: "#e5e5e5",
  input: "#e5e5e5",
  ring: "#a3a3a3",
  card: "#ffffff",
  cardForeground: "#0a0a0a",
  popover: "#ffffff",
  popoverForeground: "#0a0a0a",

  // Brand
  brand: {
    primary: "#FF0077",
    secondary: "#008489",
    dark: "#222222",
  },

  // Semantic
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
} as const;

/**
 * Dark mode color overrides
 * Applied when dark mode is active
 */
export const colorsDark = {
  background: "#0a0a0a",
  foreground: "#fafafa",

  primary: "#FF3399",
  primaryForeground: "#0a0a0a",

  secondary: "#262626",
  secondaryForeground: "#fafafa",

  tertiary: "#00a5ab",
  accent: "#262626",
  accentForeground: "#fafafa",

  muted: "#262626",
  mutedForeground: "#a3a3a3",

  destructive: "#dc2626",
  destructiveForeground: "#fafafa",

  border: "#262626",
  input: "#262626",
  ring: "#525252",
  card: "#0a0a0a",
  cardForeground: "#fafafa",
  popover: "#0a0a0a",
  popoverForeground: "#fafafa",

  brand: {
    primary: "#FF3399",
    secondary: "#00a5ab",
    dark: "#fafafa",
  },

  success: "#4ade80",
  warning: "#fbbf24",
  error: "#f87171",
  info: "#60a5fa",
} as const;

export type ColorKey = keyof typeof colors;
