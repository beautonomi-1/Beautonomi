"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { useTenantLocaleTag } from "@/hooks/useTenantLocaleTag";

interface MoneyProps {
  amount: number;
  currency?: string;
  showSymbol?: boolean;
  className?: string;
}

export function Money({ amount, currency = LAST_RESORT_CURRENCY, showSymbol = true, className }: MoneyProps) {
  const locale = useTenantLocaleTag();
  const formatted = new Intl.NumberFormat(locale, {
    style: showSymbol ? "currency" : "decimal",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return <span className={cn(className)}>{formatted}</span>;
}
