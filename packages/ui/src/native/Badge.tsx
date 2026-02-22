import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@beautonomi/ui-tokens";
import type { BadgeProps } from "../types";

const variantColors: Record<NonNullable<BadgeProps["variant"]>, { bg: string; text: string }> = {
  default: { bg: colors.muted, text: colors.foreground },
  success: { bg: "#dcfce7", text: "#166534" },
  warning: { bg: "#fef3c7", text: "#92400e" },
  error: { bg: "#fee2e2", text: "#991b1b" },
  info: { bg: "#dbeafe", text: "#1e40af" },
};

export function Badge({ label, variant = "default" }: BadgeProps) {
  const scheme = variantColors[variant];

  return (
    <View style={[styles.badge, { backgroundColor: scheme.bg }]}>
      <Text style={[styles.text, { color: scheme.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
});
