"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import type { BookingData, AddonOption } from "../../types/booking-engine";

const MIN_TAP = "min-h-[44px] min-w-[44px]";

interface StepAddonsProps {
  data: BookingData;
  addons: AddonOption[];
  onToggleAddon: (addonId: string, price: number) => void;
  onNext: () => void;
}

export function StepAddons({ data, addons, onToggleAddon, onNext }: StepAddonsProps) {
  const subtotal = data.servicesSubtotal;
  const addonsTotal = data.addonsSubtotal;
  const total = subtotal + addonsTotal;
  const currency = data.currency;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Add any extras</h2>
        <p className="mt-1 text-sm text-gray-500">Optional treatments to enhance your visit</p>
      </div>

      {addons.length === 0 ? (
        <p className="text-sm text-gray-500 rounded-2xl bg-gray-50 p-4">
          No add-ons available for this selection. You can skip this step.
        </p>
      ) : (
        <div className="space-y-2">
          {addons.map((addon) => {
            const selected = data.selectedAddonIds.includes(addon.id);
            return (
              <button
                key={addon.id}
                type="button"
                onClick={() => onToggleAddon(addon.id, addon.price)}
                className={cn(
                  "w-full text-left rounded-3xl border-2 px-4 py-3 transition-all touch-manipulation active:scale-[0.99] flex items-center justify-between gap-3",
                  selected ? "border-[#EC4899] bg-[#EC4899]/5" : "border-gray-200 bg-white hover:border-gray-300"
                )}
              >
                <div className="min-w-0">
                  <span className="font-medium text-gray-900 block">{addon.title}</span>
                  {addon.description && (
                    <p className="text-sm text-gray-500 truncate">{addon.description}</p>
                  )}
                  <span className="text-sm font-medium mt-1" style={{ color: "#EC4899" }}>
                    +{formatCurrency(addon.price, addon.currency)}
                  </span>
                </div>
                <div
                  className={cn(
                    "shrink-0 rounded-full p-2 transition-colors",
                    selected ? "bg-[#EC4899] text-white" : "bg-gray-100 text-gray-600"
                  )}
                >
                  <Plus className={cn("h-5 w-5", selected && "rotate-45")} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl bg-gray-50 p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Services</span>
          <span className="font-medium">{formatCurrency(subtotal, currency)}</span>
        </div>
        {addonsTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Add-ons</span>
            <span className="font-medium">+{formatCurrency(addonsTotal, currency)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-base pt-2 border-t border-gray-200">
          <span>Total</span>
          <span style={{ color: "#EC4899" }}>{formatCurrency(total, currency)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className={cn(
          "w-full rounded-2xl h-12 font-medium text-white transition-all touch-manipulation active:scale-[0.98]",
          MIN_TAP
        )}
        style={{ backgroundColor: "#EC4899" }}
      >
        Continue
      </button>
    </div>
  );
}
