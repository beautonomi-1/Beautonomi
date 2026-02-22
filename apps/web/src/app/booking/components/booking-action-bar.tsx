"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { BookingState, BookingStep } from "./booking-flow";
import { formatCurrency } from "@/lib/utils";

interface BookingActionBarProps {
  bookingState: BookingState;
  currentStep: BookingStep;
  canProceed: boolean;
  onNext: () => void;
  onBack: () => void;
}

export default function BookingActionBar({
  bookingState,
  currentStep,
  canProceed,
  onNext,
  onBack: _onBack,
}: BookingActionBarProps) {
  const totals = useMemo(() => {
    // For group bookings, calculate from participants
    const servicesTotal = bookingState.isGroupBooking && bookingState.groupParticipants
      ? bookingState.groupParticipants.reduce((total, participant) => {
          const participantTotal = participant.serviceIds.reduce((sum, serviceId) => {
            const service = bookingState.selectedServices.find(s => s.id === serviceId);
            return sum + (service?.price || 0);
          }, 0);
          return total + participantTotal;
        }, 0)
      : bookingState.selectedServices.reduce(
          (sum, service) => sum + service.price,
          0
        );
    const addonsTotal = bookingState.selectedAddons.reduce(
      (sum, addon) => sum + addon.price,
      0
    );
    const productsTotal = bookingState.selectedProducts.reduce(
      (sum, product) => sum + (product.price * product.quantity),
      0
    );
    const travelFee = bookingState.address?.travelFee || 0;
    const subtotal = servicesTotal + addonsTotal + productsTotal + travelFee;
    
    const discounts =
      (bookingState.promotions.couponDiscount || 0) +
      (bookingState.promotions.giftCardAmount || 0) +
      (bookingState.promotions.loyaltyDiscount || 0) +
      (bookingState.promotions.membershipDiscount || 0);
    
    const subtotalAfterDiscounts = Math.max(0, subtotal - discounts);
    const taxAmount = bookingState.taxAmount || 0;
    const serviceFeeAmount = bookingState.serviceFeeAmount || 0;
    const serviceFeePercentage = bookingState.serviceFeePercentage || 0;
    const tipAmount = bookingState.tipAmount || 0;
    const total = subtotalAfterDiscounts + taxAmount + serviceFeeAmount + tipAmount;
    const currency = bookingState.selectedServices[0]?.currency || "ZAR";
    
    return {
      servicesTotal,
      addonsTotal,
      productsTotal,
      travelFee,
      subtotal,
      discounts,
      subtotalAfterDiscounts,
      taxAmount: bookingState.taxAmount || 0,
      taxRate: bookingState.taxRate || 0,
      serviceFeeAmount,
      serviceFeePercentage,
      tipAmount: bookingState.tipAmount || 0,
      total,
      currency,
    };
  }, [bookingState]);

  if (currentStep === "payment") {
    return null; // Payment step handles its own action bar
  }

  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="sticky bottom-0 z-40 bg-white border-t border-gray-200 safe-area-bottom shadow-lg"
    >
      <div className="px-4 py-3">
        {/* Totals Summary */}
        <div className="mb-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Services</span>
            <span>{formatCurrency(totals.servicesTotal, totals.currency)}</span>
          </div>
          {totals.addonsTotal > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Add-ons</span>
              <span>{formatCurrency(totals.addonsTotal, totals.currency)}</span>
            </div>
          )}
          {totals.productsTotal > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Products</span>
              <span>{formatCurrency(totals.productsTotal, totals.currency)}</span>
            </div>
          )}
          {totals.travelFee > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Travel Fee</span>
              <span>{formatCurrency(totals.travelFee, totals.currency)}</span>
            </div>
          )}
          {bookingState.promotions.couponDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Coupon</span>
              <span>-{formatCurrency(bookingState.promotions.couponDiscount, totals.currency)}</span>
            </div>
          )}
          {bookingState.promotions.giftCardAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Gift Card</span>
              <span>-{formatCurrency(bookingState.promotions.giftCardAmount, totals.currency)}</span>
            </div>
          )}
          {bookingState.promotions.loyaltyDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Loyalty Points</span>
              <span>-{formatCurrency(bookingState.promotions.loyaltyDiscount, totals.currency)}</span>
            </div>
          )}
          {bookingState.promotions.membershipDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Membership Discount</span>
              <span>-{formatCurrency(bookingState.promotions.membershipDiscount, totals.currency)}</span>
            </div>
          )}
          {totals.subtotalAfterDiscounts !== totals.subtotal && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotalAfterDiscounts, totals.currency)}</span>
            </div>
          )}
          {totals.taxAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Tax {totals.taxRate > 0 ? `(${totals.taxRate}%)` : ""}</span>
              <span>{formatCurrency(totals.taxAmount, totals.currency)}</span>
            </div>
          )}
          {totals.serviceFeeAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Service Fee{totals.serviceFeePercentage > 0 ? ` (${totals.serviceFeePercentage}%)` : ''}</span>
              <span>{formatCurrency(totals.serviceFeeAmount, totals.currency)}</span>
            </div>
          )}
          {totals.tipAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Tip</span>
              <span>{formatCurrency(totals.tipAmount, totals.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold text-gray-900 pt-2 border-t">
            <span>Total</span>
            <span>{formatCurrency(totals.total, totals.currency)}</span>
          </div>
        </div>

        {/* CTA Button */}
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="w-full h-14 text-base font-semibold bg-[#FF0077] hover:bg-[#D60565] disabled:opacity-50 disabled:cursor-not-allowed touch-target"
          aria-label="Continue to next step"
        >
          Continue
        </Button>
      </div>
    </motion.div>
  );
}
