import { useEffect } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { Colors } from "@/constants/colors";
import { BEAUTONOMI_B_PATH, BEAUTONOMI_SWIRL_PATH } from "@/components/brand-glyph-paths";

const AnimatedView = Animated.View;

export interface BrandGlyphPulseProps {
  size?: number;
  accentColor?: string;
  /** Card background; defaults to white / dark translucent. */
  cardBackgroundColor?: string;
}

/** Reusable pulsing brand glyph for overlays and loaders. */
export function BrandGlyphPulse({
  size = 56,
  accentColor = Colors.primary,
  cardBackgroundColor,
}: BrandGlyphPulseProps) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const glyphStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [0.94, 1.04]);
    const opacity = interpolate(pulse.value, [0, 1], [0.85, 1]);
    return { transform: [{ scale }], opacity };
  });

  const iconSize = Math.round(size * 0.55);
  const bg = cardBackgroundColor ?? (isDark ? "rgba(255,255,255,0.08)" : "#ffffff");

  return (
    <AnimatedView
      style={[
        styles.card,
        {
          width: size,
          height: size,
          borderRadius: size * 0.26,
          backgroundColor: bg,
          shadowColor: accentColor,
        },
        glyphStyle,
      ]}
    >
      <Svg width={iconSize} height={iconSize} viewBox="0 0 500 500" fill="none">
        <Path d={BEAUTONOMI_B_PATH} fill={accentColor} />
        <Path d={BEAUTONOMI_SWIRL_PATH} fill={accentColor} />
      </Svg>
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
