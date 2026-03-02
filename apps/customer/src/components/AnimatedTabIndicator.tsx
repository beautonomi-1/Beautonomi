import { useEffect } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Colors } from "@/constants/colors";

interface AnimatedTabIndicatorProps {
  /** Zero-based index of the currently active tab */
  activeIndex: number;
  /** Total number of tabs */
  tabCount: number;
  /** Width of each individual tab in pixels */
  tabWidth: number;
  /** Visual style – "underline" shows a thin bottom bar, "pill" shows a rounded background */
  style?: "underline" | "pill";
}

const TIMING_CONFIG = { duration: 250 };

export function AnimatedTabIndicator({
  activeIndex,
  tabCount,
  tabWidth,
  style = "underline",
}: AnimatedTabIndicatorProps) {
  const translateX: SharedValue<number> = useSharedValue(activeIndex * tabWidth);

  useEffect(() => {
    translateX.value = withTiming(activeIndex * tabWidth, TIMING_CONFIG);
  }, [activeIndex, tabWidth, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const indicatorStyle: ViewStyle =
    style === "pill"
      ? {
          height: "100%",
          width: tabWidth,
          borderRadius: 9999,
          backgroundColor: Colors.primaryLight,
        }
      : {
          height: 3,
          width: tabWidth,
          borderRadius: 1.5,
          backgroundColor: Colors.primary,
        };

  return (
    <Animated.View
      style={[
        styles.base,
        indicatorStyle,
        style === "underline" ? styles.underline : styles.pill,
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    position: "absolute",
    left: 0,
  },
  underline: {
    bottom: 0,
  },
  pill: {
    top: 0,
  },
});
