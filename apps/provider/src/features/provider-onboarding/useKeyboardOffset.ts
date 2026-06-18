import { useCallback, useState } from "react";
import { Platform, type LayoutChangeEvent } from "react-native";

export function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    if (Platform.OS !== "ios") return;
    e.currentTarget.measureInWindow((_x, y) => setOffset(Math.round(y)));
  }, []);
  return { offset: Platform.OS === "ios" ? offset : 0, onLayout };
}
