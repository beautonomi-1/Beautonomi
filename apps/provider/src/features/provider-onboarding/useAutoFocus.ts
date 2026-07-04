import { useEffect, type RefObject } from "react";
import { InteractionManager, type TextInput } from "react-native";
import { useOnboardingScroll } from "./OnboardingScrollContext";

const FOCUS_RETRY_DELAYS_MS = [0, 120, 350] as const;

export type UseAutoFocusOptions = {
  /** Scroll the wizard to the top before focusing (fresh step entry). */
  resetScrollFirst?: boolean;
};

export function useAutoFocus(
  ref: RefObject<TextInput | null>,
  enabled = true,
  options?: UseAutoFocusOptions,
) {
  const scroll = useOnboardingScroll();

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const focus = () => {
      if (cancelled) return;
      ref.current?.focus();
    };

    const task = InteractionManager.runAfterInteractions(() => {
      if (options?.resetScrollFirst) {
        scroll?.scrollToTop();
      }
      for (const delay of FOCUS_RETRY_DELAYS_MS) {
        if (delay === 0) {
          requestAnimationFrame(focus);
        } else {
          setTimeout(focus, delay);
        }
      }
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [ref, enabled, scroll, options?.resetScrollFirst]);
}
