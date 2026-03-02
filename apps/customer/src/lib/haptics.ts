import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Haptic feedback utilities. No-ops on web.
 */
export const haptic = {
  /** Light tap for selection changes, toggles */
  light: () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  },
  /** Medium tap for button presses, confirmations */
  medium: () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  },
  /** Heavy tap for significant actions (booking confirmed, payment) */
  heavy: () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  },
  /** Success feedback (booking confirmed, payment complete) */
  success: () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  },
  /** Warning feedback (validation error, form issue) */
  warning: () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  },
  /** Error feedback (action failed) */
  error: () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  },
  /** Minimal selection tap for list items, minor toggles */
  selection: () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  },
};
