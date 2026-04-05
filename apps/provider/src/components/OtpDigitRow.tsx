import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  TextInput,
  Platform,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import { Colors } from "@/constants/colors";
import {
  SUPABASE_AUTH_SMS_OTP_LENGTH,
  normalizeSupabaseSmsOtpToken,
} from "@/lib/supabase-sms-otp";

const DIGIT = /^\d$/;

export interface OtpDigitRowProps {
  /** Defaults to Supabase Auth OTP length (6) — SMS, phone_change, or email. */
  length?: number;
  value: string;
  onChange: (digits: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  accessibilityLabelPrefix?: string;
  gap?: number;
}

/**
 * One-digit-per-box OTP row (parity with web `OtpDigitInput` and customer app).
 */
export function OtpDigitRow({
  length = SUPABASE_AUTH_SMS_OTP_LENGTH,
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  accessibilityLabelPrefix = "Verification code",
  gap = 8,
}: OtpDigitRowProps) {
  const inputsRef = useRef<(TextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const curDigits = normalizeSupabaseSmsOtpToken(value).slice(0, length);
  const cells = Array.from({ length }, (_, i) => curDigits[i] ?? "");

  const focusAt = useCallback((i: number) => {
    const idx = Math.max(0, Math.min(length - 1, i));
    requestAnimationFrame(() => inputsRef.current[idx]?.focus());
  }, [length]);

  useEffect(() => {
    if (autoFocus && !disabled) {
      focusAt(0);
    }
  }, [autoFocus, disabled, focusAt]);

  const commit = useCallback(
    (nextRaw: string) => {
      const next = normalizeSupabaseSmsOtpToken(nextRaw).slice(0, length);
      onChange(next);
      if (next.length === length) {
        queueMicrotask(() => onComplete?.(next));
      }
    },
    [length, onChange, onComplete],
  );

  const handleChangeAt = useCallback(
    (index: number, raw: string) => {
      if (disabled) return;
      const numeric = raw.replace(/\D/g, "");
      if (numeric.length > 1) {
        commit(numeric);
        focusAt(Math.min(numeric.length, length - 1));
        return;
      }
      const last = numeric.slice(-1);
      if (raw === "" || last === "") {
        const next = curDigits.slice(0, index) + curDigits.slice(index + 1);
        commit(next);
        return;
      }
      if (!DIGIT.test(last)) return;
      const next = (curDigits.slice(0, index) + last + curDigits.slice(index + 1)).slice(0, length);
      commit(next);
      if (index < length - 1) focusAt(index + 1);
    },
    [commit, curDigits, disabled, focusAt, length],
  );

  const handleKeyPress = useCallback(
    (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (disabled) return;
      if (e.nativeEvent.key !== "Backspace") return;
      if (cells[index]) {
        return;
      }
      if (index > 0) {
        const next = curDigits.slice(0, index - 1) + curDigits.slice(index);
        commit(next);
        focusAt(index - 1);
      }
    },
    [cells, commit, curDigits, disabled, focusAt],
  );

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 4,
        gap,
      }}
    >
      {cells.map((digit, index) => (
        <TextInput
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          value={digit}
          onChangeText={(t) => handleChangeAt(index, t)}
          onKeyPress={(e) => handleKeyPress(index, e)}
          onFocus={() => setFocusedIndex(index)}
          onBlur={() => setFocusedIndex((f) => (f === index ? null : f))}
          keyboardType="number-pad"
          maxLength={index === 0 ? length : 1}
          editable={!disabled}
          selectTextOnFocus
          caretHidden
          accessibilityLabel={`${accessibilityLabelPrefix}, digit ${index + 1} of ${length}`}
          style={{
            flex: 1,
            minWidth: 40,
            maxWidth: 52,
            height: 52,
            borderRadius: 12,
            borderWidth: 2,
            borderColor:
              focusedIndex === index ? Colors.primary : Colors.gray[200],
            backgroundColor:
              focusedIndex === index ? Colors.white : Colors.gray[100],
            fontSize: 22,
            fontWeight: "600",
            color: Colors.gray[900],
            textAlign: "center",
            paddingVertical: 0,
            opacity: disabled ? 0.55 : 1,
          }}
          {...(index === 0 && Platform.OS === "ios"
            ? { textContentType: "oneTimeCode" as const }
            : {})}
          {...(index === 0 && Platform.OS === "android"
            ? { autoComplete: "sms-otp" as const }
            : {})}
        />
      ))}
    </View>
  );
}
