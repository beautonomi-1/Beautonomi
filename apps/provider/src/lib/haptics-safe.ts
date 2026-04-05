import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** Haptics are no-ops on web and fail silently on unsupported devices. */
export function hapticLight(): void {
  if (Platform.OS === "web") return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticMedium(): void {
  if (Platform.OS === "web") return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
