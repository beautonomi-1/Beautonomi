"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

const DIGIT_PATTERN = /^\d$/;

export interface OtpDigitInputProps {
  /** Number of cells. Default 6 (Supabase Auth SMS, phone_change, email OTP). */
  length?: number;
  value: string;
  onChange: (digits: string) => void;
  /** Called when all cells are filled; receives the full numeric string. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Visually hidden label for the group (screen readers). */
  label?: string;
  id?: string;
  className?: string;
}

/**
 * Accessible one-digit-per-box OTP entry: paste support, keyboard navigation,
 * high-contrast light cells and clear focus states.
 */
export function OtpDigitInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  label = "Verification code",
  id: idProp,
  className = "",
}: OtpDigitInputProps) {
  const reactId = useId();
  const groupId = idProp ?? `otp-${reactId}`;
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const digits = value.replace(/\D/g, "").slice(0, length);
  const cells = Array.from({ length }, (_, i) => digits[i] ?? "");

  const focusIndex = (i: number) => {
    const el = inputsRef.current[Math.max(0, Math.min(length - 1, i))];
    queueMicrotask(() => el?.focus());
  };

  const commitDigits = useCallback(
    (next: string) => {
      const cleaned = next.replace(/\D/g, "").slice(0, length);
      onChange(cleaned);
      if (cleaned.length === length && onComplete) {
        queueMicrotask(() => onComplete(cleaned));
      }
    },
    [length, onChange, onComplete],
  );

  useEffect(() => {
    if (autoFocus && !disabled) {
      queueMicrotask(() => inputsRef.current[0]?.focus());
    }
  }, [autoFocus, disabled]);

  const handleInput = (index: number, raw: string) => {
    if (disabled) return;
    const numeric = raw.replace(/\D/g, "");
    if (numeric.length > 1) {
      commitDigits(numeric);
      focusIndex(Math.min(numeric.length, length - 1));
      return;
    }
    const last = numeric.slice(-1);
    if (raw === "" || last === "") {
      const next = digits.slice(0, index) + digits.slice(index + 1);
      commitDigits(next);
      return;
    }
    if (!DIGIT_PATTERN.test(last)) return;
    const next = (digits.slice(0, index) + last + digits.slice(index + 1)).slice(0, length);
    commitDigits(next);
    if (index < length - 1) focusIndex(index + 1);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Backspace") {
      if (cells[index]) {
        const next = digits.slice(0, index) + digits.slice(index + 1);
        commitDigits(next);
      } else if (index > 0) {
        focusIndex(index - 1);
        const next = digits.slice(0, index - 1) + digits.slice(index);
        commitDigits(next);
      }
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusIndex(index - 1);
    }
    if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      focusIndex(index + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    commitDigits(pasted);
    focusIndex(Math.min(pasted.length, length - 1));
  };

  return (
    <fieldset className={`border-0 p-0 m-0 min-w-0 ${className}`}>
      <legend className="sr-only">
        {label} — {length} digits
      </legend>
      <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5">
        {cells.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            name={`${groupId}-${index}`}
            id={`${groupId}-${index}`}
            aria-label={`${label}: digit ${index + 1} of ${length}`}
            maxLength={length}
            value={digit}
            disabled={disabled}
            onChange={(e) => handleInput(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            className={[
              "w-11 h-12 sm:w-12 sm:h-14 min-w-[2.75rem] min-h-[3rem] sm:min-h-[3.25rem]",
              "rounded-xl border-2 text-center text-xl sm:text-2xl font-semibold tabular-nums",
              "text-gray-900 bg-zinc-100 border-zinc-200",
              "placeholder:text-zinc-400",
              "transition-[color,box-shadow,border-color] duration-150",
              "focus:outline-none focus-visible:bg-white focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-50",
              "touch-manipulation",
            ].join(" ")}
          />
        ))}
      </div>
    </fieldset>
  );
}
