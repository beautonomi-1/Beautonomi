"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, CreditCard, Calendar, MapPin, Wallet, Gift, Banknote, Check, Plus, Shield, ArrowLeft, Lock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { BookingState } from "../booking-flow";
import { formatCurrency, formatDate, formatTime } from "@/lib/utils";
import { initializePayment, chargeSavedCard } from "../../actions/payment-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher } from "@/lib/http/fetcher";
import { useTranslation } from "@beautonomi/i18n";
import LoginModal from "@/components/global/login-modal";

interface SavedCard {
  id: string;
  type: string;
  card_type?: string;
  last4?: string;
  expiry_month?: number;
  expiry_year?: number;
  cardholder_name?: string;
  is_default: boolean;
  is_active: boolean;
}

interface StepPaymentProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
}

export default function StepPayment({
  bookingState,
  updateBookingState,
}: StepPaymentProps) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [tipAmount, _setTipAmount] = useState(bookingState.tipAmount || 0);
  const [_customTip, _setCustomTip] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash" | "giftcard">(
    bookingState.paymentMethod || "card"
  );
  const [paymentOption, setPaymentOption] = useState<"deposit" | "full">(
    bookingState.paymentOption || "full"
  );
  const [saveCard, setSaveCard] = useState(bookingState.saveCard || false);
  const [setAsDefault, setSetAsDefault] = useState(bookingState.setAsDefault || false);
  const [acceptedCancellationPolicy, setAcceptedCancellationPolicy] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [isChargingCard, setIsChargingCard] = useState(false);
  const { t } = useTranslation();
  const [cancellationPolicy, setCancellationPolicy] = useState<{
    policy_text: string;
    hours_before_cutoff: number;
    late_cancellation_type: string;
  } | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletCurrency, setWalletCurrency] = useState<string>("ZAR");
  const [walletLoading, setWalletLoading] = useState(false);
  const useWallet = bookingState.useWallet ?? false;

  const SAVE_CARD_INFO =
    "We'll save your card securely when you pay. To verify your card, Paystack may place a small temporary charge (e.g. R1) and reverse it—this confirms your card for future use.";

  const handleSetDefaultCard = async (cardId: string) => {
    setSettingDefaultId(cardId);
    try {
      await fetcher.patch(`/api/me/payment-methods/${cardId}`, { is_default: true });
      const listRes = await fetcher.get<{ data: SavedCard[] }>("/api/me/payment-methods");
      const active = (listRes.data || []).filter((c) => c.is_active);
      setSavedCards(active);
      toast.success("Default card updated");
    } catch {
      toast.error("Failed to set default card");
    } finally {
      setSettingDefaultId(null);
    }
  };

  // Fetch cancellation policy for the provider
  useEffect(() => {
    const fetchCancellationPolicy = async () => {
      if (!bookingState.providerId) return;
      
      try {
        const locationType = bookingState.mode === "salon" ? "at_salon" : "at_home";
        // First try to get policy for specific location type
        let response = await fetcher.get<{ data: any[] }>(
          `/api/public/cancellation-policy?provider_id=${bookingState.providerId}&location_type=${locationType}`
        );
        
        // If no specific policy, try to get general policy (location_type = null)
        if (!response.data || response.data.length === 0) {
          response = await fetcher.get<{ data: any[] }>(
            `/api/public/cancellation-policy?provider_id=${bookingState.providerId}`
          );
        }
        
        if (response.data && response.data.length > 0) {
          setCancellationPolicy(response.data[0]);
        }
      } catch (error) {
        console.error("Error fetching cancellation policy:", error);
        // Set a default policy if fetch fails
        setCancellationPolicy({
          policy_text: "Cancellations must be made at least 24 hours before your appointment. Cancellations made within 24 hours may be subject to a cancellation fee.",
          hours_before_cutoff: 24,
          late_cancellation_type: "no_refund",
        });
      }
    };
    
    fetchCancellationPolicy();
  }, [bookingState.providerId, bookingState.mode]);

  // Fetch saved payment methods
  useEffect(() => {
    if (!user) return;
    const loadCards = async () => {
      setCardsLoading(true);
      try {
        const res = await fetcher.get<{ data: SavedCard[] }>("/api/me/payment-methods");
        const active = (res.data || []).filter((c) => c.is_active);
        setSavedCards(active);
        const defaultCard = active.find((c) => c.is_default) || active[0];
        if (defaultCard && !selectedCardId) {
          setSelectedCardId(defaultCard.id);
        }
      } catch {
        // Silently fail - user can still pay with new card
      } finally {
        setCardsLoading(false);
      }
    };
    loadCards();
  }, [user]);

  // Fetch wallet balance when user is logged in (for "Use wallet" option)
  useEffect(() => {
    if (!user) return;
    setWalletLoading(true);
    fetcher.get<{ data: { wallet: { balance: number; currency: string }; transactions: unknown[] } }>("/api/me/wallet", { cache: "no-store" })
      .then((res) => {
        if (res?.data?.wallet) {
          setWalletBalance(Number(res.data.wallet.balance) || 0);
          setWalletCurrency(res.data.wallet.currency || "ZAR");
        }
      })
      .catch(() => {})
      .finally(() => setWalletLoading(false));
  }, [user]);

  // Update booking state when payment options change
  useEffect(() => {
    updateBookingState({ 
      tipAmount,
      paymentMethod,
      paymentOption,
      useWallet,
      saveCard,
      setAsDefault,
    });
  }, [tipAmount, paymentMethod, paymentOption, useWallet, saveCard, setAsDefault]);

  // Calculate totals - for group bookings, sum all participant services
  const calculateServicesTotal = () => {
    if (bookingState.isGroupBooking && bookingState.groupParticipants) {
      // For group bookings, calculate from participants
      return bookingState.groupParticipants.reduce((total, participant) => {
        const participantTotal = participant.serviceIds.reduce((sum, serviceId) => {
          const service = bookingState.selectedServices.find(s => s.id === serviceId);
          return sum + (service?.price || 0);
        }, 0);
        return total + participantTotal;
      }, 0);
    }
    // Regular booking - sum selected services
    return bookingState.selectedServices.reduce((sum, s) => sum + s.price, 0);
  };

  const totals = {
    services: calculateServicesTotal(),
    addons: bookingState.selectedAddons.reduce((sum, a) => sum + a.price, 0),
    products: bookingState.selectedProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0),
    travelFee: bookingState.address?.travelFee || 0,
    travelFeeBreakdown: bookingState.address?.breakdown || [],
    subtotal: 0,
    discounts: (bookingState.promotions.couponDiscount || 0) +
      (bookingState.promotions.giftCardAmount || 0) +
      (bookingState.promotions.loyaltyDiscount || 0) +
      (bookingState.promotions.membershipDiscount || 0),
    subtotalAfterDiscounts: 0,
    taxAmount: bookingState.taxAmount || 0,
    taxRate: bookingState.taxRate || 0,
    serviceFeeAmount: bookingState.serviceFeeAmount || 0,
    serviceFeePercentage: bookingState.serviceFeePercentage || 0,
    tipAmount: bookingState.tipAmount || 0,
    total: 0,
    currency: bookingState.selectedServices[0]?.currency || "ZAR",
  };

  totals.subtotal = totals.services + totals.addons + totals.products + totals.travelFee;
  totals.subtotalAfterDiscounts = Math.max(0, totals.subtotal - totals.discounts);
  totals.total = totals.subtotalAfterDiscounts + totals.taxAmount + totals.serviceFeeAmount + totals.tipAmount;

  const createBookingDraft = async () => {
    if (!bookingState.providerId || !bookingState.selectedDate || !bookingState.selectedTimeSlot) {
      throw new Error("Missing required booking information");
    }

    // Validate salon bookings have location_id
    if (bookingState.mode === "salon" && !bookingState.selectedLocationId) {
      throw new Error("Please select a location for your salon booking");
    }

    // Validate mobile bookings have address
    if (bookingState.mode === "mobile" && !bookingState.address) {
      throw new Error("Please provide an address for your home service booking");
    }

    // Note: Minimum booking amount validation will be done server-side
    // We can add client-side validation here if provider info is available

    const bookingDateTime = new Date(bookingState.selectedDate);
    const [hours, minutes] = bookingState.selectedTimeSlot.split(":").map(Number);
    bookingDateTime.setHours(hours, minutes, 0, 0);

    // For group bookings, create services array from all participants
    // For regular bookings, use selected services
    const servicesForBooking = bookingState.isGroupBooking && bookingState.groupParticipants
      ? bookingState.groupParticipants.flatMap(participant =>
          participant.serviceIds.map(serviceId => {
            const service = bookingState.selectedServices.find(s => s.id === serviceId);
            return {
              offering_id: serviceId,
              staff_id: service?.staffId || null,
            };
          })
        )
      : bookingState.selectedServices.map(s => ({
          offering_id: s.id,
          staff_id: s.staffId,
        }));

    const bookingData: any = {
      provider_id: bookingState.providerId,
      services: servicesForBooking,
      selected_datetime: bookingDateTime.toISOString(),
      location_type: bookingState.mode === "salon" ? "at_salon" : "at_home",
      location_id: bookingState.selectedLocationId || null,
      address: bookingState.mode === "mobile" && bookingState.address ? {
        line1: bookingState.address.structuredAddress?.line1 || bookingState.address.fullAddress.split(",")[0] || bookingState.address.fullAddress,
        city: bookingState.address.structuredAddress?.city || bookingState.address.fullAddress.split(",").slice(-2)[0]?.trim() || "",
        country: bookingState.address.structuredAddress?.country || bookingState.address.fullAddress.split(",").slice(-1)[0]?.trim() || "",
        postal_code: bookingState.address.structuredAddress?.postalCode,
        latitude: bookingState.address.coordinates?.lat,
        longitude: bookingState.address.coordinates?.lng,
        apartment_unit: bookingState.address.apartmentUnit,
        building_name: bookingState.address.buildingName,
        floor_number: bookingState.address.floorNumber,
        access_codes: bookingState.address.accessCodes,
        parking_instructions: bookingState.address.parkingInstructions,
        location_landmarks: bookingState.address.locationLandmarks,
      } : null,
      addons: bookingState.selectedAddons.map(a => a.id),
      products: bookingState.selectedProducts.map(p => ({
        productId: p.id,
        quantity: p.quantity,
        unitPrice: p.price,
        totalPrice: p.price * p.quantity,
      })),
      package_id: bookingState.selectedPackage?.id || null,
      tip_amount: tipAmount,
      travel_fee: bookingState.address?.travelFee || 0,
      special_requests: bookingState.clientInfo?.specialRequests || null,
      house_call_instructions: bookingState.mode === "mobile" ? (bookingState.clientInfo?.houseCallInstructions || null) : null,
      client_info: bookingState.clientInfo,
      payment_method: paymentMethod,
      payment_option: paymentOption,
      save_card: saveCard,
      set_as_default: setAsDefault,
      promotion_code: bookingState.promotions.couponCode || null,
      gift_card_code: bookingState.promotions.giftCardCode || null,
      membership_plan_id: bookingState.promotions.membershipPlanId || null,
      use_wallet: (bookingState.useWallet ?? false) || (bookingState.promotions.loyaltyPointsUsed ? true : false),
    };

    // Add group booking data if it's a group booking
    if (bookingState.isGroupBooking && bookingState.groupParticipants) {
      bookingData.is_group_booking = true;
      bookingData.group_participants = bookingState.groupParticipants.map(p => ({
        name: p.name,
        email: p.email,
        phone: p.phone,
        service_ids: p.serviceIds,
        notes: p.notes,
      }));
    }

    const response = await fetcher.post<{ data: { booking_id: string; booking_number: string } }>(
      "/api/public/bookings",
      bookingData
    );

    return response.data;
  };

  const handlePayment = async () => {
    // Check authentication before proceeding
    if (!user && !authLoading) {
      setIsLoginModalOpen(true);
      toast.info("Please sign in or create an account to complete your booking");
      return;
    }

    // If still loading auth, wait a bit
    if (authLoading) {
      toast.info("Verifying your account...");
      return;
    }

    if (!bookingState.clientInfo) {
      toast.error("Please complete your information first");
      return;
    }

    if (paymentMethod === "giftcard" && !bookingState.promotions.giftCardCode) {
      toast.error("Please enter a gift card code in the promotions step");
      return;
    }

    if (!acceptedCancellationPolicy) {
      toast.error("Please accept the cancellation policy to continue");
      return;
    }

    setIsProcessing(true);
    let bookingDraft: { booking_id: string; booking_number: string } | null = null;

    try {
      // Step 1: Create booking draft first
      try {
        bookingDraft = await createBookingDraft();
      } catch (error: any) {
        // Handle conflict errors (409) - time slot no longer available
        if (error.status === 409 || error.code === 'CONFLICT') {
          toast.error(error.message || "This time slot is no longer available. Please select another time.", {
            duration: 5000,
          });
          // Navigate back to calendar step to select a new time
          updateBookingState({ currentStepIndex: 2 }); // Step 2 is calendar
          return;
        }
        
        toast.error(error.message || "Failed to create booking. Please try again.");
        return;
      }

      // Step 2: Process payment based on method
      if (paymentMethod === "cash") {
        // Cash payment - booking already created, just redirect
        toast.success("Booking created! You'll pay at the salon.");
        router.push(`/booking/confirmation?bookingId=${bookingDraft.booking_id}`);
        return;
      }

      if (paymentMethod === "giftcard") {
        // Gift card payment - booking already created, payment processed in backend
        toast.success("Booking created! Payment processed from gift card.");
        router.push(`/booking/confirmation?bookingId=${bookingDraft.booking_id}`);
        return;
      }

      // Wallet covered full amount – no payment_url returned
      const draftWithUrl = bookingDraft as { booking_id: string; booking_number: string; payment_url?: string | null };
      if ((bookingState.useWallet ?? false) && (draftWithUrl.payment_url == null || draftWithUrl.payment_url === "")) {
        toast.success("Booking created! Payment processed from wallet.");
        router.push(`/booking/confirmation?bookingId=${bookingDraft.booking_id}`);
        return;
      }

      const amountToCharge = paymentOption === "deposit" 
        ? totals.total * 0.5 * 100
        : totals.total * 100;

      // Saved card flow: charge directly without redirect
      if (selectedCardId && !useNewCard && savedCards.length > 0) {
        setIsChargingCard(true);
        try {
          const chargeResult = await chargeSavedCard({
            payment_method_id: selectedCardId,
            amount: amountToCharge / 100,
            email: bookingState.clientInfo.email,
            currency: totals.currency,
            metadata: {
              booking_id: bookingDraft.booking_id,
              booking_number: bookingDraft.booking_number,
            },
          });
          
          const status = chargeResult.status || chargeResult.transaction?.status;
          if (status === "success") {
            toast.success("Payment successful!");
            router.push(`/booking/confirmation?bookingId=${bookingDraft.booking_id}`);
          } else {
            toast.error("Card payment failed. Please try another card or use a new one.");
          }
        } catch (chargeError: any) {
          toast.error(chargeError.message || "Failed to charge saved card. Please try a new card.");
        } finally {
          setIsChargingCard(false);
        }
        return;
      }

      // New card flow: redirect to Paystack hosted checkout
      const result = await initializePayment({
        email: bookingState.clientInfo.email,
        amount: amountToCharge,
        metadata: {
          bookingId: bookingDraft.booking_id,
          bookingNumber: bookingDraft.booking_number,
          paymentOption,
          saveCard: saveCard.toString(),
          setAsDefault: setAsDefault.toString(),
        },
      });

      if (result.authorization_url) {
        window.location.href = result.authorization_url;
      } else {
        toast.error("Failed to initialize payment");
        toast.info("Booking draft created. You can retry payment from your bookings page.");
      }
    } catch (error: any) {
      const errorMessage = error.message || "Payment initialization failed";
      toast.error(errorMessage);
      
      // If booking draft was created but payment failed, provide retry option
      if (bookingDraft) {
        toast.info("Booking draft created. You can retry payment from your bookings page.", {
          action: {
            label: "View Booking",
            onClick: () => router.push(`/booking/confirmation?bookingId=${bookingDraft!.booking_id}`),
          },
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="px-4 py-6 space-y-6 pb-32">
      {/* Booking Summary */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-900">{t("booking.reviewBooking")}</h2>

        {/* Services */}
        <div className="p-4 bg-gray-50 rounded-lg space-y-3">
          <h3 className="font-semibold text-gray-900">
            {bookingState.isGroupBooking ? "Group Booking" : "Services"}
          </h3>
          {bookingState.isGroupBooking && bookingState.groupParticipants ? (
            // Show participants for group bookings
            bookingState.groupParticipants.map((participant) => {
              const participantServices = participant.serviceIds
                .map(id => bookingState.selectedServices.find(s => s.id === id))
                .filter(Boolean) as typeof bookingState.selectedServices;
              const participantTotal = participantServices.reduce((sum, s) => sum + s.price, 0);
              
              return (
                <div key={participant.id} className="border-b border-gray-200 pb-3 last:border-0 last:pb-0">
                  <p className="font-medium text-gray-900 mb-2">{participant.name}</p>
                  {participantServices.map((service) => (
                    <div key={service.id} className="flex justify-between text-sm ml-4 mb-1">
                      <span className="text-gray-600">
                        {service.title}
                        {service.staffName && ` - ${service.staffName}`}
                      </span>
                      <span className="font-medium">{formatCurrency(service.price, totals.currency)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-medium mt-2 ml-4">
                    <span>Subtotal</span>
                    <span>{formatCurrency(participantTotal, totals.currency)}</span>
                  </div>
                </div>
              );
            })
          ) : (
            // Show services for regular bookings
            bookingState.selectedServices.map((service) => (
              <div key={service.id} className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {service.title}
                  {service.staffName && ` - ${service.staffName}`}
                </span>
                <span className="font-medium">{formatCurrency(service.price, totals.currency)}</span>
              </div>
            ))
          )}
          {bookingState.selectedAddons.map((addon) => (
            <div key={addon.id} className="flex justify-between text-sm">
              <span className="text-gray-600">+ {addon.title}</span>
              <span className="font-medium">{formatCurrency(addon.price, totals.currency)}</span>
            </div>
          ))}
          {bookingState.selectedProducts.map((product) => (
            <div key={product.id} className="flex justify-between text-sm">
              <span className="text-gray-600">
                {product.name} {product.quantity > 1 && `× ${product.quantity}`}
              </span>
              <span className="font-medium">
                {formatCurrency(product.price * product.quantity, product.currency || totals.currency)}
              </span>
            </div>
          ))}
          {totals.travelFee > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Travel Fee
                </span>
                <span className="font-medium">{formatCurrency(totals.travelFee, totals.currency)}</span>
              </div>
              {totals.travelFeeBreakdown && totals.travelFeeBreakdown.length > 0 && (
                <div className="pl-4 text-xs text-gray-500 space-y-0.5">
                  {totals.travelFeeBreakdown.map((item, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{item.label}:</span>
                      <span>{formatCurrency(item.amount, totals.currency)}</span>
                    </div>
                  ))}
                </div>
              )}
              {bookingState.address?.distanceKm && (
                <div className="pl-4 text-xs text-gray-500">
                  Distance: {bookingState.address.distanceKm.toFixed(1)}km
                  {bookingState.address.travelTimeMinutes && ` • Est. travel: ${bookingState.address.travelTimeMinutes} min`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date & Time */}
        {bookingState.selectedDate && bookingState.selectedTimeSlot && (
          <div className="p-4 bg-gray-50 rounded-lg flex items-center gap-3">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {formatDate(bookingState.selectedDate)}
              </p>
              <p className="text-xs text-gray-600">
                {formatTime(bookingState.selectedTimeSlot)}
              </p>
            </div>
          </div>
        )}

        {/* Location */}
        {bookingState.mode === "salon" ? (
          <div className="p-4 bg-gray-50 rounded-lg flex items-center gap-3">
            <MapPin className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900">At the Salon</p>
            </div>
          </div>
        ) : bookingState.address && (
          <div className="p-4 bg-gray-50 rounded-lg flex items-center gap-3">
            <MapPin className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900">House Call</p>
              <p className="text-xs text-gray-600">{bookingState.address.fullAddress}</p>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="p-4 bg-gray-50 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t("booking.subtotal")}</span>
            <span className="font-medium">{formatCurrency(totals.subtotal, totals.currency)}</span>
          </div>
          {bookingState.promotions.couponDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{t("booking.discount")}</span>
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
          {totals.serviceFeeAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Service Fee{totals.serviceFeePercentage > 0 ? ` (${totals.serviceFeePercentage}%)` : ''}</span>
              <span>{formatCurrency(totals.serviceFeeAmount, totals.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold pt-2 border-t">
            <span>{t("booking.total")}</span>
            <span>{formatCurrency(totals.total, totals.currency)}</span>
          </div>
        </div>
      </div>

      {/* Payment Method Selection */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Payment Method</h3>
        
        {/* Method toggle: Card / Cash / Gift Card */}
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setPaymentMethod("card")}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              paymentMethod === "card"
                ? "border-[#FF0077] bg-pink-50"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <CreditCard className={`w-5 h-5 ${paymentMethod === "card" ? "text-[#FF0077]" : "text-gray-500"}`} />
            <span className={`text-sm font-medium ${paymentMethod === "card" ? "text-[#FF0077]" : "text-gray-700"}`}>Card</span>
            {paymentMethod === "card" && <Check className="w-4 h-4 text-[#FF0077]" />}
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod("cash")}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              paymentMethod === "cash"
                ? "border-[#FF0077] bg-pink-50"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <Banknote className={`w-5 h-5 ${paymentMethod === "cash" ? "text-[#FF0077]" : "text-gray-500"}`} />
            <span className={`text-sm font-medium ${paymentMethod === "cash" ? "text-[#FF0077]" : "text-gray-700"}`}>Cash</span>
            {paymentMethod === "cash" && <Check className="w-4 h-4 text-[#FF0077]" />}
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod("giftcard")}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              paymentMethod === "giftcard"
                ? "border-[#FF0077] bg-pink-50"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <Gift className={`w-5 h-5 ${paymentMethod === "giftcard" ? "text-[#FF0077]" : "text-gray-500"}`} />
            <span className={`text-sm font-medium ${paymentMethod === "giftcard" ? "text-[#FF0077]" : "text-gray-700"}`}>Gift Card</span>
            {paymentMethod === "giftcard" && <Check className="w-4 h-4 text-[#FF0077]" />}
          </button>
        </div>

        {/* Use wallet balance (when card selected and user has balance) */}
        {paymentMethod === "card" && user && (
          <div className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50/50">
            <Checkbox
              id="use-wallet"
              checked={useWallet}
              onCheckedChange={(checked) => updateBookingState({ useWallet: !!checked })}
              disabled={walletLoading || walletBalance <= 0}
            />
            <label htmlFor="use-wallet" className="flex-1 cursor-pointer text-sm text-gray-700">
              {walletLoading ? (
                "Loading wallet..."
              ) : walletBalance > 0 ? (
                <>Use wallet balance — {formatCurrency(walletBalance, walletCurrency)} available</>
              ) : (
                "Use wallet balance (no balance)"
              )}
            </label>
            {useWallet && walletBalance > 0 && (
              <Wallet className="w-4 h-4 text-[#FF0077] shrink-0" />
            )}
          </div>
        )}

        {/* Deposit vs Full payment option */}
        {paymentMethod === "card" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentOption("full")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                paymentOption === "full"
                  ? "border-[#FF0077] bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              {paymentOption === "full" && <CheckCircle className="w-4 h-4 text-[#FF0077]" />}
              <span className={`text-sm font-medium ${paymentOption === "full" ? "text-[#FF0077]" : "text-gray-700"}`}>
                Pay in Full
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentOption("deposit")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                paymentOption === "deposit"
                  ? "border-[#FF0077] bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              {paymentOption === "deposit" && <CheckCircle className="w-4 h-4 text-[#FF0077]" />}
              <span className={`text-sm font-medium ${paymentOption === "deposit" ? "text-[#FF0077]" : "text-gray-700"}`}>
                Deposit (50%)
              </span>
            </button>
          </div>
        )}

        {/* Saved Cards (only when card method selected) */}
        <AnimatePresence>
          {paymentMethod === "card" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {cardsLoading ? (
                <div className="space-y-2">
                  <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                  <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                </div>
              ) : savedCards.length > 0 && !useNewCard ? (
                <>
                  <p className="text-sm font-medium text-gray-700">Your saved cards</p>
                  <div className="space-y-2">
                    {savedCards.map((card) => {
                      const active = selectedCardId === card.id;
                      const brand = card.card_type
                        ? card.card_type.charAt(0).toUpperCase() + card.card_type.slice(1)
                        : "Card";
                      const expiry = card.expiry_month && card.expiry_year
                        ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
                        : null;

                      return (
                        <motion.button
                          key={card.id}
                          type="button"
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => { setSelectedCardId(card.id); setUseNewCard(false); }}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                            active
                              ? "border-[#FF0077] bg-pink-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          }`}
                        >
                          <div className={`w-10 h-7 rounded-md flex items-center justify-center ${
                            active ? "bg-[#FF0077]/10" : "bg-gray-100"
                          }`}>
                            <CreditCard className={`w-5 h-5 ${active ? "text-[#FF0077]" : "text-gray-500"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-semibold ${active ? "text-[#FF0077]" : "text-gray-900"}`}>
                                {brand}{card.last4 ? ` •••• ${card.last4}` : ""}
                              </span>
                              {card.is_default ? (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full">
                                  Default
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleSetDefaultCard(card.id); }}
                                  disabled={settingDefaultId === card.id}
                                  className="text-[10px] font-semibold text-[#FF0077] hover:text-[#D60565] underline disabled:opacity-50"
                                >
                                  {settingDefaultId === card.id ? "Updating..." : "Set default"}
                                </button>
                              )}
                            </div>
                            {expiry && (
                              <span className="text-xs text-gray-500">Expires {expiry}</span>
                            )}
                          </div>
                          {active && <CheckCircle className="w-5 h-5 text-[#FF0077] flex-shrink-0" />}
                        </motion.button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setUseNewCard(true); setSelectedCardId(null); }}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-medium">Use a new card</span>
                  </button>
                </>
              ) : null}

              {/* "Back to saved cards" link when using new card */}
              {useNewCard && savedCards.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setUseNewCard(false);
                    const def = savedCards.find((c) => c.is_default) || savedCards[0];
                    if (def) setSelectedCardId(def.id);
                  }}
                  className="flex items-center gap-2 text-sm text-[#FF0077] hover:text-[#D60565] font-medium transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Use a saved card instead
                </button>
              )}

              {/* Save card toggle (only for new card flow) */}
              {(savedCards.length === 0 || useNewCard) && (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center gap-3">
                    <Lock className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-900">Save this card</p>
                        <button
                          type="button"
                          onClick={() => toast.info(SAVE_CARD_INFO, { duration: 8000 })}
                          className="p-0.5 rounded-full hover:bg-gray-200 text-[#FF0077]"
                          aria-label="Info about saving card"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">For faster checkout next time</p>
                    </div>
                  </div>
                  <Switch
                    checked={saveCard}
                    onCheckedChange={(checked) => {
                      setSaveCard(checked);
                      if (checked) setSetAsDefault(savedCards.length === 0);
                    }}
                  />
                </div>
              )}

              {/* Set as default toggle (only when saving a new card and already has cards) */}
              {saveCard && (savedCards.length === 0 || useNewCard) && savedCards.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-700">Set as default payment method</span>
                  <Switch checked={setAsDefault} onCheckedChange={setSetAsDefault} />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cancellation Policy Acceptance */}
      {cancellationPolicy && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-2">Cancellation Policy</h3>
          <p className="text-sm text-gray-600 mb-4">{cancellationPolicy.policy_text}</p>
          <div className="flex items-start gap-3">
            <Checkbox
              id="accept-cancellation-policy"
              checked={acceptedCancellationPolicy}
              onCheckedChange={(checked) => setAcceptedCancellationPolicy(checked === true)}
              className="mt-1"
            />
            <Label
              htmlFor="accept-cancellation-policy"
              className="text-sm text-gray-700 cursor-pointer leading-relaxed"
            >
              I understand and accept the cancellation policy. I acknowledge that cancellations made within {cancellationPolicy.hours_before_cutoff} hours of my appointment may result in a {cancellationPolicy.late_cancellation_type === "no_refund" ? "no refund" : cancellationPolicy.late_cancellation_type === "partial_refund" ? "partial refund" : "full refund"}.
            </Label>
          </div>
        </div>
      )}

      {/* Payment Button */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-4 px-4 py-4 safe-area-bottom">
        {(() => {
          const usingSavedCard = paymentMethod === "card" && !!selectedCardId && !useNewCard && savedCards.length > 0;
          const selectedCard = usingSavedCard ? savedCards.find((c) => c.id === selectedCardId) : null;
          const chargeAmount = paymentOption === "deposit" ? totals.total * 0.5 : totals.total;
          
          return (
            <Button
              onClick={handlePayment}
              disabled={isProcessing || isChargingCard || !bookingState.clientInfo || (cancellationPolicy != null && !acceptedCancellationPolicy)}
              className="w-full h-14 text-base font-semibold bg-[#FF0077] hover:bg-[#D60565] disabled:opacity-50 touch-target flex items-center justify-center gap-2"
            >
              {(isProcessing || isChargingCard) ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isChargingCard ? "Charging card..." : "Processing..."}
                </>
              ) : paymentMethod === "cash" ? (
                <>
                  <Banknote className="w-5 h-5" />
                  {t("booking.confirmBooking")}
                </>
              ) : paymentMethod === "giftcard" ? (
                <>
                  <Gift className="w-5 h-5" />
                  Pay with Gift Card
                </>
              ) : usingSavedCard && selectedCard ? (
                <>
                  <Shield className="w-5 h-5" />
                  Pay {formatCurrency(chargeAmount, totals.currency)} with •••• {selectedCard.last4}
                </>
              ) : paymentOption === "deposit" ? (
                <>
                  <CreditCard className="w-5 h-5" />
                  Pay Deposit {formatCurrency(chargeAmount, totals.currency)}
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  Pay {formatCurrency(totals.total, totals.currency)}
                </>
              )}
            </Button>
          );
        })()}
      </div>

      {/* Login Modal - shown when guest tries to complete booking */}
      <LoginModal
        open={isLoginModalOpen}
        setOpen={(open) => {
          setIsLoginModalOpen(open);
        }}
        initialMode="signup"
        redirectContext="customer"
        onAuthSuccess={async () => {
          // After successful auth, automatically retry booking
          setIsLoginModalOpen(false);
          // Small delay to ensure auth state is updated
          await new Promise(resolve => setTimeout(resolve, 500));
          // Retry the payment/booking
          handlePayment();
        }}
        redirectUrl={typeof window !== 'undefined' ? window.location.href : undefined}
      />
    </div>
  );
}
