import { useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  snapHeight?: "auto" | "half" | "full";
  showHandle?: boolean;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const SNAP_HEIGHTS = {
  auto: SCREEN_HEIGHT * 0.8,
  half: SCREEN_HEIGHT * 0.55,
  full: SCREEN_HEIGHT * 0.92,
};

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  snapHeight = "auto",
  showHandle = true,
}: BottomSheetProps) {
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const sheetHeight = SNAP_HEIGHTS[snapHeight];

  const closeSheet = useCallback(() => {
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateY.value = withTiming(SCREEN_HEIGHT, {
      duration: 250,
      easing: Easing.out(Easing.ease),
    });
    backdropOpacity.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(onClose)();
    });
  }, [onClose, translateY, backdropOpacity]);

  useEffect(() => {
    if (visible) {
      translateY.value = SCREEN_HEIGHT;
      backdropOpacity.value = 0;
      translateY.value = withSpring(0, { damping: 20, stiffness: 90 });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    }
  }, [visible, translateY, backdropOpacity]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        runOnJS(closeSheet)();
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 120 });
      }
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={closeSheet}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {/* Animated backdrop */}
          <Animated.View
            className="absolute inset-0"
            style={backdropAnimatedStyle}
          >
            <Pressable
              className="flex-1 bg-black/40"
              onPress={closeSheet}
              accessibilityLabel="Close"
              accessibilityRole="button"
            />
          </Animated.View>

          {/* Animated sheet - explicit opaque background for form content */}
          <Animated.View
            className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white"
            style={[
              {
                maxHeight: sheetHeight,
                backgroundColor: "#ffffff",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.1,
                shadowRadius: 16,
                elevation: 16,
              },
              sheetAnimatedStyle,
            ]}
          >
            {/* Drag handle */}
            {showHandle && (
              <GestureDetector gesture={panGesture}>
                <Animated.View className="items-center pb-1 pt-3">
                  <View className="h-1 w-10 rounded-full bg-gray-300" />
                </Animated.View>
              </GestureDetector>
            )}

            {/* Title bar */}
            {title && (
              <View className="flex-row items-center justify-between border-b border-gray-100 px-5 pb-3 pt-1">
                <View className="mr-3 flex-1">
                  <Text className="text-lg font-bold text-gray-900">
                    {title}
                  </Text>
                  {subtitle && (
                    <Text className="mt-0.5 text-xs text-gray-500">
                      {subtitle}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={closeSheet}
                  className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-gray-100"
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                >
                  <Ionicons name="close" size={18} color="#374151" />
                </TouchableOpacity>
              </View>
            )}

            {/* Content - solid background so form fields are not transparent */}
            <ScrollView
              className="flex-1"
              style={{ backgroundColor: "#ffffff" }}
              contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
                backgroundColor: "#ffffff",
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>

            <SafeAreaView edges={["bottom"]} />
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
