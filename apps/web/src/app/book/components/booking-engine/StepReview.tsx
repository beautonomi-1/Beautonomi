"use client";

import { Lock, Shield, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { useTranslation, buildCancellationPolicyLines, cancellationRequiresAck } from "@beautonomi/i18n";
import type { CancellationPolicyView } from "@beautonomi/i18n";
import { HouseCallLineFootnote } from "@/components/booking/HouseCallPricingNotes";
import { lineHasHouseCallAdjustment } from "@beautonomi/utils";
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
  hours_before_cutoff?: number;
  grace_window_minutes?: number;
  late_cancellation_type?: "no_refund" | "partial_refund" | "full_refund";
  /** Output name from the hold API. */
  late_refund_percentage?: number;
  /** Raw DB column returned by /api/public/cancellation-policy — the primary late-refund driver. */
  refund_percentage?: number;
  fee_amount?: number;
  fee_type?: "fixed" | "percentage";
  no_show_fee_enabled?: boolean;
  no_show_fee_amount?: number;
  currency?: string;
  /** Kept for type compatibility; not used for display — structured fields above are authoritative. */
  policy_text?: string;
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
  /** Jump back to a specific step for editing — provided by OnlineBookingFlowNew */
  onEditServices?: () => void;
  onEditSchedule?: () => void;
  onEditVenue?: () => void;
}

export function StepReview({
  data,
  providerName,
  cancellationPolicy,
  paymentSettings,
  onPolicyAcceptedChange,
  onConfirm,
  isCreatingHold,
  onEditServices,
  onEditSchedule,
  onEditVenue,
}: StepReviewProps) {
  const { t } = useTranslation();
  const subtotal = data.servicesSubtotal;
  const addonsTotal = data.addonsSubtotal;
  const total = subtotal + addonsTotal;
  const currency = data.currency;
  const isAtHome = data.venueType === "at_home";
  const policyAccepted = data.policyAccepted === true;
  const hasDateTime = data.selectedDate != null && data.selectedSlot != null;

  // Map the cancellation-policy API shape (hours_before_cutoff, late_cancellation_type) to
  // the canonical CancellationPolicyView used by the shared builder.
  const policyView: CancellationPolicyView | null = cancellationPolicy
    ? (() => {
        // Prefer explicit refund percentage (refund_percentage is the raw DB field / enforcement driver;
        // late_refund_percentage is the hold-API output name), otherwise derive from the coarse type.
        const latePct = cancellationPolicy.late_refund_percentage ?? cancellationPolicy.refund_percentage;
        const lateType = cancellationPolicy.late_cancellation_type ?? "no_refund";
        const effectiveLatePct =
          latePct !== undefined && latePct !== null && !Number.isNaN(Number(latePct))
            ? Number(latePct)
            : lateType === "full_refund"
              ? 100
              : lateType === "partial_refund"
                ? 50
                : 0;
        return {
          cancellationWindowHours: cancellationPolicy.hours_before_cutoff,
          graceWindowMinutes: cancellationPolicy.grace_window_minutes,
          lateRefundPercentage: effectiveLatePct,
          noShowFeeEnabled: cancellationPolicy.no_show_fee_enabled,
          noShowFeeAmount: cancellationPolicy.no_show_fee_amount,
          currency: cancellationPolicy.currency ?? currency,
          policyText: cancellationPolicy.policy_text,
        } satisfies CancellationPolicyView;
      })()
    : null;

  const policyContent = buildCancellationPolicyLines(policyView, {
    t,
    formatCurrency: (amount, cur) => formatCurrency(amount, cur || currency),
  });

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
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-wider opacity-80">{providerName}</p>
          {onEditServices && (
            <button
              type="button"
              onClick={onEditServices}
              className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100 transition-opacity touch-manipulation"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>
        {data.selectedPackage ? (
          <div className="flex justify-between text-sm py-1.5 border-b border-white/10">
            <span className="opacity-90">{data.selectedPackage.name} (package)</span>
            <span className="opacity-95">{formatCurrency(data.servicesSubtotal, currency)}</span>
          </div>
        ) : (
          data.selectedServices.map((s, i) => {
            const snapshotLine = {
              price: s.price,
              base_price: s.base_price,
              at_home_price_adjustment: s.at_home_price_adjustment,
            };
            return (
              <div
                key={i}
                className="py-1.5 border-b border-white/10 last:border-0"
              >
                <div className="flex justify-between text-sm gap-3">
                  <span className="opacity-90 min-w-0">
                    {s.title}
                    {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
                  </span>
                  <span className="opacity-95 shrink-0">{formatCurrency(s.price, s.currency)}</span>
                </div>
                {isAtHome && lineHasHouseCallAdjustment(snapshotLine) ? (
                  <div className="mt-0.5 [&_p]:text-white/70 [&_p]:text-[11px]">
                    <HouseCallLineFootnote line={snapshotLine} currency={s.currency} t={t} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
        {addonsTotal > 0 && (
          <div className="flex justify-between text-sm py-1.5 border-b border-white/10">
            <span className="opacity-75">Add-ons</span>
            <span className="opacity-95">+{formatCurrency(addonsTotal, currency)}</span>
          </div>
        )}
        {isAtHome && (
          <p className="text-xs opacity-75 py-2 border-b border-white/10 leading-relaxed">
            {t("booking.houseCallPricing.travelFeeSeparateNote")}
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
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2 flex-1">
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
          <div className="flex flex-col gap-2 shrink-0">
            {onEditSchedule && (
              <button
                type="button"
                onClick={onEditSchedule}
                className="flex items-center gap-1 text-xs hover:underline touch-manipulation"
                style={{ color: BOOKING_ACCENT }}
              >
                <Pencil className="h-3 w-3" /> Change time
              </button>
            )}
            {onEditVenue && (
              <button
                type="button"
                onClick={onEditVenue}
                className="flex items-center gap-1 text-xs hover:underline touch-manipulation"
                style={{ color: BOOKING_ACCENT }}
              >
                <Pencil className="h-3 w-3" /> Change venue
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cancellation policy with Shield iconography */}
      {policyContent.lines.length > 0 && (
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
            {t("checkout.cancellationPolicy")}
          </h3>
          <ul className="space-y-1.5 text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
            {policyContent.lines.map((line) => (
              <li key={line.id} className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 ${line.tone === "good" ? "text-green-500" : "text-amber-500"}`}>
                  {line.tone === "good" ? "✓" : "⚠"}
                </span>
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
          <div
            className="text-xs space-y-1"
            style={{ color: BOOKING_TEXT_SECONDARY, borderTop: `1px solid ${BOOKING_BORDER}`, paddingTop: "8px", marginTop: "4px" }}
          >
            <p className="flex items-center gap-1">
              <Lock className="h-3 w-3 shrink-0" />
              {policyContent.footerText}
            </p>
            <p className="opacity-75">{policyContent.storeCreditNote}</p>
          </div>
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
              {policyContent.ackText}
            </Label>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={isCreatingHold || (policyContent.requiresAck && !policyAccepted) || !hasDateTime}
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
