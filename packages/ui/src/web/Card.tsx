import React from "react";
import type { CardProps } from "../types";

const paddingClasses: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "p-0",
  sm: "p-2",
  md: "p-4",
  lg: "p-6",
};

const shadowClasses: Record<NonNullable<CardProps["shadow"]>, string> = {
  none: "shadow-none",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
};

export function Card({
  children,
  padding = "md",
  shadow = "sm",
}: CardProps) {
  return (
    <div
      className={[
        "rounded-xl border border-gray-200 bg-white",
        paddingClasses[padding],
        shadowClasses[shadow],
      ].join(" ")}
    >
      {children}
    </div>
  );
}
