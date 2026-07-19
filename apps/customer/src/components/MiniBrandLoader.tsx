import { useEffect } from "react";
import { View, Text, StyleSheet, useColorScheme } from "react-native";
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
} from "react-native-reanimated";
import { Colors } from "@/constants/colors";
import { useThemedColors } from "@/hooks/useThemedColors";
import { BEAUTONOMI_B_PATH, BEAUTONOMI_SWIRL_PATH } from "@/components/brand-glyph-paths";

const AnimatedView = Animated.View;

export interface MiniBrandLoaderProps {
  message?: string;
  /** Override accent (defaults to Colors.primary). */
  accentColor?: string;
}

/**
 * Compact on-brand loader for ScreenFrame and inline loading states.
 * Same glyph + breathing pulse as GateLoadingScreen, without the full gate chrome.
 */
export function MiniBrandLoader({ message, accentColor }: MiniBrandLoaderProps) {
  const themed = useThemedColors();
  const scheme = useColorScheme();
  const accent = accentColor ?? Colors.primary;
  const isDark = scheme === "dark";

  const pulse = useSharedValue(0);
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
  }, [pulse, dot0, dot1, dot2]);

  const glyphStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [0.94, 1.04]);
    const opacity = interpolate(pulse.value, [0, 1], [0.85, 1]);
    return { transform: [{ scale }], opacity };
  });

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

  const cardBg = isDark ? "rgba(255,255,255,0.06)" : "#ffffff";

  return (
    <View
      style={styles.root}
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? "Loading"}
    >
      <AnimatedView
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            shadowColor: accent,
            shadowOpacity: isDark ? 0.2 : 0.12,
          },
          glyphStyle,
        ]}
      >
        <Svg width={40} height={40} viewBox="0 0 500 500" fill="none">
          <Path d={BEAUTONOMI_B_PATH} fill={accent} />
          <Path d={BEAUTONOMI_SWIRL_PATH} fill={accent} />
        </Svg>
      </AnimatedView>

      <View style={styles.dots}>
        <AnimatedView style={[styles.dot, { backgroundColor: accent }, dot0Style]} />
        <AnimatedView style={[styles.dot, { backgroundColor: accent }, dot1Style]} />
        <AnimatedView style={[styles.dot, { backgroundColor: accent }, dot2Style]} />
      </View>

      {message ? (
        <Text style={[styles.message, { color: themed.textSecondary }]}>{message}</Text>
      ) : null}
    </View>
  );
}

const CARD = 56;

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: CARD,
    height: CARD,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
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
    marginTop: 12,
    fontSize: 15,
    textAlign: "center",
  },
});
