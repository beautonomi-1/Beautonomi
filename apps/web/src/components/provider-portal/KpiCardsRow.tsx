"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const formatValue = (value: string | number): string => {
    if (typeof value === "number") {
      return new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        minimumFractionDigits: 0,
      }).format(value);
    }
    return value;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      {cards.map((card, index) => (
        <Card key={index} className="p-4 bg-white border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-600 mb-1">{card.label}</p>
              <p className="text-2xl font-semibold text-gray-900">{formatValue(card.value)}</p>
              {card.delta && (
                <div
                  className={cn(
                    "flex items-center gap-1 mt-2 text-xs",
                    card.delta.isPositive ? "text-green-600" : "text-red-600"
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
            {card.icon && <div className="text-gray-400">{card.icon}</div>}
          </div>
        </Card>
      ))}
    </div>
  );
}
