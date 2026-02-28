"use client";

import { Lock, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { BookingData } from "../../types/booking-engine";
import {
  BOOKING_ACCENT,
  BOOKING_EDGE,
  BOOKING_BORDER,
  BOOKING_SHADOW_CARD,
  BOOKING_RADIUS_BUTTON,
  BOOKING_RADIUS_CARD,
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  BOOKING_SUMMARY_BG,
  MIN_TAP,
  BOOKING_ACTIVE_SCALE,
} from "../../constants";

interface CancellationPolicy {
  policy_text?: string;
  hours_before_cutoff?: number;
  late_cancellation_type?: "no_refund" | "partial_refund" | "full_refund";
}

interface PaymentSettings {
  deposit_required?: boolean;
  allow_pay_in_person?: boolean;
  deposit_amount?: number | null;
  deposit_percent?: number | null;
}

interface StepReviewProps {
  data: BookingData;
  providerName: string;
  cancellationPolicy: CancellationPolicy | null;
  paymentSettings?: PaymentSettings;
  onPolicyAcceptedChange: (accepted: boolean) => void;
  onConfirm: () => void;
  isCreatingHold: boolean;
}

export function StepReview({
  data,
  providerName,
  cancellationPolicy,
  paymentSettings,
  onPolicyAcceptedChange,
  onConfirm,
  isCreatingHold,
}: StepReviewProps) {
  const subtotal = data.servicesSubtotal;
  const addonsTotal = data.addonsSubtotal;
  const total = subtotal + addonsTotal;
  const currency = data.currency;
  const isAtHome = data.venueType === "at_home";
  const policyAccepted = data.policyAccepted === true;
  const hours = cancellationPolicy?.hours_before_cutoff ?? 24;
  const lateType = cancellationPolicy?.late_cancellation_type ?? "no_refund";
  const lateTypeLabel =
    lateType === "no_refund"
      ? "no refund"
      : lateType === "partial_refund"
      ? "partial refund"
      : "full refund";

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

  const showPaymentNote =
    paymentSettings?.deposit_required === true || paymentSettings?.allow_pay_in_person === true;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="text-left">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: BOOKING_TEXT_PRIMARY }}>
          Review your booking
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
          Confirm details before securing your slot
        </p>
      </div>

      {/* Receipt-style summary card */}
      <div
        className="rounded-3xl p-5 text-white"
        style={{
          backgroundColor: BOOKING_SUMMARY_BG,
          border: `1px solid ${BOOKING_EDGE}`,
          borderRadius: BOOKING_RADIUS_CARD,
          boxShadow: BOOKING_SHADOW_CARD,
        }}
      >
        <p className="text-xs uppercase tracking-wider mb-3 opacity-80">{providerName}</p>
        {data.selectedPackage ? (
          <div className="flex justify-between text-sm py-1.5 border-b border-white/10">
            <span className="opacity-90">{data.selectedPackage.name} (package)</span>
            <span className="opacity-95">{formatCurrency(data.servicesSubtotal, currency)}</span>
          </div>
        ) : (
          data.selectedServices.map((s, i) => (
            <div
              key={i}
              className="flex justify-between text-sm py-1.5 border-b border-white/10 last:border-0"
            >
              <span className="opacity-90">{s.title}</span>
              <span className="opacity-95">{formatCurrency(s.price, s.currency)}</span>
            </div>
          ))
        )}
        {addonsTotal > 0 && (
          <div className="flex justify-between text-sm py-1.5 border-b border-white/10">
            <span className="opacity-75">Add-ons</span>
            <span className="opacity-95">+{formatCurrency(addonsTotal, currency)}</span>
          </div>
        )}
        {isAtHome && (
          <p className="text-xs opacity-75 py-2 border-b border-white/10">
            Travel fee (based on your address) will be added at checkout.
          </p>
        )}
        {showPaymentNote && (
          <p className="text-xs opacity-75 py-2 border-b border-white/10">
            {paymentSettings?.deposit_required
              ? "A deposit or full payment may be required at checkout."
              : "Pay online now or pay in person at the venue."}
          </p>
        )}
        <div className="flex justify-between font-semibold text-lg pt-4 mt-2">
          <span>Total</span>
          <span style={{ color: BOOKING_ACCENT }}>{formatCurrency(total, currency)}</span>
        </div>
      </div>

      <div
        className="rounded-3xl p-5 space-y-2 text-sm border"
        style={{
          borderColor: BOOKING_BORDER,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px) saturate(180%)",
        }}
      >
        <p style={{ color: BOOKING_TEXT_PRIMARY }}>
          <strong>When:</strong> {whenStr}
        </p>
        <p style={{ color: BOOKING_TEXT_PRIMARY }}>
          <strong>Where:</strong> {whereStr}
        </p>
        <p style={{ color: BOOKING_TEXT_PRIMARY }}>
          <strong>With:</strong> {data.selectedStaff?.name ?? "Anyone available"}
        </p>
      </div>

      {/* Cancellation policy with Shield iconography */}
      <div
        className="rounded-3xl p-5 space-y-3 border"
        style={{
          borderColor: BOOKING_BORDER,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px) saturate(180%)",
        }}
      >
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: BOOKING_TEXT_PRIMARY }}>
          <Shield className="h-4 w-4 shrink-0" style={{ color: BOOKING_ACCENT }} />
          Cancellation policy
        </h3>
        {cancellationPolicy?.policy_text ? (
          <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
            {cancellationPolicy.policy_text}
          </p>
        ) : (
          <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
            Cancellations must be made at least {hours} hours before your appointment. Cancellations
            made within {hours} hours may result in {lateTypeLabel}.
          </p>
        )}
        <p className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>
          I understand that cancellations made within {hours} hours of my appointment may result in a{" "}
          {lateTypeLabel}.
        </p>
        <div className="flex items-start gap-3 pt-2">
          <Checkbox
            id="accept-policy"
            checked={policyAccepted}
            onCheckedChange={(checked) => onPolicyAcceptedChange(checked === true)}
            className="mt-0.5 h-5 w-5 rounded-md border-2 shrink-0"
            style={
              policyAccepted
                ? { backgroundColor: BOOKING_ACCENT, borderColor: BOOKING_ACCENT, color: "#fff" }
                : { borderColor: BOOKING_BORDER }
            }
          />
          <Label
            htmlFor="accept-policy"
            className="text-sm font-medium cursor-pointer leading-tight"
            style={{ color: BOOKING_TEXT_PRIMARY }}
          >
            I understand and accept the cancellation policy above.
          </Label>
        </div>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={isCreatingHold || !policyAccepted}
        className={cn(
          "w-full rounded-2xl h-14 font-semibold text-white transition-all touch-manipulation flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100",
          MIN_TAP,
          BOOKING_ACTIVE_SCALE
        )}
        style={{
          backgroundColor: BOOKING_ACCENT,
          borderRadius: BOOKING_RADIUS_BUTTON,
          boxShadow: BOOKING_SHADOW_CARD,
        }}
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

      <div
        className="flex items-center justify-center gap-2 text-xs mt-2"
        style={{ color: BOOKING_TEXT_SECONDARY }}
      >
        <Shield className="h-4 w-4 shrink-0" style={{ color: BOOKING_ACCENT }} />
        <span>Secure checkout · Your payment details are protected</span>
      </div>
    </div>
  );
}
