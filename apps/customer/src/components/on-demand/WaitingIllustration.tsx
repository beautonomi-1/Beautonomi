/**
 * Illustration for on-demand waiting screen: phone with subtle "finger tapping" animation
 * to convey waiting state. Replace with a Lottie or image asset when available.
 */
import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";

const AnimatedView = Animated.View;

export function WaitingIllustration() {
  const tapScale = useSharedValue(1);
  const phoneGlow = useSharedValue(0.4);

  useEffect(() => {
    tapScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 400, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    phoneGlow.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [tapScale, phoneGlow]);

  const fingerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tapScale.value }],
  }));

  const phoneStyle = useAnimatedStyle(() => ({
    opacity: 0.85 + phoneGlow.value * 0.15,
  }));

  return (
    <View className="items-center justify-center py-6">
      <View className="relative items-center justify-center">
        {/* Phone outline */}
        <AnimatedView
          style={phoneStyle}
          className="w-32 h-56 rounded-[2rem] border-4 border-gray-300 bg-white items-center justify-end pb-4 shadow-lg"
        >
          <View className="w-full flex-1 rounded-t-3xl bg-gray-100 overflow-hidden" />
          <View className="w-20 h-1 rounded-full bg-gray-300" />
        </AnimatedView>
        {/* Finger tap indicator - suggests "waiting / checking" */}
        <AnimatedView
          style={fingerStyle}
          className="absolute -bottom-2 right-2 w-8 h-10 rounded-full bg-primary/80 items-center justify-end pb-1"
        >
          <View className="w-2 h-2 rounded-full bg-white/90" />
        </AnimatedView>
      </View>
      {/* Decorative dots (floating shapes feel) */}
      <View className="flex-row gap-3 mt-6 opacity-60">
        <View className="w-2 h-2 rounded-full bg-primary/50" />
        <View className="w-3 h-3 rounded-full bg-primary/30" />
        <View className="w-2 h-2 rounded-full bg-primary/50" />
      </View>
    </View>
  );
}
