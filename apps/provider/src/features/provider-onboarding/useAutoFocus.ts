import { useEffect, type RefObject } from "react";
import { InteractionManager, type TextInput } from "react-native";

export function useAutoFocus(ref: RefObject<TextInput | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => ref.current?.focus());
    });
    return () => task.cancel();
  }, [ref, enabled]);
}
