/**
 * Edge-to-edge Android 15+ safe keyboard avoidance (replaces RN KeyboardAvoidingView).
 * Requires KeyboardProvider at the app root.
 */
import {
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
} from "react-native-keyboard-controller";

export function AppKeyboardAvoidingView({
  behavior,
  ...rest
}: KeyboardAvoidingViewProps) {
  // Legacy call sites pass `behavior={undefined}` on Android — coerce to padding so
  // edge-to-edge devices still lift inputs above the keyboard.
  return <KeyboardAvoidingView behavior={behavior ?? "padding"} {...rest} />;
}

export type { KeyboardAvoidingViewProps };
