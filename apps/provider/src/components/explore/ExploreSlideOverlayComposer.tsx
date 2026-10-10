import { useCallback, useMemo, useRef } from "react";
import { View, Text, PanResponder, type LayoutChangeEvent } from "react-native";
import { twStyle } from "@/lib/twStyle";

export type ComposerTextOverlay = {
  text: string;
  x: number;
  y: number;
  font_size: number;
  color: string;
  align: "center";
};

type Props = {
  size?: number;
  preview: React.ReactNode;
  overlays: ComposerTextOverlay[];
  onChangeOverlays: (layers: ComposerTextOverlay[]) => void;
  dragHint?: string;
};

function clamp01(n: number, min = 0.05, max = 0.95) {
  return Math.min(max, Math.max(min, n));
}

export function ExploreSlideOverlayComposer({
  size = 280,
  preview,
  overlays,
  onChangeOverlays,
  dragHint,
}: Props) {
  const layoutRef = useRef({ w: size, h: size });
  const dragOriginRef = useRef({ x: 0, y: 0, layerIndex: 0 });
  const overlaysRef = useRef(overlays);
  const onChangeRef = useRef(onChangeOverlays);
  overlaysRef.current = overlays;
  onChangeRef.current = onChangeOverlays;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) layoutRef.current = { w: width, h: height };
  }, []);

  const overlayCount = overlays.length;
  const panHandlers = useMemo(() => {
    return Array.from({ length: overlayCount }, (_, layerIndex) => {
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          const layer = overlaysRef.current[layerIndex];
          dragOriginRef.current = {
            x: layer?.x ?? 0.5,
            y: layer?.y ?? 0.5,
            layerIndex,
          };
        },
        onPanResponderMove: (_, g) => {
          const { w, h } = layoutRef.current;
          const { x: ox, y: oy, layerIndex: idx } = dragOriginRef.current;
          const nx = clamp01(ox + g.dx / w);
          const ny = clamp01(oy + g.dy / h);
          onChangeRef.current(
            overlaysRef.current.map((layer, i) => (i === idx ? { ...layer, x: nx, y: ny } : layer)),
          );
        },
      }).panHandlers;
    });
  }, [overlayCount]);

  if (!overlayCount) return null;

  return (
    <View style={twStyle("mb-3")}>
      {dragHint ? (
        <Text style={twStyle("mb-2 text-xs text-gray-500")}>{dragHint}</Text>
      ) : null}
      <View
        onLayout={onLayout}
        style={{
          width: size,
          height: size,
          alignSelf: "center",
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: "#111",
        }}
      >
        {preview}
        <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
          {overlays.map((layer, i) => (
            <View
              key={`${i}-${layer.text.slice(0, 12)}`}
              {...(panHandlers[i] ?? {})}
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
                  fontSize: Math.max(12, Math.min(22, layer.font_size * size * 0.9)),
                  textAlign: "center",
                }}
              >
                {layer.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
