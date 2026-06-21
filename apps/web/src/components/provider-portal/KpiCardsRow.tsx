"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { useTenantLocaleTag } from "@/hooks/useTenantLocaleTag";
// HMR fix

interface KpiCard {
  label: string;
  value: string | number;
  delta?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
}

interface KpiCardsRowProps {
  cards: KpiCard[];
}

export function KpiCardsRow({ cards }: KpiCardsRowProps) {
  const locale = useTenantLocaleTag();
  const formatValue = (value: string | number): string => {
    if (typeof value === "number") {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: LAST_RESORT_CURRENCY,
        minimumFractionDigits: 0,
      }).format(value);
    }
    return value;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
      {cards.map((card, index) => (
        <Card key={index} className="provider-metric-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium tracking-[0.01em] text-gray-500 mb-1.5">{card.label}</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight tabular-nums">{formatValue(card.value)}</p>
              {card.delta && (
                <div
                  className={cn(
                    "inline-flex items-center gap-1 mt-2.5 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums",
                    card.delta.isPositive
                      ? "text-green-700 bg-green-50"
                      : "text-red-700 bg-red-50"
                  )}
                >
                  {card.delta.isPositive ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  <span>{Math.abs(card.delta.value)}%</span>
                </div>
              )}
            </div>
            {card.icon && (
              <div className="flex-shrink-0 p-2.5 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
                {card.icon}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
