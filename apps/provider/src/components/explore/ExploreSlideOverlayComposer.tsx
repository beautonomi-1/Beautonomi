import { useCallback, useEffect, useMemo } from "react";
import { View, Text, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { twStyle } from "@/lib/twStyle";
import {
  EXPLORE_OVERLAY_CENTER_MAX,
  EXPLORE_OVERLAY_CENTER_MIN,
  EXPLORE_VIDEO_BOX_BORDER_PX,
  clampOverlayFontSizeNorm,
  computeExploreOverlayStageSize,
  photoOverlayFrameBox,
  photoOverlayMaxCenterY,
  videoOverlayFontPx,
  type ExploreOverlayMediaKind,
} from "@/lib/explore-overlay-preview";

export type ComposerTextOverlay = {
  text: string;
  x: number;
  y: number;
  font_size: number;
  color: string;
  align: "center";
};

type Props = {
  stageMaxWidth?: number;
  stageMaxHeight?: number;
  /** Burned frame size (Sharp output for photos, encode output for videos). */
  frameWidth: number;
  frameHeight: number;
  /** False until a photo reports its decoded size; layers are hidden so they are not placed on a guessed frame. */
  frameReady?: boolean;
  mediaKind: ExploreOverlayMediaKind;
  preview: React.ReactNode;
  overlays: ComposerTextOverlay[];
  onChangeOverlays: (layers: ComposerTextOverlay[]) => void;
  activeLayerIndex?: number;
  onSelectLayer?: (index: number) => void;
  dragHint?: string;
  /** True while a caption gesture owns the finger; parent disables its ScrollView. */
  onGestureActive?: (active: boolean) => void;
};

type LayerProps = {
  layer: ComposerTextOverlay;
  index: number;
  active: boolean;
  stageW: number;
  stageH: number;
  frameWidth: number;
  frameHeight: number;
  mediaKind: ExploreOverlayMediaKind;
  onCommit: (index: number, patch: Pick<ComposerTextOverlay, "x" | "y" | "font_size">) => void;
  onSelect: (index: number) => void;
  onGestureActive: (active: boolean) => void;
};

function clampCenter(v: number): number {
  "worklet";
  return Math.min(EXPLORE_OVERLAY_CENTER_MAX, Math.max(EXPLORE_OVERLAY_CENTER_MIN, v));
}

function OverlayLayer({
  layer,
  index,
  active,
  stageW,
  stageH,
  frameWidth,
  frameHeight,
  mediaKind,
  onCommit,
  onSelect,
  onGestureActive,
}: LayerProps) {
  const text = layer.text.trim().slice(0, 80);
  const scale = stageW / frameWidth;
  const isPhoto = mediaKind === "image";

  const cx = useSharedValue(layer.x);
  const cy = useSharedValue(layer.y);
  const font = useSharedValue(layer.font_size);
  const startX = useSharedValue(layer.x);
  const startY = useSharedValue(layer.y);
  const startFont = useSharedValue(layer.font_size);
  const labelW = useSharedValue(0);
  const labelH = useSharedValue(0);

  useEffect(() => {
    cx.value = layer.x;
    cy.value = layer.y;
    font.value = layer.font_size;
  }, [layer.x, layer.y, layer.font_size, cx, cy, font]);

  const commit = useCallback(
    (x: number, y: number, fontSize: number) => {
      onCommit(index, {
        x,
        y,
        font_size: clampOverlayFontSizeNorm(fontSize, mediaKind, frameWidth),
      });
    },
    [frameWidth, index, mediaKind, onCommit],
  );

  const clampY = (y: number, fontNorm: number): number => {
    "worklet";
    if (!isPhoto) return clampCenter(y);
    const box = photoOverlayFrameBox(0.5, 0.5, frameWidth, frameHeight, fontNorm, text);
    return Math.min(photoOverlayMaxCenterY(box.height, frameHeight), clampCenter(y));
  };

  const pan = Gesture.Pan()
    .minDistance(2)
    .hitSlop(12)
    .onBegin(() => {
      scheduleOnRN(onGestureActive, true);
    })
    .onStart(() => {
      startX.value = cx.value;
      startY.value = cy.value;
    })
    .onUpdate((e) => {
      cx.value = clampCenter(startX.value + e.translationX / stageW);
      cy.value = clampY(startY.value + e.translationY / stageH, font.value);
    })
    .onEnd(() => {
      scheduleOnRN(commit, cx.value, cy.value, font.value);
    })
    .onFinalize(() => {
      scheduleOnRN(onGestureActive, false);
    });

  const pinch = Gesture.Pinch()
    .hitSlop(24)
    .onBegin(() => {
      scheduleOnRN(onGestureActive, true);
    })
    .onStart(() => {
      startFont.value = font.value;
    })
    .onUpdate((e) => {
      font.value = clampOverlayFontSizeNorm(startFont.value * e.scale, mediaKind, frameWidth);
      cy.value = clampY(cy.value, font.value);
    })
    .onEnd(() => {
      scheduleOnRN(commit, cx.value, cy.value, font.value);
    })
    .onFinalize(() => {
      scheduleOnRN(onGestureActive, false);
    });

  const tap = Gesture.Tap().onEnd(() => {
    scheduleOnRN(onSelect, index);
  });

  const gesture = Gesture.Exclusive(Gesture.Simultaneous(pan, pinch), tap);

  const photoBoxStyle = useAnimatedStyle(() => {
    const box = photoOverlayFrameBox(cx.value, cy.value, frameWidth, frameHeight, font.value, text);
    return {
      left: box.x * scale,
      top: box.y * scale,
      width: box.width * scale,
      height: box.height * scale,
    };
  });

  const photoTextStyle = useAnimatedStyle(() => {
    const box = photoOverlayFrameBox(cx.value, cy.value, frameWidth, frameHeight, font.value, text);
    return { fontSize: box.fontPx * scale, lineHeight: box.fontPx * scale * 1.15 };
  });

  const videoBoxStyle = useAnimatedStyle(() => ({
    opacity: labelW.value > 0 ? 1 : 0,
    transform: [
      { translateX: cx.value * stageW - labelW.value / 2 },
      { translateY: cy.value * stageH - labelH.value / 2 },
    ],
  }));

  const videoTextStyle = useAnimatedStyle(() => ({
    fontSize: videoOverlayFontPx(font.value) * scale,
  }));

  const onVideoLayout = (e: LayoutChangeEvent) => {
    labelW.value = e.nativeEvent.layout.width;
    labelH.value = e.nativeEvent.layout.height;
  };

  const activeBorder = active ? { borderWidth: 1, borderColor: "rgba(255,255,255,0.9)" } : null;

  if (isPhoto) {
    return (
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            {
              position: "absolute",
              backgroundColor: "rgba(0,0,0,0.45)",
              borderRadius: 6 * scale,
              overflow: "visible",
              alignItems: "center",
              justifyContent: "center",
            },
            activeBorder,
            photoBoxStyle,
          ]}
        >
          {/* SVG text is not clipped or wrapped to the estimated box. */}
          <View
            style={{
              position: "absolute",
              left: -stageW,
              right: -stageW,
              top: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
            pointerEvents="none"
          >
            <Animated.Text
              numberOfLines={1}
              style={[{ color: layer.color, textAlign: "center" }, photoTextStyle]}
            >
              {text}
            </Animated.Text>
          </View>
        </Animated.View>
      </GestureDetector>
    );
  }

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={onVideoLayout}
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
            paddingHorizontal: EXPLORE_VIDEO_BOX_BORDER_PX * scale,
            paddingVertical: EXPLORE_VIDEO_BOX_BORDER_PX * scale,
          },
          activeBorder,
          videoBoxStyle,
        ]}
      >
        <Animated.Text numberOfLines={1} style={[{ color: layer.color }, videoTextStyle]}>
          {text}
        </Animated.Text>
      </Animated.View>
    </GestureDetector>
  );
}

