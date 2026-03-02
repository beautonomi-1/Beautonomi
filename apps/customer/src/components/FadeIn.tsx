import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  type SharedValue,
} from "react-native-reanimated";

interface FadeInProps {
  children: React.ReactNode;
  /** Delay before the animation starts (ms) */
  delay?: number;
  /** Duration of the fade/slide animation (ms) */
  duration?: number;
}

export function FadeIn({ children, delay = 0, duration = 300 }: FadeInProps) {
  const opacity: SharedValue<number> = useSharedValue(0);
  const translateY: SharedValue<number> = useSharedValue(10);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration }));
    translateY.value = withDelay(delay, withTiming(0, { duration }));
  }, [delay, duration, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
