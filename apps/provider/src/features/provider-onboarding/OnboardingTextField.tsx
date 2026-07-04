import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import {
  Keyboard,
  Platform,
  View,
  Text,
  TextInput,
  type TextInputProps,
} from "react-native";
import { twStyle } from "@/lib/twStyle";
import {
  DEFAULT_SCROLL_OFFSET,
  MULTILINE_SCROLL_OFFSET,
} from "@/hooks/useScrollToFocusedInput";
import { useOnboardingScroll } from "./OnboardingScrollContext";

const inputCls =
  "rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] text-slate-900 min-h-[48px]";

export interface OnboardingTextFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  containerStyle?: object;
  /** Extra top clearance when scrolling a focused field above the keyboard. */
  focusScrollOffset?: number;
}

export const OnboardingTextField = forwardRef<TextInput, OnboardingTextFieldProps>(
  function OnboardingTextField(
    {
      label,
      hint,
      value,
      onChangeText,
      accessibilityLabel,
      accessibilityHint,
      containerStyle,
      style,
      multiline,
      focusScrollOffset,
      textAlignVertical,
      blurOnSubmit,
      scrollEnabled,
      ...rest
    },
    ref,
  ) {
    const innerRef = useRef<TextInput>(null);
    const focusedRef = useRef(false);
    const scroll = useOnboardingScroll();
    useImperativeHandle(ref, () => innerRef.current as TextInput);
    const a11yLabel = accessibilityLabel ?? label;
    const { onFocus, onBlur, ...inputProps } = rest;

    const resolvedScrollOffset =
      focusScrollOffset ?? (multiline ? MULTILINE_SCROLL_OFFSET : DEFAULT_SCROLL_OFFSET);

    const scrollFocused = useCallback(() => {
      scroll?.scrollToFocusedInput(innerRef, { offset: resolvedScrollOffset });
    }, [scroll, resolvedScrollOffset]);

    useEffect(() => {
      if (!multiline) return;
      const eventName = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
      const sub = Keyboard.addListener(eventName, () => {
        if (focusedRef.current) {
          scrollFocused();
        }
      });
      return () => sub.remove();
    }, [multiline, scrollFocused]);

    return (
      <View style={[twStyle("gap-1"), containerStyle]} collapsable={false}>
        <Text style={twStyle("text-[14px] font-medium text-slate-700")}>{label}</Text>
        {hint ? (
          <Text style={twStyle("text-[12px] text-slate-500 leading-relaxed")}>{hint}</Text>
        ) : null}
        <TextInput
          ref={innerRef}
          value={value}
          onChangeText={onChangeText}
          style={[twStyle(inputCls), style]}
          placeholderTextColor="#94a3b8"
          accessibilityLabel={a11yLabel}
          accessibilityHint={accessibilityHint ?? hint}
          multiline={multiline}
          textAlignVertical={textAlignVertical ?? (multiline ? "top" : undefined)}
          blurOnSubmit={blurOnSubmit ?? (multiline ? false : undefined)}
          scrollEnabled={scrollEnabled ?? (multiline ? false : undefined)}
          onFocus={(event) => {
            focusedRef.current = true;
            onFocus?.(event);
            scrollFocused();
          }}
          onBlur={(event) => {
            focusedRef.current = false;
            onBlur?.(event);
          }}
          {...inputProps}
        />
      </View>
    );
  },
);
