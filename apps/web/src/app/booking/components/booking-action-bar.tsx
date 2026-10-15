"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { BookingState, BookingStep } from "./booking-flow";
import { formatCurrency } from "@/lib/utils";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { computeBookingTotals } from "@/lib/booking/compute-booking-totals";
import { useTranslation } from "@beautonomi/i18n";
import { getHoldTimeRemaining } from "@beautonomi/utils";
import { Clock } from "lucide-react";

interface BookingActionBarProps {
  bookingState: BookingState;
  currentStep: BookingStep;
  canProceed: boolean;
  onNext: () => void;
  onBack: () => void;
  onNavigateToServices?: () => void;
}

const BookingActionBar = forwardRef<HTMLDivElement, BookingActionBarProps>(function BookingActionBar({
  bookingState,
  currentStep,
  canProceed,
  onNext,
  onBack: _onBack,
  onNavigateToServices,
}, ref) {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const totals = useMemo(() => {
    const computed = computeBookingTotals({
      selectedServices: bookingState.selectedServices,
      selectedAddons: bookingState.selectedAddons,
      selectedProducts: bookingState.selectedProducts,
      travelFee: bookingState.address?.travelFee || 0,
      isGroupBooking: bookingState.isGroupBooking,
      groupParticipants: bookingState.groupParticipants,
      selectedPackage: bookingState.selectedPackage ?? null,
      couponDiscount: bookingState.promotions.couponDiscount || 0,
      membershipDiscount: bookingState.promotions.membershipDiscount || 0,
      loyaltyDiscount: bookingState.promotions.loyaltyDiscount || 0,
      taxAmount: bookingState.taxAmount || 0,
      taxIncluded: Boolean(bookingState.taxIncluded),
      serviceFeeAmount: bookingState.serviceFeeAmount || 0,
      tipAmount: bookingState.tipAmount || 0,
      defaultCurrency: tenantCurrency,
    });
    return {
      ...computed,
      subtotal:
        computed.servicesTotal +
        computed.addonsTotal +
        computed.productsTotal +
        computed.travelFee,
      taxRate: bookingState.taxRate || 0,
      serviceFeePercentage: bookingState.serviceFeePercentage || 0,
    };
  }, [bookingState, tenantCurrency]);

  const holdExpiresAt = bookingState.holdExpiresAt ?? null;
  const [holdTick, setHoldTick] = useState(() =>
    holdExpiresAt ? getHoldTimeRemaining(holdExpiresAt, 0) : null,
  );

  useEffect(() => {
    if (!holdExpiresAt) {
      setHoldTick(null);
      return;
    }
    setHoldTick(getHoldTimeRemaining(holdExpiresAt, 0));
    const id = setInterval(() => {
      setHoldTick(getHoldTimeRemaining(holdExpiresAt, 0));
    }, 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt]);

  const selectedServiceSummary = useMemo(() => {
    const svcs = bookingState.selectedServices;
    if (svcs.length === 0) return null;
    const first = svcs[0]!;
    const moreCount = svcs.length - 1;
    const minutes = svcs.reduce((sum, s) => sum + s.duration, 0);
    const more =
      moreCount > 0
        ? t("web.booking.actionBar.selectedServiceMore", { count: moreCount })
        : "";
    return t("web.booking.actionBar.selectedServiceSummary", {
      name: first.title,
      more,
      minutes,
    });
  }, [bookingState.selectedServices, t]);

  const continueButtonLabel = useMemo(() => {
    if (currentStep === "services" && bookingState.selectedServices.length > 0) {
      if (bookingState.selectedServices.length === 1) {
        return t("web.booking.actionBar.continueWithName", {
          name: bookingState.selectedServices[0]!.title,
        });
      }
      return t("web.booking.actionBar.continueWithCount", {
        count: bookingState.selectedServices.length,
      });
    }
    return t("web.booking.actionBar.continue");
  }, [currentStep, bookingState.selectedServices, t]);

  if (currentStep === "payment") {
    return null; // Payment step handles its own action bar
  }

  return (
    <motion.div
      ref={ref}
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="px-4 py-3 max-w-[100vw]">
        {bookingState.holdId && holdTick && !holdTick.expired && (
          <div
            role="status"
            className="mb-3 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900"
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              {t("web.booking.stepPayment.slotHeldBefore")}
              <span className="tabular-nums">
                {holdTick.minutes}:{String(holdTick.seconds).padStart(2, "0")}
              </span>
              {t("web.booking.stepPayment.slotHeldAfter")}
            </span>
          </div>
        )}
        {selectedServiceSummary ? (
          <div className="mb-3 flex items-start justify-between gap-2 text-sm">
            <p className="min-w-0 flex-1 truncate font-medium text-gray-900">{selectedServiceSummary}</p>
            {currentStep !== "services" &&
            !bookingState.selectedPackage &&
            onNavigateToServices ? (
              <button
                type="button"
                onClick={onNavigateToServices}
                className="shrink-0 font-semibold text-primary touch-target"
              >
                {t("web.booking.actionBar.changeService")}
              </button>
            ) : null}
          </div>
        ) : null}
        {/* Totals Summary */}
        <div className="mb-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>{t("web.booking.actionBar.services")}</span>
            <span>{formatCurrency(totals.servicesTotal, totals.currency)}</span>
          </div>
          {totals.addonsTotal > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>{t("web.booking.actionBar.addons")}</span>
              <span>{formatCurrency(totals.addonsTotal, totals.currency)}</span>
            </div>
          )}
          {totals.productsTotal > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>{t("web.booking.actionBar.products")}</span>
              <span>{formatCurrency(totals.productsTotal, totals.currency)}</span>
            </div>
          )}
          {totals.travelFee > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>{t("web.booking.actionBar.travelFee")}</span>
              <span>{formatCurrency(totals.travelFee, totals.currency)}</span>
            </div>
          )}
          {totals.packageDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{t("web.booking.actionBar.packageDiscount")}</span>
              <span>-{formatCurrency(totals.packageDiscount, totals.currency)}</span>
            </div>
          )}
          {bookingState.promotions.couponDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{t("web.booking.actionBar.coupon")}</span>
              <span>-{formatCurrency(bookingState.promotions.couponDiscount, totals.currency)}</span>
            </div>
          )}
          {bookingState.promotions.giftCardAmount > 0 && (
            <div className="flex justify-between text-sm text-blue-700">
              <span>{t("web.booking.actionBar.giftCardTender")}</span>
              <span>{t("web.booking.actionBar.appliesAtPayment")}</span>
            </div>
          )}
          {bookingState.promotions.loyaltyDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{t("web.booking.actionBar.loyaltyPoints")}</span>
              <span>-{formatCurrency(bookingState.promotions.loyaltyDiscount, totals.currency)}</span>
            </div>
          )}
          {bookingState.promotions.membershipDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{bookingState.promotions.membershipPlanName || t("web.booking.actionBar.membershipFallback")}</span>
              <span>-{formatCurrency(bookingState.promotions.membershipDiscount, totals.currency)}</span>
            </div>
          )}
          {totals.subtotalAfterDiscounts !== totals.subtotal && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t("web.booking.actionBar.subtotal")}</span>
              <span>{formatCurrency(totals.subtotalAfterDiscounts, totals.currency)}</span>
            </div>
          )}
          {totals.taxAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>{totals.taxRate > 0 ? t("web.booking.actionBar.taxWithRate", { rate: totals.taxRate }) : t("web.booking.actionBar.tax")}</span>
              <span>{formatCurrency(totals.taxAmount, totals.currency)}</span>
            </div>
          )}
          {totals.serviceFeeAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>{totals.serviceFeePercentage > 0 ? t("web.booking.actionBar.platformFeeWithPct", { pct: totals.serviceFeePercentage }) : t("web.booking.actionBar.platformFee")}</span>
              <span>{formatCurrency(totals.serviceFeeAmount, totals.currency)}</span>
            </div>
          )}
          {totals.tipAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t("web.booking.actionBar.tip")}</span>
              <span>{formatCurrency(totals.tipAmount, totals.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold text-gray-900 pt-2 border-t">
            <span>{t("web.booking.actionBar.total")}</span>
            <span>{formatCurrency(totals.total, totals.currency)}</span>
          </div>
        </div>

        {/* CTA Button */}
        <Button
          onClick={onNext}
          disabled={!canProceed}
          data-testid="booking-continue"
          className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed touch-target"
          aria-label={continueButtonLabel}
        >
          <span className="truncate">{continueButtonLabel}</span>
        </Button>
      </div>
    </motion.div>
  );
});

export default BookingActionBar;
