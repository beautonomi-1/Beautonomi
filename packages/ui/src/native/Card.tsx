import React from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { colors, shadowsRN } from "@beautonomi/ui-tokens";
import type { CardProps } from "../types";

const paddingMap: Record<NonNullable<CardProps["padding"]>, number> = {
  none: 0,
  sm: 8,
  md: 16,
  lg: 24,
};

const shadowMap: Record<NonNullable<CardProps["shadow"]>, ViewStyle> = {
  none: shadowsRN.none as ViewStyle,
  sm: shadowsRN.sm as ViewStyle,
  md: shadowsRN.md as ViewStyle,
  lg: shadowsRN.lg as ViewStyle,
};

export function Card({
  children,
  padding = "md",
  shadow = "sm",
}: CardProps) {
  return (
    <View
      style={[
        styles.card,
        { padding: paddingMap[padding] },
        shadowMap[shadow],
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
