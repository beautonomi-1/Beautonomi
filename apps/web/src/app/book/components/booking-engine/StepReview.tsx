"use client";

import { Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import type { BookingData } from "../../types/booking-engine";

const MIN_TAP = "min-h-[44px] min-w-[44px]";

interface StepReviewProps {
  data: BookingData;
  providerName: string;
  onConfirm: () => void;
  isCreatingHold: boolean;
}

export function StepReview({
  data,
  providerName,
  onConfirm,
  isCreatingHold,
}: StepReviewProps) {
  const subtotal = data.servicesSubtotal;
  const addonsTotal = data.addonsSubtotal;
  const total = subtotal + addonsTotal;
  const currency = data.currency;

  const whenStr =
    data.selectedDate && data.selectedSlot
      ? new Date(data.selectedSlot.start).toLocaleString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  const whereStr =
    data.venueType === "at_salon" && data.selectedLocation
      ? data.selectedLocation.name
      : data.venueType === "at_home"
      ? data.atHomeAddress.line1 + ", " + data.atHomeAddress.city
      : "";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Review your booking</h2>
        <p className="mt-1 text-sm text-gray-500">Confirm details before securing your slot</p>
      </div>

      <div
        className="rounded-3xl p-5 text-white shadow-lg"
        style={{ backgroundColor: "#1c1c1e" }}
      >
        <p className="text-xs uppercase tracking-wider text-gray-400 mb-3">
          {providerName}
        </p>
        {data.selectedPackage ? (
          <div className="flex justify-between text-sm py-1.5 border-b border-white/10">
            <span className="text-gray-200">{data.selectedPackage.name} (package)</span>
            <span className="text-gray-300">{formatCurrency(data.servicesSubtotal, currency)}</span>
          </div>
        ) : (
          data.selectedServices.map((s, i) => (
            <div key={i} className="flex justify-between text-sm py-1.5 border-b border-white/10 last:border-0">
              <span className="text-gray-200">{s.title}</span>
              <span className="text-gray-300">{formatCurrency(s.price, s.currency)}</span>
            </div>
          ))
        )}
        {addonsTotal > 0 && (
          <div className="flex justify-between text-sm py-1.5 border-b border-white/10">
            <span className="text-gray-400">Add-ons</span>
            <span className="text-gray-300">+{formatCurrency(addonsTotal, currency)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-lg pt-4 mt-2">
          <span>Total</span>
          <span style={{ color: "#EC4899" }}>{formatCurrency(total, currency)}</span>
        </div>
      </div>

      <div className="rounded-2xl bg-gray-50 p-4 space-y-2 text-sm">
        <p><strong className="text-gray-700">When:</strong> {whenStr}</p>
        <p><strong className="text-gray-700">Where:</strong> {whereStr}</p>
        <p><strong className="text-gray-700">With:</strong> {data.selectedStaff?.name ?? "Anyone available"}</p>
      </div>

      <p className="text-xs text-gray-500 text-center">
        By confirming, you agree to the cancellation policy. Free cancellation up to 24 hours before your appointment.
      </p>

      <button
        type="button"
        onClick={onConfirm}
        disabled={isCreatingHold}
        className={cn(
          "w-full rounded-2xl h-14 font-semibold text-white transition-all touch-manipulation active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2",
          MIN_TAP
        )}
        style={{ backgroundColor: "#EC4899" }}
      >
        {isCreatingHold ? (
          <>
            <span className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Securing slot...
          </>
        ) : (
          <>
            <Lock className="h-5 w-5" />
            Confirm & continue
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>Secure checkout · Your payment details are protected</span>
      </div>
    </div>
  );
}
