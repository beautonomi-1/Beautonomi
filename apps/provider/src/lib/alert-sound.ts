/**
 * Lightweight alert cue for in-app banners (orders, messages).
 */
import { Platform, Vibration } from "react-native";

export async function playAlertCue(): Promise<{ stop: () => void }> {
  if (Platform.OS === "web") {
    return { stop: () => {} };
  }
  try {
    Vibration.vibrate([0, 120, 80, 120]);
    return {
      stop: () => {
        Vibration.cancel();
      },
    };
  } catch {
    return { stop: () => {} };
  }
}
