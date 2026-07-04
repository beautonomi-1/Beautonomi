import { findNodeHandle, type ScrollView, type TextInput } from "react-native";
import { useCallback, type RefObject } from "react";

export const DEFAULT_SCROLL_OFFSET = 96;
/** Multiline fields near the bottom of a step need more clearance above the keyboard. */
export const MULTILINE_SCROLL_OFFSET = 200;

const SCROLL_RETRY_DELAYS_MS = [0, 120, 350] as const;

export function computeScrollTargetY(
  contentY: number,
  offset = DEFAULT_SCROLL_OFFSET,
): number {
  return Math.max(0, contentY - offset);
}

type ScrollResponder = {
  scrollResponderScrollNativeHandleToKeyboard?: (
    nodeHandle: number,
    additionalOffset: number,
    preventNegativeScrollOffset: boolean,
  ) => void;
};

function scrollViaResponder(
  scroll: ScrollView,
  input: TextInput,
  offset: number,
): boolean {
  const inputNode = findNodeHandle(input);
  if (!inputNode) return false;

  const responder = (
    scroll as ScrollView & { getScrollResponder?: () => ScrollResponder }
  ).getScrollResponder?.();

  if (!responder?.scrollResponderScrollNativeHandleToKeyboard) return false;

  responder.scrollResponderScrollNativeHandleToKeyboard(inputNode, offset, true);
  return true;
}

export function scrollFocusedInputIntoView(
  scrollRef: RefObject<ScrollView | null>,
  inputRef: RefObject<TextInput | null>,
  offset = DEFAULT_SCROLL_OFFSET,
) {
  const scroll = scrollRef.current;
  const input = inputRef.current;
  if (!scroll || !input) return;

  const run = () => {
    const activeScroll = scrollRef.current;
    const activeInput = inputRef.current;
    if (!activeScroll || !activeInput) return;

    if (scrollViaResponder(activeScroll, activeInput, offset)) return;

    const scrollNode = findNodeHandle(activeScroll);
    if (!scrollNode) return;

    activeInput.measureLayout(
      scrollNode,
      (_left, top) => {
        activeScroll.scrollTo({
          y: computeScrollTargetY(top, offset),
          animated: true,
        });
      },
      () => {
        scrollViaResponder(activeScroll, activeInput, offset);
      },
    );
  };

  for (const delay of SCROLL_RETRY_DELAYS_MS) {
    if (delay === 0) {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, delay);
    }
  }
}

export function useScrollToFocusedInput(
  scrollRef: RefObject<ScrollView | null>,
  offset = DEFAULT_SCROLL_OFFSET,
) {
  return useCallback(
    (inputRef: RefObject<TextInput | null>) => () => {
      scrollFocusedInputIntoView(scrollRef, inputRef, offset);
    },
    [scrollRef, offset],
  );
}
