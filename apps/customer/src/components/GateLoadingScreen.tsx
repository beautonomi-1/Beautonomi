/**
 * Full-screen auth / portal gate loader — the first thing a customer sees
 * while we check their session, portal, or profile completion. Used in
 * `app/index.tsx` gates and `AccountStatusGuard`.
 *
 * §Customer-audit 2026-04 (loading-polish): the previous loader was a plain
 * pulsing rounded square on a blank background — legible but generic. This
 * version uses the Beautonomi wordmark + a soft breathing pulse + an orbiting
 * accent ring on a subtle gradient, so the first impression actually feels
 * on-brand instead of like a blank splash.
 *
 * Mirrors apps/provider/src/components/GateLoadingScreen.tsx — keep in sync.
 */
import React, { useEffect } from "react";
import { View, Text, StyleSheet, useColorScheme } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  interpolate,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { colors, colorsDark } from "@beautonomi/ui-tokens";
import { BEAUTONOMI_B_PATH, BEAUTONOMI_SWIRL_PATH } from "@/components/brand-glyph-paths";

const AnimatedView = Animated.View;

export interface GateLoadingScreenProps {
  message?: string;
  primaryColor?: string;
  backgroundColor?: string;
  /** Show the "Beautonomi" wordmark beneath the glyph. Defaults to true. */
  showWordmark?: boolean;
  testID?: string;
}

export function GateLoadingScreen({
  message,
  primaryColor,
  backgroundColor,
  showWordmark = true,
  testID,
}: GateLoadingScreenProps) {
  const scheme = useColorScheme();
  const palette = scheme === "dark" ? colorsDark : colors;
  const accent = primaryColor ?? palette.primary;
  const bg = backgroundColor ?? palette.background;
  const isDark = scheme === "dark";

  // Soft breathing pulse on the glyph (scale + opacity).
  const pulse = useSharedValue(0);
  // Orbiting ring around the glyph.
  const orbit = useSharedValue(0);
  // Wordmark shimmer sweep / fade-in.
  const wordmark = useSharedValue(0);
  // Three-dot progress indicator.
  const dot0 = useSharedValue(0);
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    orbit.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.linear }),
      -1,
      false,
    );
    wordmark.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) });

    const bounce = () =>
      withRepeat(
        withSequence(
          withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      );
    dot0.value = bounce();
    dot1.value = withDelay(140, bounce());
    dot2.value = withDelay(280, bounce());
  }, [pulse, orbit, wordmark, dot0, dot1, dot2]);

  const glyphStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [0.94, 1.04]);
    const opacity = interpolate(pulse.value, [0, 1], [0.85, 1]);
    return { transform: [{ scale }], opacity };
  });

  const outerRingStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [1, 1.18]);
    const opacity = interpolate(pulse.value, [0, 1], [0.35, 0]);
    return { transform: [{ scale }], opacity };
  });

  const innerRingStyle = useAnimatedStyle(() => {
    const rotate = `${interpolate(orbit.value, [0, 1], [0, 360])}deg`;
    return { transform: [{ rotate }] };
  });

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [
      { translateY: interpolate(wordmark.value, [0, 1], [6, 0]) },
    ],
  }));

  const dot0Style = useAnimatedStyle(() => ({
    opacity: interpolate(dot0.value, [0, 1], [0.25, 1]),
    transform: [{ translateY: interpolate(dot0.value, [0, 1], [0, -4]) }],
  }));
  const dot1Style = useAnimatedStyle(() => ({
    opacity: interpolate(dot1.value, [0, 1], [0.25, 1]),
    transform: [{ translateY: interpolate(dot1.value, [0, 1], [0, -4]) }],
  }));
  const dot2Style = useAnimatedStyle(() => ({
    opacity: interpolate(dot2.value, [0, 1], [0.25, 1]),
    transform: [{ translateY: interpolate(dot2.value, [0, 1], [0, -4]) }],
  }));

  const gradientStops = isDark
    ? ([bg, bg] as [string, string])
    : ([tintBackground(accent, 0.08), bg] as [string, string]);

  return (
    <View
      style={[styles.root, { backgroundColor: bg }]}
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? "Loading"}
      testID={testID}
    >
      <LinearGradient
        colors={gradientStops}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <View style={styles.center}>
        {/* Expanding halo behind the glyph */}
        <AnimatedView
          style={[
            styles.halo,
            { backgroundColor: withAlpha(accent, 0.18) },
            outerRingStyle,
          ]}
          pointerEvents="none"
        />
        {/* Thin orbiting ring */}
        <AnimatedView style={[styles.orbit, innerRingStyle]} pointerEvents="none">
          <View
            style={[
              styles.orbitDot,
              { backgroundColor: accent },
            ]}
          />
        </AnimatedView>
        {/* Brand glyph card */}
        <AnimatedView style={[styles.card, cardShadow(accent, isDark), glyphStyle]}>
          <Svg width={56} height={56} viewBox="0 0 500 500" fill="none">
            <Path d={BEAUTONOMI_B_PATH} fill={accent} />
            <Path d={BEAUTONOMI_SWIRL_PATH} fill={accent} />
          </Svg>
        </AnimatedView>
      </View>

      {showWordmark ? (
        <AnimatedView style={[styles.wordmarkWrap, wordmarkStyle]}>
          <Text style={[styles.wordmark, { color: accent }]}>Beautonomi</Text>
        </AnimatedView>
      ) : null}

      <View style={styles.dots}>
        <AnimatedView style={[styles.dot, { backgroundColor: accent }, dot0Style]} />
        <AnimatedView style={[styles.dot, { backgroundColor: accent }, dot1Style]} />
        <AnimatedView style={[styles.dot, { backgroundColor: accent }, dot2Style]} />
      </View>

      {message ? (
        <Animated.Text
          key={message}
          entering={FadeIn.duration(280)}
          exiting={FadeOut.duration(220)}
          style={[styles.message, { color: palette.mutedForeground }]}
        >
          {message}
        </Animated.Text>
      ) : null}
    </View>
  );
}

// --- helpers ---

/**
 * Lighten a hex accent toward white so we can tint the gradient background
 * without shipping a second palette.
 */
function tintBackground(hex: string, strength: number): string {
  const { r, g, b } = hexToRgb(hex);
  const amt = Math.max(0, Math.min(1, strength));
  const mix = (c: number) => Math.round(c + (255 - c) * (1 - amt * 4));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = hex.replace("#", "");
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  const num = parseInt(full || "000000", 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function cardShadow(accent: string, isDark: boolean) {
  if (isDark) {
    return {
      backgroundColor: "rgba(255,255,255,0.06)",
      shadowColor: accent,
      shadowOpacity: 0.25,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    } as const;
  }
  return {
    backgroundColor: "#ffffff",
    shadowColor: accent,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  } as const;
}

const CARD = 104;
const ORBIT = 144;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 400,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  center: {
    width: ORBIT,
    height: ORBIT,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: CARD,
    height: CARD,
    borderRadius: CARD / 2,
  },
  orbit: {
    position: "absolute",
    width: ORBIT,
    height: ORBIT,
    borderRadius: ORBIT / 2,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
  },
  orbitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: -4,
  },
  card: {
    width: CARD,
    height: CARD,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmarkWrap: {
    marginTop: 28,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  dots: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
  },
  message: {
    marginTop: 20,
    fontSize: 15,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 21,
  },
});
