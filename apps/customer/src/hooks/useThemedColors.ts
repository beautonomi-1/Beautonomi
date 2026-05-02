/**
 * Theme-aware color tokens for the customer app.
 *
 * The app is built on top of the static `Colors` constants in
 * `@/constants/colors`, but components that should respect the user's
 * Light/Dark/System preference can pull from this hook instead so they
 * react to changes from `ThemeProvider` without needing to be rewritten.
 *
 * Returns a small token set covering surfaces, borders, and text. Components
 * still fall back to brand `Colors.primary` for accents, since those don't
 * change between themes.
 */
import { useMemo } from "react";
import { useTheme } from "@/providers/ThemeProvider";
import { Colors } from "@/constants/colors";

export interface ThemedColors {
  isDark: boolean;
  /** Top-level scrollable background. */
  background: string;
  /** Card / row / sheet background that sits on top of `background`. */
  surface: string;
  /** Slightly darker / lighter than `surface` (e.g. input fills). */
  surfaceMuted: string;
  /** Hairline borders / dividers. */
  border: string;
  /** Primary text color. */
  textPrimary: string;
  /** Secondary text (subtitles, hints). */
  textSecondary: string;
  /** Tertiary text (placeholders). */
  textMuted: string;
  /** Inverse text — used on top of brand-colored buttons. */
  textInverse: string;
  /** Brand color (constant across themes). */
  primary: string;
  /** Subtle brand-tinted background. */
  primarySoft: string;
}

const LIGHT: ThemedColors = {
  isDark: false,
  background: Colors.gray[50],
  surface: Colors.white,
  surfaceMuted: Colors.gray[100],
  border: Colors.gray[100],
  textPrimary: Colors.gray[900],
  textSecondary: Colors.gray[600],
  textMuted: Colors.gray[400],
  textInverse: Colors.white,
  primary: Colors.primary,
  primarySoft: Colors.primaryLight,
};

const DARK: ThemedColors = {
  isDark: true,
  background: "#0B0B10",
  surface: "#16161D",
  surfaceMuted: "#22222C",
  border: "#2A2A35",
  textPrimary: "#F5F5F7",
  textSecondary: "#B5B5C0",
  textMuted: "#7A7A88",
  textInverse: Colors.white,
  primary: Colors.primary,
  primarySoft: "rgba(255, 0, 119, 0.18)",
};

export function useThemedColors(): ThemedColors {
  const { isDark } = useTheme();
  return useMemo(() => (isDark ? DARK : LIGHT), [isDark]);
}
