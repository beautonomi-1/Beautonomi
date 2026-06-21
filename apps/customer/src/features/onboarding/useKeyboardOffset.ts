import { useCallback, useState } from "react";
import { Platform, type LayoutChangeEvent } from "react-native";

export function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    if (Platform.OS !== "ios") return;
    // `currentTarget` can be null when the layout event fires after the node
    // detaches; guard before measuring to avoid a null-deref crash.
    const target = e?.currentTarget;
    if (!target || typeof target.measureInWindow !== "function") return;
    target.measureInWindow((_x, y) => setOffset(Math.round(y)));
  }, []);
  return { offset: Platform.OS === "ios" ? offset : 0, onLayout };
}
