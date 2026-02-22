import React from "react";
import type { ButtonProps, ButtonVariant, ButtonSize } from "../types";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[#FF0077] text-white hover:bg-[#e6006b] focus-visible:ring-[#FF0077]",
  secondary:
    "bg-[#222222] text-white hover:bg-[#333333] focus-visible:ring-[#222222]",
  outline:
    "border border-gray-200 bg-transparent text-gray-900 hover:bg-gray-50 focus-visible:ring-gray-300",
  ghost:
    "bg-transparent text-gray-900 hover:bg-gray-100 focus-visible:ring-gray-300",
  destructive:
    "bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-md",
  md: "px-5 py-2.5 text-sm rounded-lg",
  lg: "px-7 py-3.5 text-base rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  children,
  onPress,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={isDisabled}
      className={[
        "inline-flex items-center justify-center font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        variantClasses[variant],
        sizeClasses[size],
        isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      {loading ? (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : null}
      {children}
    </button>
  );
}
