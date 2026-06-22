import { forwardRef, useImperativeHandle, useRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { useOnboardingScroll } from "./OnboardingScrollContext";

export const FocusAwareTextInput = forwardRef<TextInput, TextInputProps>(
  function FocusAwareTextInput({ onFocus, ...rest }, ref) {
    const innerRef = useRef<TextInput>(null);
    const scroll = useOnboardingScroll();

    useImperativeHandle(ref, () => innerRef.current as TextInput);

    return (
      <TextInput
        ref={innerRef}
        onFocus={(event) => {
          onFocus?.(event);
          scroll?.scrollToFocusedInput(innerRef);
        }}
        {...rest}
      />
    );
  },
);

FocusAwareTextInput.displayName = "FocusAwareTextInput";
