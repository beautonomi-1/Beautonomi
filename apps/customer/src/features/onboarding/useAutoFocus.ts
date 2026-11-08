import { useEffect, type RefObject } from "react";
import { type TextInput } from "react-native";
import { runAfterInteractions } from "@beautonomi/utils";

export function useAutoFocus(ref: RefObject<TextInput | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const task = runAfterInteractions(() => {
      requestAnimationFrame(() => ref.current?.focus());
    });
    return () => task.cancel();
  }, [ref, enabled]);
}
