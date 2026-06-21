/**
 * Edge-to-edge Android 15+ safe keyboard avoidance (replaces RN KeyboardAvoidingView).
 * Requires KeyboardProvider at the app root.
 */
import {
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
} from "react-native-keyboard-controller";

type SupportedBehavior = "height" | "padding" | "translate-with-padding";

function normalizeBehavior(
  behavior?: KeyboardAvoidingViewProps["behavior"],
): SupportedBehavior {
  if (!behavior || behavior === "position") {
    return "padding";
  }
  return behavior;
}

export function AppKeyboardAvoidingView({
  behavior,
  contentContainerStyle: _contentContainerStyle,
  ...rest
}: KeyboardAvoidingViewProps) {
  return (
    <KeyboardAvoidingView behavior={normalizeBehavior(behavior)} {...rest} />
  );
}

export type { KeyboardAvoidingViewProps };
