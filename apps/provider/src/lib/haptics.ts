import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Haptic feedback utilities. No-ops on web.
 */
export const haptic = {
  /** Light tap for selection changes, toggles */
  light: () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  },
  /** Medium tap for button presses, confirmations */
  medium: () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  },
  /** Heavy tap for significant actions (booking confirmed, payment) */
  heavy: () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
  },
  /** Success feedback (booking confirmed, payment complete) */
  success: () => {
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  },
  /** Warning feedback (validation error, form issue) */
  warning: () => {
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  },
  /** Error feedback (action failed) */
  error: () => {
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  },
  /** Minimal selection tap for list items, minor toggles */
  selection: () => {
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync().catch(() => {});
    }
  },
};
