import { forwardRef, useImperativeHandle, useRef } from "react";
import { View, Text, TextInput, type TextInputProps } from "react-native";
import { twStyle } from "@/lib/twStyle";
import { useOnboardingScroll } from "./OnboardingScrollContext";

const inputCls =
  "rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] text-slate-900 min-h-[48px]";

export interface OnboardingTextFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  containerStyle?: object;
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
      ...rest
    },
    ref,
  ) {
    const innerRef = useRef<TextInput>(null);
    const scroll = useOnboardingScroll();
    useImperativeHandle(ref, () => innerRef.current as TextInput);
    const a11yLabel = accessibilityLabel ?? label;
    const { onFocus, ...inputProps } = rest;
    return (
      <View style={[twStyle("gap-1"), containerStyle]}>
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
          onFocus={(event) => {
            onFocus?.(event);
            scroll?.scrollToFocusedInput(innerRef);
          }}
          {...inputProps}
        />
      </View>
    );
  },
);
