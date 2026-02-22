"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface MoneyProps {
  amount: number;
  currency?: string;
  showSymbol?: boolean;
  className?: string;
}

export function Money({ amount, currency = "ZAR", showSymbol = true, className }: MoneyProps) {
  const formatted = new Intl.NumberFormat("en-ZA", {
    style: showSymbol ? "currency" : "decimal",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return <span className={cn(className)}>{formatted}</span>;
}
