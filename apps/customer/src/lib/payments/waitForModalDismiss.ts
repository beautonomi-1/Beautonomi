import { InteractionManager } from "react-native";

/** Wait for RN modal dismiss + interactions before opening another modal (Custom Tab). */
export function waitForModalDismiss(extraMs = 320): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(resolve, extraMs);
    });
  });
}
