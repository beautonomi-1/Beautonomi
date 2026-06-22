import { findNodeHandle, type ScrollView, type TextInput } from "react-native";
import { useCallback, type RefObject } from "react";

const DEFAULT_OFFSET = 96;

export function computeScrollTargetY(contentY: number, offset = DEFAULT_OFFSET): number {
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
  offset = DEFAULT_OFFSET,
) {
  const scroll = scrollRef.current;
  const input = inputRef.current;
  if (!scroll || !input) return;

  requestAnimationFrame(() => {
    if (scrollViaResponder(scroll, input, offset)) return;

    const scrollNode = findNodeHandle(scroll);
    if (!scrollNode) return;

    input.measureLayout(
      scrollNode,
      (_left, top) => {
        scroll.scrollTo({ y: computeScrollTargetY(top, offset), animated: true });
      },
      () => {
        scrollViaResponder(scroll, input, offset);
      },
    );
  });
}

export function useScrollToFocusedInput(
  scrollRef: RefObject<ScrollView | null>,
  offset = DEFAULT_OFFSET,
) {
  return useCallback(
    (inputRef: RefObject<TextInput | null>) => () => {
      scrollFocusedInputIntoView(scrollRef, inputRef, offset);
    },
    [scrollRef, offset],
  );
}
