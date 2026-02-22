"use client";

import { useState, useEffect } from "react";
import { Ticket, Gift, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookingState } from "../booking-flow";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

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
  const { user } = useAuth();
  const [couponCode, setCouponCode] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [platformFeeSettings, setPlatformFeeSettings] = useState<{
    platform_service_fee_type: "percentage" | "fixed";
    platform_service_fee_percentage: number;
    platform_service_fee_fixed: number;
    show_service_fee_to_customer: boolean;
  } | null>(null);

  // Calculate cart total
  const cartTotal = bookingState.selectedServices.reduce(
    (sum, s) => sum + s.price,
    0
  ) +
    bookingState.selectedAddons.reduce((sum, a) => sum + a.price, 0) +
    (bookingState.address?.travelFee || 0);

  // Load platform fee settings
  useEffect(() => {
    loadPlatformFeeSettings();
  }, []);

  // Calculate and update platform service fee when subtotal changes
  useEffect(() => {
    if (platformFeeSettings) {
      const subtotal = cartTotal;
      const discounts =
        (bookingState.promotions.couponDiscount || 0) +
        (bookingState.promotions.giftCardAmount || 0) +
        (bookingState.promotions.loyaltyDiscount || 0);
      const subtotalAfterDiscounts = Math.max(0, subtotal - discounts);

      const serviceFeeAmount =
        platformFeeSettings.platform_service_fee_type === "percentage"
          ? Number(((subtotalAfterDiscounts * platformFeeSettings.platform_service_fee_percentage) / 100).toFixed(2))
          : platformFeeSettings.platform_service_fee_fixed;
      
      const serviceFeePercentage = platformFeeSettings.platform_service_fee_type === "percentage"
        ? platformFeeSettings.platform_service_fee_percentage
        : 0;

      updateBookingState({ 
        serviceFeeAmount,
        serviceFeePercentage 
      });
    }
  }, [cartTotal, bookingState.promotions, platformFeeSettings]);

  const loadPlatformFeeSettings = async () => {
    try {
      const response = await fetcher.get<{
        data: {
          platform_service_fee_type: "percentage" | "fixed";
          platform_service_fee_percentage: number;
          platform_service_fee_fixed: number;
          show_service_fee_to_customer: boolean;
        };
      }>("/api/public/platform-fees");

      if (response.data) {
        setPlatformFeeSettings(response.data);
      }
    } catch (error) {
      console.error("Error loading platform fee settings:", error);
      // Use defaults
      setPlatformFeeSettings({
        platform_service_fee_type: "percentage",
        platform_service_fee_percentage: 5,
        platform_service_fee_fixed: 0,
        show_service_fee_to_customer: true,
      });
    }
  };

  // Load loyalty balance
  useEffect(() => {
    if (user) {
      loadLoyaltyBalance();
    }
  }, [user]);

  const loadLoyaltyBalance = async () => {
    try {
      const response = await fetcher.get<{ data: { balance: number } }>(
        "/api/me/loyalty/balance"
      );
      setLoyaltyBalance(response.data?.balance || 0);
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

  const handleLoyaltyUse = (points: number) => {
    const discount = points * 0.1; // 1 point = 0.1 currency unit
    updateBookingState({
      promotions: {
        ...bookingState.promotions,
        loyaltyPointsUsed: points,
        loyaltyDiscount: discount,
      },
    });
    setLoyaltyPoints(points);
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
                Discount: {formatCurrency(bookingState.promotions.couponDiscount || 0, "ZAR")}
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
              className="bg-[#FF0077] hover:bg-[#D60565] touch-target"
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
                Amount: {formatCurrency(bookingState.promotions.giftCardAmount || 0, "ZAR")}
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
              className="bg-[#FF0077] hover:bg-[#D60565] touch-target"
            >
              {isValidating ? "..." : "Apply"}
            </Button>
          </div>
        )}
      </div>

      {/* Loyalty Points */}
      {user && loyaltyBalance > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Star className="w-4 h-4" />
            Loyalty Points
          </Label>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-2">
              You have {loyaltyBalance.toLocaleString()} points
            </p>
            <p className="text-xs text-blue-700 mb-3">
              Value: {formatCurrency(loyaltyBalance * 0.1, "ZAR")} (1 point = 0.1 {bookingState.selectedServices[0]?.currency || "ZAR"})
            </p>
            {bookingState.promotions.loyaltyPointsUsed ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-900">
                  Using {bookingState.promotions.loyaltyPointsUsed} points
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
                  onChange={(e) => setLoyaltyPoints(parseInt(e.target.value) || 0)}
                  placeholder="Enter points to use"
                  max={loyaltyBalance}
                  min={0}
                  className="flex-1 touch-target"
                />
                <Button
                  onClick={() => handleLoyaltyUse(loyaltyPoints)}
                  disabled={loyaltyPoints <= 0 || loyaltyPoints > loyaltyBalance}
                  className="bg-[#FF0077] hover:bg-[#D60565] touch-target"
                >
                  Use
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="p-4 bg-gray-50 rounded-lg space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Subtotal</span>
          <span className="font-medium">{formatCurrency(cartTotal, "ZAR")}</span>
        </div>
        {bookingState.promotions.couponDiscount && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Coupon Discount</span>
            <span>-{formatCurrency(bookingState.promotions.couponDiscount, "ZAR")}</span>
          </div>
        )}
        {bookingState.promotions.giftCardAmount && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Gift Card</span>
            <span>-{formatCurrency(bookingState.promotions.giftCardAmount, "ZAR")}</span>
          </div>
        )}
        {bookingState.promotions.loyaltyDiscount && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Loyalty Points</span>
            <span>-{formatCurrency(bookingState.promotions.loyaltyDiscount, "ZAR")}</span>
          </div>
        )}
        {bookingState.promotions.membershipDiscount && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Membership Discount</span>
            <span>-{formatCurrency(bookingState.promotions.membershipDiscount, "ZAR")}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold pt-2 border-t">
          <span>Subtotal</span>
          <span>
            {formatCurrency(
              Math.max(0, cartTotal - (bookingState.promotions.couponDiscount || 0) - (bookingState.promotions.giftCardAmount || 0) - (bookingState.promotions.loyaltyDiscount || 0) - (bookingState.promotions.membershipDiscount || 0)),
              "ZAR"
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
