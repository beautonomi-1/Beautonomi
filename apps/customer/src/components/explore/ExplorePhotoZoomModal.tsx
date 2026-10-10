import { useEffect } from "react";
import { Modal, Pressable, View, Text, useWindowDimensions, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
  closeLabel?: string;
};

const MAX_ZOOM = 3;
const DOUBLE_TAP_ZOOM = 2.25;

export function ExplorePhotoZoomModal({ uri, visible, onClose, closeLabel = "Close" }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const reset = () => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(MAX_ZOOM, Math.max(1, next));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.02) {
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.05) {
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = DOUBLE_TAP_ZOOM;
        savedScale.value = DOUBLE_TAP_ZOOM;
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd(() => {
      if (scale.value <= 1.05) {
        runOnJS(onClose)();
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)" }}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <Pressable
          onPress={onClose}
          style={{
            position: "absolute",
            top: insets.top + 8,
            right: 16,
            zIndex: 2,
            padding: 8,
          }}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <GestureDetector gesture={composed}>
          <Animated.View
            style={[
              {
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                width,
                height: height - insets.top,
                marginTop: insets.top,
                zIndex: 1,
              },
              imageStyle,
            ]}
          >
            <Image
              source={{ uri }}
              style={{ width: width, height: width * 1.25, maxHeight: height * 0.85 }}
              contentFit="contain"
            />
          </Animated.View>
        </GestureDetector>
        <Text
          style={{
            position: "absolute",
            bottom: insets.bottom + 12,
            alignSelf: "center",
            color: "rgba(255,255,255,0.65)",
            fontSize: 12,
            zIndex: 2,
          }}
          pointerEvents="none"
        >
          Pinch to zoom · Double-tap to expand or reset · Tap to close when not zoomed
        </Text>
      </View>
    </Modal>
  );
}
