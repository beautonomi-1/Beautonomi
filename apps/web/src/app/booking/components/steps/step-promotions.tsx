"use client";

import { useState, useEffect, useMemo } from "react";
import { Ticket, Gift, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookingState } from "../booking-flow";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

interface StepPromotionsProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  onNext: () => void;
}

export default function StepPromotions({
  bookingState,
  updateBookingState,
  onNext: _onNext,
}: StepPromotionsProps) {
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const { user } = useAuth();
  const [couponCode, setCouponCode] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [redemptionRate, setRedemptionRate] = useState(10);
  const [minRedemptionPoints, setMinRedemptionPoints] = useState(0);
  const [maxRedemptionPercentage, setMaxRedemptionPercentage] = useState(100);
  // NOTE: Platform fee settings are intentionally NOT fetched here.
  // booking-flow.tsx is the single authoritative place that calculates taxAmount,
  // serviceFeeAmount, and serviceFeePercentage and stores them in bookingState.
  // This step must only update promotion amounts; the parent recalculates fees.

  /** Services + add-ons + products + travel — must match payment step `getSubtotalAfterDiscounts` inputs (excludes tax & Platform Fee). */
  const cartTotal =
    bookingState.selectedServices.reduce((sum, s) => sum + s.price, 0) +
    bookingState.selectedAddons.reduce((sum, a) => sum + a.price, 0) +
    bookingState.selectedProducts.reduce((sum, p) => sum + p.price * p.quantity, 0) +
    (bookingState.address?.travelFee || 0);

  const subtotalAfterPromotions = Math.max(
    0,
    cartTotal -
      (bookingState.promotions.couponDiscount || 0) -
      (bookingState.promotions.giftCardAmount || 0) -
      (bookingState.promotions.loyaltyDiscount || 0) -
      (bookingState.promotions.membershipDiscount || 0)
  );

  /** Subtotal before loyalty — must match server `validate-booking` / `calculate-redemption` cap basis (after coupon, gift, membership). */
  const bookingSubtotalForLoyalty = useMemo(
    () =>
      Math.max(
        0,
        cartTotal -
          (bookingState.promotions.couponDiscount || 0) -
          (bookingState.promotions.giftCardAmount || 0) -
          (bookingState.promotions.membershipDiscount || 0),
      ),
    [
      cartTotal,
      bookingState.promotions.couponDiscount,
      bookingState.promotions.giftCardAmount,
      bookingState.promotions.membershipDiscount,
    ],
  );

  const maxRedeemablePointsOnBooking = useMemo(() => {
    if (bookingSubtotalForLoyalty <= 0) return 0;
    const maxDiscount = (bookingSubtotalForLoyalty * maxRedemptionPercentage) / 100;
    return Math.floor(maxDiscount * redemptionRate);
  }, [bookingSubtotalForLoyalty, maxRedemptionPercentage, redemptionRate]);



  // Load loyalty balance
  useEffect(() => {
    if (user) {
      loadLoyaltyBalance();
    }
  }, [user]);

  const loadLoyaltyBalance = async () => {
    try {
      const response = await fetcher.get<{
        data: {
          balance: number;
          redemption_rate?: number;
          min_redemption_points?: number;
          max_redemption_percentage?: number;
        };
      }>("/api/me/loyalty/balance");
      setLoyaltyBalance(response.data?.balance || 0);
      if (response.data?.redemption_rate) {
        setRedemptionRate(response.data.redemption_rate);
      }
      if (response.data?.min_redemption_points != null) {
        setMinRedemptionPoints(Number(response.data.min_redemption_points) || 0);
      }
      if (response.data?.max_redemption_percentage != null) {
        setMaxRedemptionPercentage(Number(response.data.max_redemption_percentage) ?? 100);
      }
    } catch (error) {
      // Silently handle 404 - loyalty balance endpoint may not exist yet
      if (error instanceof FetchError && error.status === 404) {
        setLoyaltyBalance(0);
        return;
      }
      // Only log non-404 errors
      if (!(error instanceof FetchError && error.status === 404)) {
        console.error("Error loading loyalty balance:", error);
      }
    }
  };

  const handleCouponApply = async () => {
    if (!couponCode.trim()) return;

    setIsValidating(true);
    try {
      const response = await fetcher.post<{
        data: { valid: boolean; discount: number; message?: string };
      }>("/api/promotions/validate", {
        code: couponCode,
        cartTotal: cartTotal,
        clientId: user?.id,
        type: "coupon",
      });

      if (response.data.valid) {
        updateBookingState({
          promotions: {
            ...bookingState.promotions,
            couponCode: couponCode,
            couponDiscount: response.data.discount,
          },
        });
        toast.success(response.data.message || "Coupon applied!");
      } else {
        toast.error(response.data.message || "Invalid coupon code");
      }
    } catch (error) {
      toast.error(
        error instanceof FetchError
          ? error.message
          : "Failed to validate coupon"
      );
    } finally {
      setIsValidating(false);
    }
  };

  const handleGiftCardApply = async () => {
    if (!giftCardCode.trim()) return;

    setIsValidating(true);
    try {
      const response = await fetcher.post<{
        data: { valid: boolean; amount: number; message?: string };
      }>("/api/promotions/validate", {
        code: giftCardCode,
        cartTotal: cartTotal,
        clientId: user?.id,
        type: "gift_card",
      });

      if (response.data.valid) {
        updateBookingState({
          promotions: {
            ...bookingState.promotions,
            giftCardCode: giftCardCode,
            giftCardAmount: response.data.amount,
          },
        });
        toast.success(response.data.message || "Gift card applied!");
      } else {
        toast.error(response.data.message || "Invalid gift card code");
      }
    } catch (error) {
      toast.error(
        error instanceof FetchError
          ? error.message
          : "Failed to validate gift card"
      );
    } finally {
      setIsValidating(false);
    }
  };

  const handleLoyaltyApply = async () => {
    if (loyaltyPoints <= 0) return;
    setIsValidating(true);
    try {
      const res = await fetcher.post<{
        data: {
          valid: boolean;
          errors?: string[];
          calculation: {
            points_requested: number;
            points_to_redeem: number;
            discount_amount: number;
            max_redeemable_points: number;
          };
          config?: { min_redemption_points: number; redemption_rate: number };
        };
      }>("/api/me/loyalty-points/calculate-redemption", {
        points_to_redeem: loyaltyPoints,
        booking_subtotal: bookingSubtotalForLoyalty,
      });
      const payload = res.data;
      if (!payload?.calculation) {
        toast.error("Could not calculate loyalty redemption");
        return;
      }
      const { points_to_redeem, discount_amount } = payload.calculation;
      const minPts = payload.config?.min_redemption_points ?? minRedemptionPoints;
      if (points_to_redeem < minPts) {
        toast.error(
          payload.errors?.filter(Boolean).join(" ") ||
            `You need at least ${minPts} redeemable points on this booking (after % cap).`,
        );
        return;
      }
      updateBookingState({
        promotions: {
          ...bookingState.promotions,
          loyaltyPointsUsed: points_to_redeem,
          loyaltyDiscount: Math.round(discount_amount * 100) / 100,
        },
      });
      setLoyaltyPoints(points_to_redeem);
      if (!payload.valid && payload.errors?.length) {
        toast.info(payload.errors.join(" "));
      } else {
        toast.success("Loyalty points applied");
      }
    } catch (error) {
      toast.error(
        error instanceof FetchError ? error.message : "Failed to apply loyalty points",
      );
    } finally {
      setIsValidating(false);
    }
  };

  const removePromotion = (type: "coupon" | "giftCard" | "loyalty") => {
    if (type === "coupon") {
      setCouponCode("");
      updateBookingState({
        promotions: {
          ...bookingState.promotions,
          couponCode: undefined,
          couponDiscount: undefined,
        },
      });
    } else if (type === "giftCard") {
      setGiftCardCode("");
      updateBookingState({
        promotions: {
          ...bookingState.promotions,
          giftCardCode: undefined,
          giftCardAmount: undefined,
        },
      });
    } else {
      setLoyaltyPoints(0);
      updateBookingState({
        promotions: {
          ...bookingState.promotions,
          loyaltyPointsUsed: undefined,
          loyaltyDiscount: undefined,
        },
      });
    }
  };

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Promotions & Rewards
        </h2>
        <p className="text-gray-600">
          Apply coupons, gift cards, or use loyalty points
        </p>
      </div>

      {/* Coupon Code */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Ticket className="w-4 h-4" />
          Coupon Code
        </Label>
        {bookingState.promotions.couponCode ? (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
            <div>
              <p className="font-medium text-green-900">
                {bookingState.promotions.couponCode}
              </p>
              <p className="text-sm text-green-700">
                Discount: {formatCurrency(bookingState.promotions.couponDiscount || 0, tenantCurrency)}
              </p>
            </div>
            <button
              onClick={() => removePromotion("coupon")}
              className="p-2 rounded-full hover:bg-green-100 transition-colors touch-target"
              aria-label="Remove coupon"
            >
              <X className="w-4 h-4 text-green-700" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Enter coupon code"
              className="flex-1 touch-target"
              disabled={isValidating}
            />
            <Button
              onClick={handleCouponApply}
              disabled={!couponCode.trim() || isValidating}
              className="bg-primary hover:bg-primary-hover touch-target"
            >
              {isValidating ? "..." : "Apply"}
            </Button>
          </div>
        )}
      </div>

      {/* Gift Card */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Gift className="w-4 h-4" />
          Gift Card
        </Label>
        {bookingState.promotions.giftCardCode ? (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
            <div>
              <p className="font-medium text-green-900">
                Gift Card: {bookingState.promotions.giftCardCode}
              </p>
              <p className="text-sm text-green-700">
                Amount: {formatCurrency(bookingState.promotions.giftCardAmount || 0, tenantCurrency)}
              </p>
            </div>
            <button
              onClick={() => removePromotion("giftCard")}
              className="p-2 rounded-full hover:bg-green-100 transition-colors touch-target"
              aria-label="Remove gift card"
            >
              <X className="w-4 h-4 text-green-700" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={giftCardCode}
              onChange={(e) => setGiftCardCode(e.target.value)}
              placeholder="Enter 12-digit gift card code"
              maxLength={12}
              className="flex-1 touch-target"
              disabled={isValidating}
            />
            <Button
              onClick={handleGiftCardApply}
              disabled={!giftCardCode.trim() || isValidating || giftCardCode.length !== 12}
              className="bg-primary hover:bg-primary-hover touch-target"
            >
              {isValidating ? "..." : "Apply"}
            </Button>
          </div>
        )}
      </div>

      {/* Loyalty Points */}
      {/* §Release-audit 2026-04: previously hidden when loyaltyBalance === 0,
       * which meant signed-in users with no points never saw the loyalty
       * section — including the educational copy explaining that bookings
       * earn points. Always render for logged-in users; show an empty-state
       * card when balance is 0. */}
      {user && (
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Star className="w-4 h-4" />
            Loyalty Points
          </Label>
          {loyaltyBalance <= 0 ? (
            <div className="p-4 bg-blue-50/60 border border-blue-200/70 rounded-lg">
              <p className="text-sm font-medium text-blue-900 mb-1">
                You don&apos;t have any loyalty points yet
              </p>
              <p className="text-xs text-blue-800/90">
                You&apos;ll earn points every time you complete a booking. Use them
                on a future booking to get money off.
              </p>
            </div>
          ) : (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-2">
              You have {loyaltyBalance.toLocaleString()} points
            </p>
            <p className="text-xs text-blue-700 mb-1">
              Value: {formatCurrency(loyaltyBalance / redemptionRate, tenantCurrency)} ({redemptionRate} points = 1{" "}
              {bookingState.selectedServices[0]?.currency || tenantCurrency})
            </p>
            {bookingSubtotalForLoyalty > 0 && (
              <p className="text-xs text-blue-800/90 mb-3">
                Max redeemable on this booking: {Math.min(maxRedeemablePointsOnBooking, loyaltyBalance).toLocaleString()}{" "}
                points
                {maxRedemptionPercentage < 100 ? ` (up to ${maxRedemptionPercentage}% of order subtotal)` : ""}
                {minRedemptionPoints > 0 ? ` · Min ${minRedemptionPoints} points to redeem` : ""}
              </p>
            )}
            {bookingState.promotions.loyaltyPointsUsed ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-900">
                  Using {bookingState.promotions.loyaltyPointsUsed.toLocaleString()} points
                  {bookingState.promotions.loyaltyDiscount != null &&
                  bookingState.promotions.loyaltyDiscount > 0 ? (
                    <>
                      {" "}
                      · −
                      {formatCurrency(
                        bookingState.promotions.loyaltyDiscount,
                        tenantCurrency,
                      )}
                    </>
                  ) : null}
                </span>
                <button
                  onClick={() => removePromotion("loyalty")}
                  className="text-sm text-blue-700 underline touch-target"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={loyaltyPoints || ""}
                  onChange={(e) => setLoyaltyPoints(parseInt(e.target.value, 10) || 0)}
                  placeholder="Enter points to use"
                  max={Math.min(loyaltyBalance, maxRedeemablePointsOnBooking || loyaltyBalance)}
                  min={0}
                  className="flex-1 touch-target"
                />
                <Button
                  onClick={() => void handleLoyaltyApply()}
                  disabled={
                    isValidating ||
                    loyaltyPoints <= 0 ||
                    loyaltyPoints > loyaltyBalance ||
                    (maxRedeemablePointsOnBooking > 0 && loyaltyPoints > maxRedeemablePointsOnBooking)
                  }
                  className="bg-primary hover:bg-primary-hover touch-target"
                >
                  {isValidating ? "..." : "Use"}
                </Button>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="p-4 bg-gray-50 rounded-lg space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Order subtotal</span>
          <span className="font-medium">{formatCurrency(cartTotal, tenantCurrency)}</span>
        </div>
        {bookingState.promotions.couponDiscount && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Coupon Discount</span>
            <span>-{formatCurrency(bookingState.promotions.couponDiscount, tenantCurrency)}</span>
          </div>
        )}
        {bookingState.promotions.giftCardAmount && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Gift Card</span>
            <span>-{formatCurrency(bookingState.promotions.giftCardAmount, tenantCurrency)}</span>
          </div>
        )}
        {bookingState.promotions.loyaltyDiscount && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Loyalty Points</span>
            <span>-{formatCurrency(bookingState.promotions.loyaltyDiscount, tenantCurrency)}</span>
          </div>
        )}
        {bookingState.promotions.membershipDiscount && (
          <div className="flex justify-between text-sm text-green-600">
            <span>{bookingState.promotions.membershipPlanName || "Membership"}</span>
            <span>-{formatCurrency(bookingState.promotions.membershipDiscount, tenantCurrency)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold pt-2 border-t border-gray-200">
          <span className="text-gray-900">After promotions</span>
          <span>{formatCurrency(subtotalAfterPromotions, tenantCurrency)}</span>
        </div>
      </div>
    </div>
  );
}
