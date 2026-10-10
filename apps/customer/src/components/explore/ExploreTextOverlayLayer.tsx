import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { ExploreTextOverlay } from "@/types/api";

type Props = {
  overlays: ExploreTextOverlay[];
  /** Min layout dimension (px) — `font_size` is normalized 0–1 vs this, matching web vw scaling. */
  layoutMin?: number;
};

export function ExploreTextOverlayLayer({ overlays, layoutMin = 320 }: Props) {
  if (!overlays.length) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {overlays.map((layer, i) => (
        <View
          key={`${i}-${layer.text.slice(0, 8)}`}
          style={{
            position: "absolute",
            left: `${layer.x * 100}%`,
            top: `${layer.y * 100}%`,
            transform: [{ translateX: -50 }, { translateY: -50 }],
            maxWidth: "85%",
            backgroundColor: "rgba(0,0,0,0.45)",
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text
            style={{
              color: layer.color,
              fontSize: Math.max(12, Math.min(28, layer.font_size * layoutMin)),
              textAlign: layer.align ?? "center",
            }}
          >
            {layer.text}
          </Text>
        </View>
      ))}
    </View>
  );
}