export function ExploreSlideOverlayComposer({
  stageMaxWidth = 320,
  stageMaxHeight = 480,
  frameWidth,
  frameHeight,
  frameReady = true,
  mediaKind,
  preview,
  overlays,
  onChangeOverlays,
  activeLayerIndex = -1,
  onSelectLayer,
  dragHint,
  onGestureActive,
}: Props) {
  const stage = useMemo(
    () => computeExploreOverlayStageSize(frameWidth, frameHeight, stageMaxWidth, stageMaxHeight),
    [frameWidth, frameHeight, stageMaxWidth, stageMaxHeight],
  );

  const onCommit = useCallback(
    (index: number, patch: Pick<ComposerTextOverlay, "x" | "y" | "font_size">) => {
      onChangeOverlays(overlays.map((layer, i) => (i === index ? { ...layer, ...patch } : layer)));
    },
    [onChangeOverlays, overlays],
  );

  const handleGestureActive = useCallback(
    (active: boolean) => onGestureActive?.(active),
    [onGestureActive],
  );

  const handleSelect = useCallback((index: number) => onSelectLayer?.(index), [onSelectLayer]);

  useEffect(() => () => onGestureActive?.(false), [onGestureActive]);

  if (!overlays.some((l) => l.text.trim().length > 0)) return null;

  return (
    <View style={twStyle("mb-3 mt-3")}>
      {dragHint ? <Text style={twStyle("mb-2 text-xs text-gray-500")}>{dragHint}</Text> : null}
      <View
        style={{
          width: stage.width,
          height: stage.height,
          alignSelf: "center",
          overflow: "hidden",
          backgroundColor: "#111",
        }}
      >
        <View style={{ width: stage.width, height: stage.height }} pointerEvents="none">
          {preview}
        </View>
        <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
          {overlays.map((layer, i) =>
            frameReady && layer.text.trim() ? (
              <OverlayLayer
                key={i}
                layer={layer}
                index={i}
                active={i === activeLayerIndex}
                stageW={stage.width}
                stageH={stage.height}
                frameWidth={frameWidth}
                frameHeight={frameHeight}
                mediaKind={mediaKind}
                onCommit={onCommit}
                onSelect={handleSelect}
                onGestureActive={handleGestureActive}
              />
            ) : null,
          )}
        </View>
      </View>
    </View>
  );
}

