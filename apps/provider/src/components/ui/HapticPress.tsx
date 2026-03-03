import { useCallback } from "react";
import {
  TouchableOpacity,
  type TouchableOpacityProps,
} from "react-native";
import * as Haptics from "expo-haptics";

interface HapticPressProps extends TouchableOpacityProps {
  haptic?: "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection" | "none";
}

const hapticMap = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  selection: () => Haptics.selectionAsync(),
  none: () => {},
};

export function HapticPress({
  haptic = "light",
  onPress,
  children,
  ...rest
}: HapticPressProps) {
  const handlePress = useCallback(
    (e: Parameters<NonNullable<TouchableOpacityProps["onPress"]>>[0]) => {
      hapticMap[haptic]();
      onPress?.(e);
    },
    [haptic, onPress],
  );

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      {...rest}
    >
      {children}
    </TouchableOpacity>
  );
}
