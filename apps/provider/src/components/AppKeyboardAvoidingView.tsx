/**
 * Edge-to-edge Android 15+ safe keyboard avoidance (replaces RN KeyboardAvoidingView).
 * Requires KeyboardProvider at the app root. Pass `autoOffset` on chat/composer screens.
 */
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  findNodeHandle,
  Platform,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  KeyboardAvoidingView,
  KeyboardControllerNative,
  KeyboardEvents,
  type KeyboardAvoidingViewProps,
} from "react-native-keyboard-controller";
import { useKeyboardRootRef } from "@/providers/KeyboardRootProvider";

type SupportedBehavior = "height" | "padding" | "translate-with-padding";

function normalizeBehavior(
  behavior?: KeyboardAvoidingViewProps["behavior"],
): SupportedBehavior {
  if (!behavior || behavior === "position") {
    return "padding";
  }
  return behavior;
}

export type AppKeyboardAvoidingViewProps = KeyboardAvoidingViewProps & {
  /** Measure absolute Y vs KeyboardRootProvider and set keyboardVerticalOffset automatically. */
  autoOffset?: boolean;
};

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref && typeof ref === "object") {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

export const AppKeyboardAvoidingView = forwardRef<View, AppKeyboardAvoidingViewProps>(
  function AppKeyboardAvoidingView(
    {
      behavior,
      contentContainerStyle: _contentContainerStyle,
      autoOffset = false,
      keyboardVerticalOffset = 0,
      onLayout: onLayoutProps,
      collapsable: collapsableProp,
      ...rest
    },
    forwardedRef,
  ) {
    const rootRef = useKeyboardRootRef();
    const internalRef = useRef<View | null>(null);
    const layoutYRef = useRef(0);
    const [autoOffsetY, setAutoOffsetY] = useState<number | null>(null);

    const measure = useCallback(() => {
      if (!autoOffset || Platform.OS === "web" || !rootRef?.current) return;
      const kav = internalRef.current;
      const root = rootRef.current;
      if (!kav || !root) return;
      const kavTag = findNodeHandle(kav);
      const rootTag = findNodeHandle(root);
      if (kavTag == null || rootTag == null) return;

      Promise.all([
        KeyboardControllerNative.viewPositionInWindow(kavTag),
        KeyboardControllerNative.viewPositionInWindow(rootTag),
      ])
        .then(([kavPos, rootPos]) => {
          const kavY = kavPos.y;
          const rootY = rootPos.y;
          if (!Number.isFinite(kavY) || !Number.isFinite(rootY)) return;
          const next = Math.max(0, Math.round(kavY - rootY - layoutYRef.current));
          setAutoOffsetY((prev) => (prev === next ? prev : next));
        })
        .catch(() => {
          /* keep previous offset */
        });
    }, [autoOffset, rootRef]);

    const onLayout = useCallback(
      (e: LayoutChangeEvent) => {
        onLayoutProps?.(e);
        layoutYRef.current = e.nativeEvent.layout.y;
        if (autoOffset) {
          measure();
        }
      },
      [onLayoutProps, autoOffset, measure],
    );

    useEffect(() => {
      if (!autoOffset || Platform.OS === "web") return;
      const sub = KeyboardEvents.addListener("keyboardWillShow", measure);
      return () => sub.remove();
    }, [autoOffset, measure]);

    const combinedRef = useCallback(
      (node: View | null) => {
        internalRef.current = node;
        assignRef(forwardedRef, node);
      },
      [forwardedRef],
    );

    const effectiveOffset = autoOffset && autoOffsetY != null ? autoOffsetY : keyboardVerticalOffset;
    const collapsable = autoOffset && Platform.OS !== "web" ? false : collapsableProp;

    return (
      <KeyboardAvoidingView
        ref={combinedRef}
        behavior={normalizeBehavior(behavior)}
        keyboardVerticalOffset={effectiveOffset}
        onLayout={onLayout}
        collapsable={collapsable}
        {...rest}
      />
    );
  },
);

export type { KeyboardAvoidingViewProps };