import React, { useId } from "react";
import type { InputProps } from "../types";

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  disabled = false,
  secureTextEntry = false,
}: InputProps) {
  const id = useId();

  return (
    <div className="mb-4">
      {label ? (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-900 mb-1.5"
        >
          {label}
        </label>
      ) : null}
      <input
        id={id}
        type={secureTextEntry ? "password" : "text"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChangeText?.(e.target.value)}
        disabled={disabled}
        className={[
          "w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400",
          "focus:outline-none focus:ring-2 focus:ring-offset-1",
          error
            ? "border-red-500 focus:ring-red-500"
            : "border-gray-200 focus:ring-[#FF0077]",
          disabled ? "bg-gray-100 opacity-60 cursor-not-allowed" : "bg-white",
        ].join(" ")}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
