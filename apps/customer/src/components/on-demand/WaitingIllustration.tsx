/**
 * Illustration for on-demand waiting screen: phone with subtle "finger tapping" animation
 * to convey waiting state. Replace with a Lottie or image asset when available.
 */
import React, { useEffect } from "react";
import { View } from "react-native";
import { Colors } from "@/constants/colors";
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
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 24 }}>
      <View style={{ position: "relative", alignItems: "center", justifyContent: "center" }}>
        <AnimatedView
          style={[
            phoneStyle,
            {
              width: 128,
              height: 224,
              borderRadius: 32,
              borderWidth: 4,
              borderColor: Colors.gray[300],
              backgroundColor: Colors.white,
              alignItems: "center",
              justifyContent: "flex-end",
              paddingBottom: 16,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 6,
            },
          ]}
        >
          <View style={{ width: "100%", flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: Colors.gray[100], overflow: "hidden" }} />
          <View style={{ width: 80, height: 4, borderRadius: 2, backgroundColor: Colors.gray[300] }} />
        </AnimatedView>
        <AnimatedView
          style={[
            fingerStyle,
            {
              position: "absolute",
              bottom: -8,
              right: 8,
              width: 32,
              height: 40,
              borderRadius: 16,
              backgroundColor: "rgba(255,0,119,0.8)",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingBottom: 4,
            },
          ]}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.9)" }} />
        </AnimatedView>
      </View>
      <View style={{ flexDirection: "row", marginTop: 24, opacity: 0.6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,0,119,0.5)", marginRight: 12 }} />
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "rgba(255,0,119,0.3)", marginRight: 12 }} />
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,0,119,0.5)" }} />
      </View>
    </View>
  );
}
