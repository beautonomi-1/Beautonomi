"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import type { BookingData, AddonOption } from "../../types/booking-engine";
import {
  BOOKING_ACCENT,
  BOOKING_WAITLIST_BG,
  BOOKING_BORDER,
  BOOKING_EDGE,
  BOOKING_SHADOW_CARD,
  BOOKING_RADIUS_CARD,
  BOOKING_RADIUS_BUTTON,
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  MIN_TAP,
  BOOKING_ACTIVE_SCALE,
} from "../../constants";

const cardStyle = {
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(16px) saturate(180%)",
  WebkitBackdropFilter: "blur(16px) saturate(180%)",
  border: `1px solid ${BOOKING_EDGE}`,
  borderRadius: BOOKING_RADIUS_CARD,
  boxShadow: BOOKING_SHADOW_CARD,
};

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
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="text-left">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: BOOKING_TEXT_PRIMARY }}>
          Add Extras
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
          Optional treatments to enhance your visit
        </p>
      </div>

      {addons.length === 0 ? (
        <div className="p-5 rounded-3xl" style={cardStyle}>
          <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
            No add-ons available for this selection. You can skip this step.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
            Boost Your Session
          </p>
          <div className="space-y-2">
          {addons.map((addon) => {
            const selected = data.selectedAddonIds.includes(addon.id);
            return (
              <button
                key={addon.id}
                type="button"
                onClick={() => onToggleAddon(addon.id, addon.price)}
                className={cn(
                  "w-full text-left rounded-2xl border-2 px-4 py-3.5 transition-all touch-manipulation flex items-center justify-between gap-3",
                  MIN_TAP,
                  BOOKING_ACTIVE_SCALE
                )}
                style={{
                  ...cardStyle,
                  borderColor: selected ? BOOKING_ACCENT : BOOKING_BORDER,
                  backgroundColor: selected ? BOOKING_WAITLIST_BG : "rgba(255,255,255,0.6)",
                }}
              >
                <div className="min-w-0">
                  <span className="font-medium block" style={{ color: BOOKING_TEXT_PRIMARY }}>
                    {addon.title}
                  </span>
                  {addon.description && (
                    <p className="text-sm truncate mt-0.5" style={{ color: BOOKING_TEXT_SECONDARY }}>
                      {addon.description}
                    </p>
                  )}
                  <p className="text-sm mt-0.5" style={{ color: BOOKING_TEXT_SECONDARY }}>
                    {addon.duration_minutes ? `+${addon.duration_minutes} min • ` : ""}
                    <span style={{ color: BOOKING_ACCENT }}>+{formatCurrency(addon.price, addon.currency)}</span>
                  </p>
                </div>
                <div
                  className={cn(
                    "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200",
                    selected && "scale-110"
                  )}
                  style={{
                    backgroundColor: selected ? BOOKING_ACCENT : "rgba(0,0,0,0.06)",
                    color: selected ? "#fff" : BOOKING_TEXT_SECONDARY,
                  }}
                >
                  {selected ? (
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                  ) : (
                    <div className="w-4 h-4 rounded border-2" style={{ borderColor: "currentColor" }} />
                  )}
                </div>
              </button>
            );
          })}
          </div>
        </div>
      )}

      <div className="p-5 space-y-2 rounded-3xl" style={cardStyle}>
        <div className="flex justify-between text-sm">
          <span style={{ color: BOOKING_TEXT_SECONDARY }}>Services</span>
          <span className="font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
            {formatCurrency(subtotal, currency)}
          </span>
        </div>
        {addonsTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span style={{ color: BOOKING_TEXT_SECONDARY }}>Add-ons</span>
            <span className="font-medium" style={{ color: BOOKING_ACCENT }}>
              +{formatCurrency(addonsTotal, currency)}
            </span>
          </div>
        )}
        <div
          className="flex justify-between font-semibold text-base pt-3 border-t"
          style={{ borderColor: BOOKING_EDGE }}
        >
          <span style={{ color: BOOKING_TEXT_PRIMARY }}>Total</span>
          <span style={{ color: BOOKING_ACCENT }}>{formatCurrency(total, currency)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className={cn(
          "w-full rounded-2xl h-12 font-semibold text-white touch-manipulation transition-all duration-300",
          MIN_TAP,
          BOOKING_ACTIVE_SCALE
        )}
        style={{
          backgroundColor: BOOKING_ACCENT,
          borderRadius: BOOKING_RADIUS_BUTTON,
          boxShadow: BOOKING_SHADOW_CARD,
        }}
      >
        Continue
      </button>
    </div>
  );
}
