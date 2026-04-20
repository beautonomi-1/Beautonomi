import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, useColorScheme } from "react-native";
import { colors, colorsDark } from "@beautonomi/ui-tokens";

const AnimatedView = Animated.View;

export interface GateLoadingScreenProps {
  message?: string;
  primaryColor?: string;
  backgroundColor?: string;
  testID?: string;
}

/**
 * Full-screen auth / portal gate loader: pulsing brand mark + optional message.
 * Mirrors apps/customer/src/components/GateLoadingScreen.tsx — keep in sync.
 */
export function GateLoadingScreen({
  message,
  primaryColor,
  backgroundColor,
  testID,
}: GateLoadingScreenProps) {
  const scheme = useColorScheme();
  const palette = scheme === "dark" ? colorsDark : colors;
  const accent = primaryColor ?? palette.primary;
  const bg = backgroundColor ?? palette.background;
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const markStyle = {
    opacity: pulse,
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: [0.35, 1],
          outputRange: [0.92, 1],
        }),
      },
    ],
  };

  return (
    <View
      style={[styles.root, { backgroundColor: bg }]}
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? "Loading"}
      testID={testID}
    >
      <AnimatedView
        style={[
          styles.mark,
          { backgroundColor: accent, borderColor: accent },
          markStyle,
        ]}
      />
      {message ? (
        <Text style={[styles.message, { color: palette.mutedForeground }]}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 400,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
  },
  message: {
    marginTop: 24,
    fontSize: 16,
    textAlign: "center",
    maxWidth: 280,
  },
});
