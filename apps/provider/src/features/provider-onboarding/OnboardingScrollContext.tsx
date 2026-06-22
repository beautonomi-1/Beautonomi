import { createContext, useContext, useMemo, type ReactNode, type RefObject } from "react";
import { ScrollView, type TextInput } from "react-native";
import { scrollFocusedInputIntoView } from "@/hooks/useScrollToFocusedInput";

type OnboardingScrollContextValue = {
  scrollToFocusedInput: (inputRef: RefObject<TextInput | null>) => void;
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
      scrollToFocusedInput: (inputRef: RefObject<TextInput | null>) => {
        scrollFocusedInputIntoView(scrollRef, inputRef);
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
