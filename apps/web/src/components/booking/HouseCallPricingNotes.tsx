"use client";

import { Home } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  hasAtHomePriceAdjustment,
  houseCallAdjustmentForSnapshotLine,
  lineHasHouseCallAdjustment,
  sumHouseCallAdjustmentsFromSnapshot,
  type AtHomeSnapshotLine,
} from "@beautonomi/utils";

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/** Compact footnote under a service line when a house-call adjustment applies. */
export function HouseCallLineFootnote({
  line,
  currency,
  t,
}: {
  line: AtHomeSnapshotLine;
  currency: string;
  t: TranslateFn;
}) {
  if (!lineHasHouseCallAdjustment(line)) return null;
  const amount = houseCallAdjustmentForSnapshotLine(line);
  if (amount <= 0) return null;
  return (
    <p className="text-[11px] leading-snug text-emerald-800/90 flex items-start gap-1 mt-0.5">
      <Home className="h-3 w-3 shrink-0 mt-0.5 text-emerald-600/80" aria-hidden />
      <span>
        {t("booking.houseCallPricing.includesHouseCallFee", {
          currency,
          amount: amount.toFixed(2),
        })}
      </span>
    </p>
  );
}

/** Summary row when total house-call adjustments &gt; 0 (checkout / review). */
export function HouseCallFeesSummaryRow({
  lines,
  currency,
  t,
  variant = "dark",
}: {
  lines: AtHomeSnapshotLine[];
  currency: string;
  t: TranslateFn;
  variant?: "dark" | "light";
}) {
  const total = sumHouseCallAdjustmentsFromSnapshot(lines);
  if (total <= 0) return null;
  const count = lines.filter((l) => lineHasHouseCallAdjustment(l)).length;
  const label =
    count > 1
      ? t("booking.houseCallPricing.houseCallFeeSummary", { count })
      : t("booking.houseCallPricing.houseCallFeeLine");

  if (variant === "dark") {
    return (
      <div className="flex justify-between text-sm border-b border-white/10 pb-2">
        <span className="opacity-80 flex items-center gap-1">
          <Home className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          {label}
        </span>
        <span className="opacity-95">{formatCurrency(total, currency)}</span>
      </div>
    );
  }

  return (
    <div className="flex justify-between text-sm py-1.5 px-3 rounded-lg bg-emerald-50/90 border border-emerald-100">
      <span className="text-emerald-900/90 flex items-center gap-1.5 text-[13px]">
        <Home className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden />
        {label}
      </span>
      <span className="font-medium text-emerald-900">{formatCurrency(total, currency)}</span>
    </div>
  );
}

/** Service picker: dual price or at-home hint. */
export function HouseCallServicePriceLabel({
  basePrice,
  atHomePriceAdjustment,
  isAtHome,
  currency,
  durationMinutes,
  t,
  className,
}: {
  basePrice: number;
  atHomePriceAdjustment?: number | null;
  isAtHome: boolean;
  currency: string;
  durationMinutes?: number;
  t: TranslateFn;
  className?: string;
}) {
  const adj = Number(atHomePriceAdjustment ?? 0);
  if (!hasAtHomePriceAdjustment(adj)) {
    return (
      <span className={className}>
        <span className="block font-semibold">{formatCurrency(basePrice, currency)}</span>
        {durationMinutes != null && durationMinutes > 0 ? (
          <span className="sr-only">{durationMinutes} minutes</span>
        ) : null}
      </span>
    );
  }

  const homePrice = basePrice + adj;

  if (!isAtHome) {
    return (
      <span className={className}>
        <span className="block font-semibold">{formatCurrency(basePrice, currency)}</span>
        <span className="block text-[11px] font-normal opacity-75 mt-0.5">
          {t("booking.houseCallPricing.salonAndHomeFrom", {
            currency,
            salonPrice: basePrice.toFixed(2),
            homePrice: homePrice.toFixed(2),
          })}
        </span>
      </span>
    );
  }

  return (
    <span className={className}>
      <span className="block font-semibold">{formatCurrency(homePrice, currency)}</span>
      {isAtHome && (
        <span className="block text-[11px] font-normal text-emerald-700/90 mt-0.5">
          {t("booking.houseCallPricing.includesHouseCallFee", {
            currency,
            amount: adj.toFixed(2),
          })}
        </span>
      )}
      {durationMinutes != null && durationMinutes > 0 && (
        <span className="sr-only">{durationMinutes} minutes</span>
      )}
    </span>
  );
}

/** Banner on service step when at-home and the menu has house-call surcharges. */
export function HouseCallAtHomePricesBanner({
  t,
  show = true,
}: {
  t: TranslateFn;
  show?: boolean;
}) {
  if (!show) return null;
  return (
    <div
      className="flex items-start gap-2.5 rounded-2xl px-4 py-3 mb-4 border text-left"
      style={{
        backgroundColor: "rgba(16, 185, 129, 0.08)",
        borderColor: "rgba(16, 185, 129, 0.22)",
      }}
    >
      <Home className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700" aria-hidden />
      <p className="text-xs leading-relaxed text-emerald-900/90">
        {t("booking.houseCallPricing.atHomePricesHint")}
      </p>
    </div>
  );
}
