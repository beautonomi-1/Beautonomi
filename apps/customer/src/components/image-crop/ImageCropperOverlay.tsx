import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { cropImageFromTransform, computeCropFrameSize, rotateImageUri } from "./cropImage";
import { useReduceMotion } from "./useReduceMotion";
import {
  ASPECT_PRESETS,
  DEFAULT_ASPECT,
  type CropRequest,
  type CropResult,
  type CropAspect,
} from "./types";

const CROP_UI = {
  backdrop: "rgba(8, 8, 14, 0.72)",
  surface: "#12121A",
  toolbar: "#FFFFFF",
  toolbarMuted: "#6B7280",
  border: "#FFFFFF",
  grid: "rgba(255, 255, 255, 0.55)",
  handle: "#FFFFFF",
  chipBg: "rgba(255, 255, 255, 0.12)",
  chipActiveBg: Colors.primary,
  chipText: "#F9FAFB",
  chipActiveText: "#FFFFFF",
  hint: "rgba(255, 255, 255, 0.72)",
} as const;

type Props = {
  request: CropRequest;
  onClose: (result: CropResult | null) => void;
};

function aspectsEqual(a: CropAspect, b: CropAspect): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a[0] === b[0] && a[1] === b[1];
}

export function ImageCropperOverlay({ request, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  const [uri, setUri] = useState(request.uri);
  const [imageWidth, setImageWidth] = useState(request.width);
  const [imageHeight, setImageHeight] = useState(request.height);
  const [selectedAspect, setSelectedAspect] = useState<CropAspect>(
    request.lockAspect ? (request.aspect ?? DEFAULT_ASPECT) : (request.aspect ?? DEFAULT_ASPECT),
  );
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"rotate" | "done" | null>(null);

  const headerHeight = 56 + insets.top;
  const footerHeight = 112 + insets.bottom;
  const viewportWidth = screenW;
  const viewportHeight = Math.max(160, screenH - headerHeight - footerHeight);

  const cropFrame = useMemo(
    () => computeCropFrameSize(viewportWidth, viewportHeight, selectedAspect),
    [viewportWidth, viewportHeight, selectedAspect],
  );

  const cropLeft = (viewportWidth - cropFrame.width) / 2;
  const cropTop = (viewportHeight - cropFrame.height) / 2;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetTransform = useCallback(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const fitScale = Math.max(
    cropFrame.width / imageWidth,
    cropFrame.height / imageHeight,
  );
  const displayedW = imageWidth * fitScale;
  const displayedH = imageHeight * fitScale;

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const next = savedScale.value * event.scale;
      scale.value = Math.min(5, Math.max(1, next));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleAspectChange = useCallback(
    (aspect: CropAspect) => {
      setSelectedAspect(aspect);
      resetTransform();
    },
    [resetTransform],
  );

  const handleRotate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setBusyAction("rotate");
    try {
      const rotated = await rotateImageUri(uri);
      setUri(rotated.uri);
      setImageWidth(rotated.width);
      setImageHeight(rotated.height);
      resetTransform();
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [busy, resetTransform, uri]);

  const handleDone = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setBusyAction("done");
    try {
      const result = await cropImageFromTransform({
        uri,
        imageWidth,
        imageHeight,
        cropFrameWidth: cropFrame.width,
        cropFrameHeight: cropFrame.height,
        viewportWidth,
        viewportHeight,
        transform: {
          scale: scale.value,
          translateX: translateX.value,
          translateY: translateY.value,
        },
        quality: request.quality,
        outputMaxDimension: request.outputMaxDimension,
        fileName: request.fileName,
        includeBase64: request.includeBase64,
      });
      onClose(result);
    } catch {
      onClose(null);
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [
    busy,
    cropFrame.height,
    cropFrame.width,
    imageHeight,
    imageWidth,
    onClose,
    request.fileName,
    request.includeBase64,
    request.outputMaxDimension,
    request.quality,
    scale,
    translateX,
    translateY,
    uri,
    viewportHeight,
    viewportWidth,
  ]);

  const showAspectChips = !request.lockAspect;

  return (
    <Modal
      visible
      animationType={reduceMotion ? "none" : "fade"}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={() => onClose(null)}
    >
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: CROP_UI.surface }}>
        <View style={{ flex: 1, backgroundColor: CROP_UI.surface }}>
          {/* Header */}
          <View
            style={{
              paddingTop: insets.top,
              height: headerHeight,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: CROP_UI.surface,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: CROP_UI.toolbar, fontSize: 17, fontWeight: "700" }}>
              Adjust photo
            </Text>
            <Text style={{ color: CROP_UI.hint, fontSize: 13 }}>
              Pinch to zoom · drag to move
            </Text>
          </View>

          {/* Viewport */}
          <View style={{ height: viewportHeight, width: viewportWidth, overflow: "hidden" }}>
            <GestureDetector gesture={composedGesture}>
              <View style={{ flex: 1 }} collapsable={false}>
                <Animated.View
                  style={[
                    {
                      position: "absolute",
                      left: viewportWidth / 2 - displayedW / 2,
                      top: viewportHeight / 2 - displayedH / 2,
                      width: displayedW,
                      height: displayedH,
                    },
                    imageAnimatedStyle,
                  ]}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="fill"
                    accessibilityIgnoresInvertColors
                  />
                </Animated.View>
              </View>
            </GestureDetector>

            {/* Dimmed mask */}
            <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: cropTop,
                  backgroundColor: CROP_UI.backdrop,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  top: cropTop + cropFrame.height,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: CROP_UI.backdrop,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  top: cropTop,
                  left: 0,
                  width: cropLeft,
                  height: cropFrame.height,
                  backgroundColor: CROP_UI.backdrop,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  top: cropTop,
                  left: cropLeft + cropFrame.width,
                  right: 0,
                  height: cropFrame.height,
                  backgroundColor: CROP_UI.backdrop,
                }}
              />

              {/* Crop frame border + grid + handles */}
              <View
                style={{
                  position: "absolute",
                  left: cropLeft,
                  top: cropTop,
                  width: cropFrame.width,
                  height: cropFrame.height,
                  borderWidth: 2,
                  borderColor: CROP_UI.border,
                }}
              >
                {[1 / 3, 2 / 3].map((fraction) => (
                  <View
                    key={`grid-v-${fraction}`}
                    style={{
                      position: "absolute",
                      left: cropFrame.width * fraction,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      backgroundColor: CROP_UI.grid,
                    }}
                  />
                ))}
                {[1 / 3, 2 / 3].map((fraction) => (
                  <View
                    key={`grid-h-${fraction}`}
                    style={{
                      position: "absolute",
                      top: cropFrame.height * fraction,
                      left: 0,
                      right: 0,
                      height: 1,
                      backgroundColor: CROP_UI.grid,
                    }}
                  />
                ))}

                {(
                  [
                    { left: -2, top: -2 },
                    { right: -2, top: -2 },
                    { left: -2, bottom: -2 },
                    { right: -2, bottom: -2 },
                  ] as const
                ).map((pos, index) => (
                  <View
                    key={`handle-${index}`}
                    style={{
                      position: "absolute",
                      width: 18,
                      height: 18,
                      backgroundColor: CROP_UI.handle,
                      borderRadius: 2,
                      ...Platform.select({
                        ios: {
                          shadowColor: "#000",
                          shadowOpacity: 0.35,
                          shadowRadius: 3,
                          shadowOffset: { width: 0, height: 1 },
                        },
                        android: { elevation: 4 },
                        default: {},
                      }),
                      ...pos,
                    }}
                  />
                ))}
              </View>
            </View>
          </View>

          {/* Aspect chips */}
          {showAspectChips ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: 4,
              }}
            >
              {ASPECT_PRESETS.map((preset) => {
                const active = aspectsEqual(selectedAspect, preset.value);
                return (
                  <Pressable
                    key={preset.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Aspect ratio ${preset.label}`}
                    onPress={() => handleAspectChange(preset.value)}
                    style={{
                      minHeight: 36,
                      paddingHorizontal: 14,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: active ? CROP_UI.chipActiveBg : CROP_UI.chipBg,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? CROP_UI.chipActiveText : CROP_UI.chipText,
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Bottom toolbar */}
          <View
            style={{
              paddingBottom: insets.bottom + 8,
              paddingTop: 8,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: CROP_UI.surface,
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.08)",
            }}
          >
            <ToolbarButton
              label="Cancel"
              icon="close"
              onPress={() => onClose(null)}
              disabled={busy}
            />
            <ToolbarButton
              label="Rotate"
              icon="refresh"
              onPress={() => void handleRotate()}
              disabled={busy}
              loading={busyAction === "rotate"}
            />
            <ToolbarButton
              label="Reset"
              icon="scan-outline"
              onPress={resetTransform}
              disabled={busy}
            />
            <ToolbarButton
              label="Done"
              icon="checkmark"
              onPress={() => void handleDone()}
              disabled={busy}
              loading={busyAction === "done"}
              primary
            />
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ToolbarButton({
  label,
  icon,
  onPress,
  disabled,
  loading,
  primary,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={{
        minWidth: 72,
        minHeight: 56,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={primary ? Colors.primary : CROP_UI.toolbar} />
      ) : (
        <Ionicons
          name={icon}
          size={22}
          color={primary ? Colors.primary : CROP_UI.toolbar}
        />
      )}
      <Text
        style={{
          marginTop: 4,
          fontSize: 12,
          fontWeight: primary ? "700" : "600",
          color: primary ? Colors.primary : CROP_UI.toolbar,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
