import { useEffect, useRef } from "react";

const DEFAULT_HIDE_MS = 280;

/**
 * Invokes `onAfterHide` once per visible → hidden transition (after `delayMs`).
 * Callback identity changes do not re-fire. Does not fire on mount.
 */
export function useAfterHide(
  visible: boolean,
  onAfterHide: (() => void) | undefined,
  delayMs: number = DEFAULT_HIDE_MS,
) {
  const wasVisibleRef = useRef(false);
  const callbackRef = useRef(onAfterHide);
  callbackRef.current = onAfterHide;

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;

    if (wasVisible && !visible && callbackRef.current) {
      const timer = setTimeout(() => {
        callbackRef.current?.();
      }, delayMs);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible, delayMs]);
}
