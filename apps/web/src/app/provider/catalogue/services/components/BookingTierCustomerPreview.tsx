"use client";

import { Eye } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { previewBookingTierName } from "@/app/api/provider/services/_helpers/sync-variants";

export interface PricingOptionLike {
  id: string;
  duration: number;
  priceType: string;
  price: number;
  pricingName: string;
}

interface BookingTierCustomerPreviewProps {
  options: PricingOptionLike[];
  primaryPricingName?: string | null;
  serviceTitle?: string;
  currencyCode: string;
}

export function BookingTierCustomerPreview({
  options,
  primaryPricingName,
  serviceTitle,
  currencyCode,
}: BookingTierCustomerPreviewProps) {
  if (options.length <= 1) return null;

  return (
    <div
      className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3.5"
      role="region"
      aria-label={`Customers choose from ${options.length} booking options`}
    >
      <div className="mb-3 flex items-start gap-2.5">
        <div className="rounded-full bg-indigo-100 p-1.5 text-indigo-600">
          <Eye className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Customer booking view
          </p>
          <p className="text-xs text-indigo-600/90">
            {options.length} option{options.length === 1 ? "" : "s"} to choose from
            {serviceTitle ? ` · ${serviceTitle}` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => {
          const name = previewBookingTierName(option, index, primaryPricingName ?? null);
          return (
            <div
              key={option.id}
              className="min-w-[44%] flex-1 rounded-xl border border-indigo-200/80 bg-white px-3 py-2"
            >
              <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {formatCurrency(option.price, currencyCode)}
                {option.duration ? ` · ${option.duration} min` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
