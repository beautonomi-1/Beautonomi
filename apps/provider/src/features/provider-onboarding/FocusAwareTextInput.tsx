import { forwardRef, useImperativeHandle, useRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { DEFAULT_SCROLL_OFFSET } from "@/hooks/useScrollToFocusedInput";
import { useOnboardingScroll } from "./OnboardingScrollContext";

export type FocusAwareTextInputProps = TextInputProps & {
  focusScrollOffset?: number;
};

export const FocusAwareTextInput = forwardRef<TextInput, FocusAwareTextInputProps>(
  function FocusAwareTextInput({ onFocus, focusScrollOffset, ...rest }, ref) {
    const innerRef = useRef<TextInput>(null);
    const scroll = useOnboardingScroll();

    useImperativeHandle(ref, () => innerRef.current as TextInput);

    return (
      <TextInput
        ref={innerRef}
        onFocus={(event) => {
          onFocus?.(event);
          scroll?.scrollToFocusedInput(innerRef, {
            offset: focusScrollOffset ?? DEFAULT_SCROLL_OFFSET,
          });
        }}
        {...rest}
      />
    );
  },
);

FocusAwareTextInput.displayName = "FocusAwareTextInput";
