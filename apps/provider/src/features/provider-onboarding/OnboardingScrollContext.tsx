import { createContext, useContext, useMemo, type ReactNode, type RefObject } from "react";
import { ScrollView, type TextInput } from "react-native";
import {
  DEFAULT_SCROLL_OFFSET,
  scrollFocusedInputIntoView,
} from "@/hooks/useScrollToFocusedInput";

export type FocusScrollOptions = {
  offset?: number;
};

type OnboardingScrollContextValue = {
  scrollToTop: () => void;
  scrollToFocusedInput: (
    inputRef: RefObject<TextInput | null>,
    options?: FocusScrollOptions,
  ) => void;
};

const OnboardingScrollContext = createContext<OnboardingScrollContextValue | null>(null);

export function OnboardingScrollProvider({
  scrollRef,
  children,
}: {
  scrollRef: RefObject<ScrollView | null>;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      scrollToTop: () => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      },
      scrollToFocusedInput: (
        inputRef: RefObject<TextInput | null>,
        options?: FocusScrollOptions,
      ) => {
        scrollFocusedInputIntoView(
          scrollRef,
          inputRef,
          options?.offset ?? DEFAULT_SCROLL_OFFSET,
        );
      },
    }),
    [scrollRef],
  );

  return (
    <OnboardingScrollContext.Provider value={value}>{children}</OnboardingScrollContext.Provider>
  );
}

export function useOnboardingScroll() {
  return useContext(OnboardingScrollContext);
}
