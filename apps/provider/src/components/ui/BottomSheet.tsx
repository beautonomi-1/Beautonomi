import {
  useEffect,
  useCallback,
  useRef,
  type ComponentType,
  type PropsWithChildren,
  type RefObject,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  Keyboard,
  Dimensions,
  useWindowDimensions,
} from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Fires after the modal finishes its dismiss animation (best-effort). */
  onModalHide?: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  snapHeight?: "auto" | "half" | "full";
  showHandle?: boolean;
  /** Optional ref for the sheet's main vertical ScrollView (section jump / scroll reset). */
  contentScrollRef?: RefObject<ScrollView | null>;
}

const GestureRoot = GestureHandlerRootView as ComponentType<
  PropsWithChildren<{ style?: { flex: number } }>
>;

export function BottomSheet({
  visible,
  onClose,
  onModalHide,
  title,
  subtitle,
  children,
  footer,
  snapHeight = "auto",
  showHandle = true,
  contentScrollRef,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const wasVisibleRef = useRef(false);

  // Initialize with a large enough value to be off-screen
  const translateY = useSharedValue(Dimensions.get("window").height * 2);
  const backdropOpacity = useSharedValue(0);

  const snapHeights = {
    auto: screenHeight * 0.8,
    half: screenHeight * 0.55,
    full: screenHeight * 0.92,
  };
  const sheetHeight = snapHeights[snapHeight];

  const closeSheet = useCallback(() => {
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateY.value = withTiming(screenHeight, {
      duration: 250,
      easing: Easing.out(Easing.ease),
    });
    backdropOpacity.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(onClose)();
    });
  }, [onClose, translateY, backdropOpacity, screenHeight]);

  useEffect(() => {
    const opening = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (!opening) return;
    translateY.value = screenHeight;
    backdropOpacity.value = 0;
    translateY.value = withSpring(0, { damping: 20, stiffness: 90 });
    backdropOpacity.value = withTiming(1, { duration: 250 });
  }, [visible, translateY, backdropOpacity, screenHeight]);

  useEffect(() => {
    if (visible || !onModalHide) return;
    const timer = setTimeout(() => onModalHide(), 280);
    return () => clearTimeout(timer);
  }, [visible, onModalHide]);

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

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeSheet}>
      <GestureRoot style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }, backdropAnimatedStyle]}>
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
              onPress={closeSheet}
              accessibilityLabel="Close"
              accessibilityRole="button"
            />
          </Animated.View>

          <KeyboardAvoidingView
            style={{
              flex: 1,
              justifyContent: "flex-end",
            }}
            behavior="padding"
            keyboardVerticalOffset={0}
          >
            <Animated.View
              style={[
                {
                  width: "100%",
                  flexShrink: 1,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
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
              {showHandle && (
                <GestureDetector gesture={panGesture}>
                  <Animated.View style={{ alignItems: "center", paddingBottom: 4, paddingTop: 12 }}>
                    <View style={{ height: 4, width: 40, borderRadius: 2, backgroundColor: "#d1d5db" }} />
                  </Animated.View>
                </GestureDetector>
              )}

              {title && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingHorizontal: 20, paddingBottom: 12, paddingTop: 4 }}>
                  <View style={{ marginEnd: 12, flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>{title}</Text>
                    {subtitle && (
                      <Text style={{ marginTop: 2, fontSize: 12, color: "#6b7280" }}>{subtitle}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={closeSheet}
                    style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#f3f4f6" }}
                    accessibilityLabel="Close"
                    accessibilityRole="button"
                  >
                    <Ionicons name="close" size={18} color="#374151" />
                  </TouchableOpacity>
                </View>
              )}

              <ScrollView
                ref={contentScrollRef}
                style={{ flexShrink: 1, backgroundColor: "#ffffff" }}
                contentContainerStyle={{
                  padding: 20,
                  paddingBottom: footer ? 20 : 40 + insets.bottom,
                  backgroundColor: "#ffffff",
                }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {children}
              </ScrollView>

              {footer && (
                <View style={{ padding: 20, paddingBottom: 20 + insets.bottom, borderTopWidth: 1, borderTopColor: "#f3f4f6", backgroundColor: "#ffffff" }}>
                  {footer}
                </View>
              )}

              {!footer && <SafeAreaView edges={["bottom"]} />}
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </GestureRoot>
    </Modal>
  );
}
