/**
 * KeyboardScreen – wraps content in AppKeyboardAvoidingView + ScrollView.
 * Handles iOS/Android keyboard avoidance (including Android 15 edge-to-edge).
 */
import { Platform, ScrollView, type ViewStyle } from "react-native";
import { AppKeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useResponsive } from "@/hooks/useResponsive";
import { STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { Colors } from "@/constants/colors";

interface KeyboardScreenProps {
  children: React.ReactNode;
  /** Additional bottom padding (default: STACK_CONTENT_PADDING_BOTTOM) */
  paddingBottom?: number;
  /** Override content container style */
  contentContainerStyle?: ViewStyle;
  /** Show vertical scroll indicator (default: false) */
  showsVerticalScrollIndicator?: boolean;
}

export function KeyboardScreen({
  children,
  paddingBottom = STACK_CONTENT_PADDING_BOTTOM,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
}: KeyboardScreenProps) {
  const { contentPadding } = useResponsive();
  return (
    <AppKeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.white }}
        contentContainerStyle={[
          { padding: contentPadding, paddingBottom: Math.max(paddingBottom, 220) },
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      >
        {children}
      </ScrollView>
    </AppKeyboardAvoidingView>
  );
}
