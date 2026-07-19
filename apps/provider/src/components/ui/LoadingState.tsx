import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { Colors } from "@/constants/colors";
import { BrandGlyphPulse } from "@/components/BrandGlyphPulse";

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
  /** Override the brand accent (defaults to Colors.primary). */
  accent?: string;
}

/**
 * Inline / full-screen data loader used across provider tabs.
 *
 * §Provider-audit 2026-04 (loading-polish): previously rendered a bare black
 * `ActivityIndicator` (#111) with gray text, which fought the pink brand
 * palette every time a list was refreshed. Replaced with a soft three-dot
 * pulse in the brand accent so refreshes feel quiet and on-brand.
 *
 * §Provider-audit 2026-07: full-screen loads also show the brand glyph pulse
 * (mirrors customer MiniBrandLoader / ScreenFrame fallback).
 */
export function LoadingState({
  message = "Loading…",
  fullScreen = true,
  accent = Colors.primary,
}: LoadingStateProps) {
  const dot0 = useSharedValue(0);
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);

  useEffect(() => {
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
  }, [dot0, dot1, dot2]);

  const style0 = useAnimatedStyle(() => ({
    opacity: interpolate(dot0.value, [0, 1], [0.25, 1]),
    transform: [{ translateY: interpolate(dot0.value, [0, 1], [0, -5]) }],
  }));
  const style1 = useAnimatedStyle(() => ({
    opacity: interpolate(dot1.value, [0, 1], [0.25, 1]),
    transform: [{ translateY: interpolate(dot1.value, [0, 1], [0, -5]) }],
  }));
  const style2 = useAnimatedStyle(() => ({
    opacity: interpolate(dot2.value, [0, 1], [0.25, 1]),
    transform: [{ translateY: interpolate(dot2.value, [0, 1], [0, -5]) }],
  }));

  return (
    <View
      style={[
        styles.root,
        fullScreen ? { flex: 1 } : { paddingVertical: 48 },
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
    >
      {fullScreen ? (
        <View style={styles.glyphWrap}>
          <BrandGlyphPulse size={56} accentColor={accent} />
        </View>
      ) : null}
      <View style={styles.dots}>
        <Animated.View style={[styles.dot, { backgroundColor: accent }, style0]} />
        <Animated.View style={[styles.dot, { backgroundColor: accent }, style1]} />
        <Animated.View style={[styles.dot, { backgroundColor: accent }, style2]} />
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  glyphWrap: {
    marginBottom: 20,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    height: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  message: {
    marginTop: 14,
    fontSize: 14,
    color: "#6b7280",
  },
});
