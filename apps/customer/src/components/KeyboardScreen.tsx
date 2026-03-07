/**
 * KeyboardScreen – wraps content in KeyboardAvoidingView + ScrollView.
 * Handles iOS/Android keyboard avoidance automatically.
 * Uses responsive content padding (tablet: 24, phone: 16).
 */
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ViewStyle,
} from "react-native";
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.white }}
        contentContainerStyle={[
          { padding: contentPadding, paddingBottom },
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
