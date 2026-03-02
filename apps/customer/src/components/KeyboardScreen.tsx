/**
 * KeyboardScreen – wraps content in KeyboardAvoidingView + ScrollView.
 * Handles iOS/Android keyboard avoidance automatically.
 */
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ViewStyle,
} from "react-native";
import { SCREEN_PADDING, STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";

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
  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={[
          { padding: SCREEN_PADDING, paddingBottom },
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
