"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, CreditCard, Calendar, MapPin, Wallet, Gift, Banknote, Check, Plus, Shield, ArrowLeft, Lock, Info, Heart, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { BookingState, type BookingStep } from "../booking-flow";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";
import { initializePayment, chargeSavedCard } from "../../actions/payment-actions";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { getTravelBuffer } from "@/lib/config/house-call-config";
import { fetcher } from "@/lib/http/fetcher";
import { useTranslation } from "@beautonomi/i18n";
import LoginModal from "@/components/global/login-modal";
import { useMultipleFeatureFlags } from "@/hooks/useFeatureFlag";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { subscribeRecurringEligible } from "@/lib/recurring/subscribe-recurring-eligibility";

type PublicBookingCreateResult = {
  booking_id: string;
  booking_number: string;
  payment_url?: string | null;
  recurring_subscription?: { created: boolean; pending?: boolean; message?: string };
};

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
  /** Navigate by step id (works when `?package=` reorders steps). */
  onNavigateToStep: (step: BookingStep) => void;
}

/** Services + add-ons + products + travel fee, minus discounts — tip percentages apply to this (before tax & platform fees). */
function getSubtotalAfterDiscounts(state: BookingState): number {
  let services = 0;
  if (state.isGroupBooking && state.groupParticipants) {
    services = state.groupParticipants.reduce((total, participant) => {
      const participantTotal = participant.serviceIds.reduce((sum, serviceId) => {
        const service = state.selectedServices.find((s) => s.id === serviceId);
        return sum + (service?.price || 0);
      }, 0);
      return total + participantTotal;
    }, 0);
  } else {
    services = state.selectedServices.reduce((sum, s) => sum + s.price, 0);
  }
  const addons = state.selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const products = state.selectedProducts.reduce((sum, p) => sum + p.price * p.quantity, 0);
  const travelFee = state.address?.travelFee || 0;
  const subtotal = services + addons + products + travelFee;
  const discounts =
    (state.promotions.couponDiscount || 0) +
    (state.promotions.giftCardAmount || 0) +
    (state.promotions.loyaltyDiscount || 0) +
    (state.promotions.membershipDiscount || 0);
  return Math.max(0, subtotal - discounts);
}

function roundTipAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Common preset percentages for gratuity (computed from subtotal after discounts). */
const TIP_PERCENT_PRESETS = [10, 15, 18, 20] as const;

export default function StepPayment({
  bookingState,
  updateBookingState,
  onNavigateToStep,
}: StepPaymentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Prefer hold created by the new booking flow (bookingState.holdId); fall back
  // to URL param for bookings started from the old /book/[slug] flow.
  const holdId = bookingState.holdId || searchParams.get("hold_id")?.trim() || null;
  const { user, isLoading: authLoading } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState(bookingState.tipAmount || 0);
  const [tipPercentSelection, setTipPercentSelection] = useState<number | null>(
    bookingState.tipPercentSelection ?? null
  );
  const [tipSuggestions, setTipSuggestions] = useState<number[]>([0, 50, 100, 150, 200]);
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
  const [packageEntitlements, setPackageEntitlements] = useState<
    Array<{ id: string; package_id: string; sessions_remaining: number; valid_from?: string | null; valid_until?: string | null }>
  >([]);
  const [packageEntitlementsLoading, setPackageEntitlementsLoading] = useState(false);
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletCurrency, setWalletCurrency] = useState<string>(tenantCurrency);
  const [walletLoading, setWalletLoading] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState<number>(30);
  const [providerRequiresDeposit, setProviderRequiresDeposit] = useState<boolean>(false);
  const useWallet = bookingState.useWallet ?? false;
  const { features: featureFlags, loading: flagsLoading } = useMultipleFeatureFlags([
    "payment_paystack",
    "gift_cards",
    "payment_wallet",
  ]);
  const paystackEnabled = flagsLoading ? true : featureFlags["payment_paystack"] ?? false;
  const giftCardsEnabled = flagsLoading ? true : featureFlags["gift_cards"] ?? false;
  const walletEnabled = flagsLoading ? true : featureFlags["payment_wallet"] ?? false;
  const [cashEnabledOnPlatform, setCashEnabledOnPlatform] = useState(false);

  const saveCardInfo = useMemo(() => {
    const example = formatCurrency(1, tenantCurrency);
    return `We'll save your card securely when you pay. To verify your card, a small temporary charge (e.g. ${example}) may be placed and reversed—this confirms your card for future use.`;
  }, [tenantCurrency]);


  // When Paystack / gift cards / cash are disabled, switch away from that method
  useEffect(() => {
    if (paymentMethod === "card" && !paystackEnabled) {
      setPaymentMethod(giftCardsEnabled ? "giftcard" : cashEnabledOnPlatform ? "cash" : "card");
    } else if (paymentMethod === "giftcard" && !giftCardsEnabled) {
      setPaymentMethod(paystackEnabled ? "card" : cashEnabledOnPlatform ? "cash" : "giftcard");
    } else if (paymentMethod === "cash" && !cashEnabledOnPlatform) {
      setPaymentMethod(paystackEnabled ? "card" : giftCardsEnabled ? "giftcard" : "cash");
    }
  }, [paystackEnabled, giftCardsEnabled, paymentMethod, cashEnabledOnPlatform]);

  // Fetch platform fees only to determine cash availability.
  // Tax and service fee amounts are computed by booking-flow.tsx from the same API and stored in
  // bookingState — we trust those values here to keep fees perfectly consistent across all steps.
  useEffect(() => {
    let cancelled = false;
    fetcher
      .get<{ data?: { cash_enabled_on_platform?: boolean } }>("/api/public/platform-fees")
      .then((res) => {
        if (cancelled) return;
        const d = res?.data as { cash_enabled_on_platform?: boolean } | undefined;
        setCashEnabledOnPlatform(d?.cash_enabled_on_platform === true);
      })
      .catch(() => {
        if (!cancelled) setCashEnabledOnPlatform(false);
      });
    return () => { cancelled = true; };
  }, []);

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

  useEffect(() => {
    if (!bookingState.selectedPackage?.id || !user?.id || !bookingState.providerId) {
      setPackageEntitlements([]);
      if (bookingState.customerPackageEntitlementId) {
        updateBookingState({ customerPackageEntitlementId: undefined });
      }
      return;
    }
    let cancelled = false;
    setPackageEntitlementsLoading(true);
    const q = new URLSearchParams({
      provider_id: bookingState.providerId,
      package_id: bookingState.selectedPackage.id,
    });
    fetcher
      .get<{ data?: { entitlements?: typeof packageEntitlements } }>(`/api/me/package-entitlements?${q}`)
      .then((res) => {
        if (cancelled) return;
        setPackageEntitlements(res?.data?.entitlements ?? []);
      })
      .catch(() => {
        if (!cancelled) setPackageEntitlements([]);
      })
      .finally(() => {
        if (!cancelled) setPackageEntitlementsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, bookingState.providerId, bookingState.selectedPackage?.id, updateBookingState]);

  // Fetch provider online booking settings: tip suggestions, deposit requirements
  useEffect(() => {
    if (!bookingState.providerId) return;
    let cancelled = false;
    fetcher
      .get<{ data?: { tip_suggestions?: number[]; deposit_required?: boolean; deposit_percent?: number | null } }>(
        `/api/public/provider-online-booking-settings?provider_id=${bookingState.providerId}`
      )
      .then((res) => {
        if (cancelled) return;
        const d = res?.data;
        const tips = d?.tip_suggestions;
        setTipSuggestions(Array.isArray(tips) && tips.length > 0 ? tips : [0, 50, 100, 150, 200]);
        if (d?.deposit_required) {
          setProviderRequiresDeposit(true);
          setDepositPercentage(Number(d.deposit_percent ?? 30));
        }
      })
      .catch(() => {
        if (!cancelled) setTipSuggestions([0, 50, 100, 150, 200]);
      });
    return () => { cancelled = true; };
  }, [bookingState.providerId]);

  // True when the user has a saved card selected (not entering a new card).
  // When true we pass payment_method_id to the booking API so the server charges it
  // at the correct deposit amount, avoiding a separate client-side charge.
  const usingSavedCard = paymentMethod === "card" && Boolean(selectedCardId) && !useNewCard && savedCards.length > 0;

  const tipPercentageBase = useMemo(() => getSubtotalAfterDiscounts(bookingState), [bookingState]);

  // Keep tip amount in sync when user chose a % and the subtotal changes (e.g. promo applied earlier)
  useEffect(() => {
    if (tipPercentSelection === null) return;
    if (tipPercentageBase <= 0) {
      setTipAmount(0);
      return;
    }
    setTipAmount(roundTipAmount((tipPercentageBase * tipPercentSelection) / 100));
  }, [tipPercentSelection, tipPercentageBase]);

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
    fetcher.get<{ data: { wallet: { balance: number; currency: string }; transactions: any[] } }>("/api/me/wallet", { cache: "no-store" })
      .then((res) => {
        if (res?.data?.wallet) {
          setWalletBalance(Number(res.data.wallet.balance) || 0);
          setWalletCurrency(res.data.wallet.currency || tenantCurrency);
        } else {
          setWalletCurrency(tenantCurrency);
        }
      })
      .catch(() => {})
      .finally(() => setWalletLoading(false));
  }, [user]);

  // Update booking state when payment options change
  useEffect(() => {
    updateBookingState({
      tipAmount,
      tipPercentSelection,
      paymentMethod,
      paymentOption,
      useWallet,
      saveCard,
      setAsDefault,
    });
  }, [tipAmount, tipPercentSelection, paymentMethod, paymentOption, useWallet, saveCard, setAsDefault]);

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
    tipAmount,
    total: 0,
    currency: bookingState.selectedServices[0]?.currency || tenantCurrency,
  };

  totals.subtotal = totals.services + totals.addons + totals.products + totals.travelFee;
  totals.subtotalAfterDiscounts = getSubtotalAfterDiscounts(bookingState);
  // Fee amounts come from bookingState (set by booking-flow.tsx on mount from /api/public/platform-fees).
  // Do NOT re-estimate here — that would cause fees to appear/change between steps if platform-fees
  // API responds at slightly different times. bookingState is the single source of truth.
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
      products: bookingState.selectedProducts.map(p => {
        // id may be "productUUID" or "productUUID:variantUUID" for variant products
        const colonIdx = p.id.indexOf(":");
        const productId = colonIdx !== -1 ? p.id.slice(0, colonIdx) : p.id;
        const productVariantId = colonIdx !== -1 ? p.id.slice(colonIdx + 1) : null;
        return {
          productId,
          productVariantId: productVariantId || null,
          quantity: p.quantity,
          unitPrice: p.price,
          totalPrice: p.price * p.quantity,
        };
      }),
      package_id: bookingState.selectedPackage?.id || null,
      customer_package_entitlement_id: bookingState.customerPackageEntitlementId || null,
      tip_amount: tipAmount,
      travel_fee: bookingState.address?.travelFee || 0,
      special_requests: bookingState.clientInfo?.specialRequests || null,
      house_call_instructions: bookingState.mode === "mobile" ? (bookingState.clientInfo?.houseCallInstructions || null) : null,
      client_info: bookingState.clientInfo,
      payment_method: paymentMethod,
      payment_option: paymentOption,
      payment_method_id: usingSavedCard ? selectedCardId : null,
      save_card: saveCard,
      set_as_default: setAsDefault,
      promotion_code: bookingState.promotions.couponCode || null,
      gift_card_code: bookingState.promotions.giftCardCode || null,
      membership_plan_id: bookingState.promotions.membershipPlanId || null,
      use_wallet: (bookingState.useWallet ?? false) || (bookingState.promotions.loyaltyPointsUsed ? true : false),
      loyalty_points_used: bookingState.promotions.loyaltyPointsUsed ?? 0,
      hold_id: holdId || null,
      ...(bookingState.mode === "mobile"
        ? {
            availability_travel_buffer_minutes: getTravelBuffer(
              "mobile",
              bookingState.address?.travelTimeMinutes
            ),
          }
        : {}),
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

    const freq = bookingState.recurringFrequency || "weekly";
    if (
      user &&
      bookingState.subscribeRecurring === true &&
      subscribeRecurringEligible({
        subscribe_recurring: { enabled: true, frequency: freq },
        reschedule_booking_id: null,
        is_group_booking: bookingState.isGroupBooking,
        has_group_participants: Boolean(
          bookingState.groupParticipants && bookingState.groupParticipants.length > 0,
        ),
      })
    ) {
      bookingData.subscribe_recurring = { enabled: true, frequency: freq };
    }

    const response = await fetcher.post<{
      data: PublicBookingCreateResult;
    }>("/api/public/bookings", bookingData, {
      // Server often runs validate + create_booking RPC + Paystack init; 10s default aborts before response.
      timeoutMs: 120000,
    });

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

    if (cancellationPolicy && !acceptedCancellationPolicy) {
      toast.error("Please accept the cancellation policy to continue");
      return;
    }

    setIsProcessing(true);
    let bookingResult: PublicBookingCreateResult | null = null;

    const notifyRecurringFromResult = (
      sub?: PublicBookingCreateResult["recurring_subscription"]
    ) => {
      if (!bookingState.subscribeRecurring || !user) return;
      if (sub?.created) {
        toast.success(
          "Repeating schedule saved. Manage it under Account settings → Recurring bookings."
        );
      } else if (sub?.pending) {
        toast.info(
          "Complete payment to save your repeating schedule. It will appear under Account settings → Recurring bookings after payment succeeds."
        );
      } else if (sub && sub.created === false && sub.message) {
        toast.error(sub.message);
      }
    };

    try {
      // Step 1: Create booking draft first
      try {
        bookingResult = await createBookingDraft();
      } catch (error: any) {
        // Handle conflict / availability overlap errors (409) — time slot taken since selection
        const isAvailabilityConflict =
          error.status === 409 ||
          error.code === "CONFLICT" ||
          error.code === "AVAILABILITY_OVERLAP" ||
          /overlap|unavailable|already booked|conflict/i.test(error.message ?? "");
        if (isAvailabilityConflict) {
          toast.error(
            "That time slot was just taken. Please choose another time.",
            { duration: 6000 }
          );
          onNavigateToStep("calendar");
          return;
        }
        
        toast.error(error.message || "Failed to create booking. Please try again.");
        return;
      }

      // Step 2: Process payment based on method
      if (paymentMethod === "cash") {
        // Cash payment - booking already created, just redirect
        const isAtHome = bookingState.mode === "mobile";
        const cashLocationMsg = isAtHome
          ? "Booking confirmed! You'll pay when your provider arrives."
          : "Booking confirmed! You'll pay at the salon.";
        toast.success(cashLocationMsg);
        notifyRecurringFromResult(bookingResult.recurring_subscription);
        router.push(`/booking/confirmation?bookingId=${bookingResult.booking_id}`);
        return;
      }

      if (paymentMethod === "giftcard") {
        // Gift card payment - booking already created, payment processed in backend
        toast.success("Booking created! Payment processed from gift card.");
        notifyRecurringFromResult(bookingResult.recurring_subscription);
        router.push(`/booking/confirmation?bookingId=${bookingResult.booking_id}`);
        return;
      }

      const draftWithUrl = bookingResult;

      // Wallet covered full amount — server returned null payment_url
      if ((bookingState.useWallet ?? false) && (draftWithUrl.payment_url == null || draftWithUrl.payment_url === "")) {
        toast.success("Booking created! Payment processed from wallet.");
        notifyRecurringFromResult(bookingResult.recurring_subscription);
        router.push(`/booking/confirmation?bookingId=${bookingResult.booking_id}`);
        return;
      }

      // Saved card: server charged it directly (payment_method_id was sent); payment_url will be null
      if (usingSavedCard) {
        if (draftWithUrl.payment_url == null || draftWithUrl.payment_url === "") {
          toast.success("Payment successful!");
          notifyRecurringFromResult(bookingResult.recurring_subscription);
          router.push(`/booking/confirmation?bookingId=${bookingResult.booking_id}`);
        } else {
          // Server returned a URL despite saved card — unexpected; fall back to redirect
          toast.info("Redirecting to complete payment…");
          notifyRecurringFromResult(bookingResult.recurring_subscription);
          window.location.href = draftWithUrl.payment_url;
        }
        return;
      }

      // New card / Paystack redirect flow
      if (draftWithUrl.payment_url && draftWithUrl.payment_url.trim() !== "") {
        notifyRecurringFromResult(bookingResult.recurring_subscription);
        window.location.href = draftWithUrl.payment_url;
        return;
      }

      // Fallback: initialize payment client-side if API did not return payment_url
      const depositAmount = Math.ceil((totals.total * depositPercentage) / 100);
      const amountToCharge = paymentOption === "deposit" ? depositAmount : totals.total;
      const freqFallback = bookingState.recurringFrequency || "weekly";
      const paystackFallbackRecurring =
        user &&
        bookingState.subscribeRecurring === true &&
        subscribeRecurringEligible({
          subscribe_recurring: { enabled: true, frequency: freqFallback },
          reschedule_booking_id: null,
          is_group_booking: bookingState.isGroupBooking,
          has_group_participants: Boolean(
            bookingState.groupParticipants && bookingState.groupParticipants.length > 0,
          ),
        });

      const result = await initializePayment({
        email: bookingState.clientInfo.email,
        amount: amountToCharge,
        metadata: {
          bookingId: bookingResult.booking_id,
          bookingNumber: bookingResult.booking_number,
          paymentOption,
          saveCard: saveCard.toString(),
          setAsDefault: setAsDefault.toString(),
          ...(paystackFallbackRecurring ? { subscribe_recurring_frequency: freqFallback } : {}),
        },
      });

      if (result.authorization_url) {
        notifyRecurringFromResult(
          bookingResult.recurring_subscription ??
            (paystackFallbackRecurring ? { created: false, pending: true } : undefined),
        );
        window.location.href = result.authorization_url;
      } else {
        toast.error("Failed to initialize payment");
        toast.info("Booking draft created. You can retry payment from your bookings page.");
      }
    } catch (error: any) {
      const errorMessage = error.message || "Payment initialization failed";
      toast.error(errorMessage);
      
      // If booking draft was created but payment failed, provide retry option
      if (bookingResult) {
        toast.info("Booking draft created. You can retry payment from your bookings page.", {
          action: {
            label: "View Booking",
            onClick: () => router.push(`/booking/confirmation?bookingId=${bookingResult!.booking_id}`),
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
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">
              {bookingState.isGroupBooking ? "Group Booking" : "Services"}
            </h3>
            <button
              type="button"
              onClick={() => onNavigateToStep("services")}
              className="text-sm font-medium text-primary hover:underline"
            >
              Change
            </button>
          </div>
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
          <div className="p-4 bg-gray-50 rounded-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {formatDate(bookingState.selectedDate)}
                </p>
                <p className="text-xs text-gray-600">
                  {formatTime(bookingState.selectedTimeSlot)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToStep("calendar")}
              className="text-sm font-medium text-primary hover:underline shrink-0"
            >
              Change
            </button>
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

        {user && bookingState.selectedPackage?.id && bookingState.providerId && (
          <div className="p-4 bg-amber-50/80 border border-amber-200/80 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-700 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Package credit</p>
                <p className="text-xs text-gray-600">
                  If you bought this package online and have prepaid sessions left, apply one to this booking.
                </p>
              </div>
            </div>
            {packageEntitlementsLoading ? (
              <p className="text-sm text-gray-500">Loading credits…</p>
            ) : packageEntitlements.length > 0 ? (
              <div className="space-y-1">
                <Label htmlFor="package-entitlement" className="text-xs text-gray-600">
                  Use prepaid session
                </Label>
                <select
                  id="package-entitlement"
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={bookingState.customerPackageEntitlementId ?? ""}
                  onChange={(e) =>
                    updateBookingState({
                      customerPackageEntitlementId: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">No — pay with the method below</option>
                  {packageEntitlements.map((e) => (
                    <option key={e.id} value={e.id}>
                      Use credit — {e.sessions_remaining} session(s) left
                      {e.valid_until
                        ? ` (until ${new Date(e.valid_until).toLocaleDateString()})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-gray-500">No prepaid sessions found for this package.</p>
            )}
          </div>
        )}

        {/* Totals */}
        <div className="p-4 bg-gray-50 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Services, add-ons &amp; products</span>
            <span className="font-medium">
              {formatCurrency(totals.services + totals.addons + totals.products, totals.currency)}
            </span>
          </div>
          {totals.travelFee > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Travel fee</span>
              <span>{formatCurrency(totals.travelFee, totals.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs text-gray-500 border-b border-gray-200/80 pb-2">
            <span>Booking subtotal (before discounts)</span>
            <span>{formatCurrency(totals.subtotal, totals.currency)}</span>
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
          {totals.taxAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>
                Tax{totals.taxRate > 0 ? ` (${Number(totals.taxRate).toFixed(2)}%)` : ""}
              </span>
              <span>{formatCurrency(totals.taxAmount, totals.currency)}</span>
            </div>
          )}
          {tipAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-700">
              <span className="flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-primary shrink-0" />
                Tip
              </span>
              <span className="font-medium">{formatCurrency(tipAmount, totals.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold pt-2 border-t">
            <span>{t("booking.total")}</span>
            <span>{formatCurrency(totals.total, totals.currency)}</span>
          </div>

          {/* Wallet split — show breakdown of what wallet covers vs what Paystack charges */}
          {paymentMethod === "card" && useWallet && walletBalance > 0 && (() => {
            const walletApplied = Math.min(walletBalance, totals.total);
            const paystackRemainder = Math.max(0, totals.total - walletApplied);
            return (
              <div className="mt-3 pt-3 border-t border-dashed border-gray-300 space-y-1.5">
                <div className="flex justify-between text-sm text-green-700">
                  <span className="flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" />
                    Wallet credit applied
                  </span>
                  <span className="font-medium">−{formatCurrency(walletApplied, walletCurrency)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-gray-900 bg-gray-100 rounded-lg px-3 py-2">
                  <span>You pay via Paystack</span>
                  <span>{paystackRemainder <= 0 ? formatCurrency(0, totals.currency) : formatCurrency(paystackRemainder, totals.currency)}</span>
                </div>
                {paystackRemainder <= 0 && (
                  <p className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Wallet fully covers this booking — no card charge needed
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Tip — % presets (of subtotal after discounts) + optional fixed amounts from provider */}
      {bookingState.providerId && (
        <div className="p-4 rounded-xl border-2 border-primary/20 bg-gradient-to-br from-white to-pink-50/40 shadow-sm space-y-5">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Heart className="w-5 h-5 text-primary shrink-0" />
            Add a tip (optional)
          </h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            Percentages apply to your <strong>service subtotal after discounts</strong> (before tax and platform fees). They
            update automatically if your booking total changes. 100% of tips go to your provider and are charged with
            your booking total.
          </p>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-900">Tip by percentage</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTipPercentSelection(null);
                  setTipAmount(0);
                }}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-sm font-semibold min-h-[48px] min-w-[72px] transition-colors border-2 flex flex-col items-center justify-center gap-0.5",
                  tipAmount === 0 && tipPercentSelection === null
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white text-gray-800 border-gray-200 hover:border-primary/50"
                )}
              >
                <span>No tip</span>
              </button>
              {TIP_PERCENT_PRESETS.map((p) => {
                const computed =
                  tipPercentageBase > 0 ? roundTipAmount((tipPercentageBase * p) / 100) : 0;
                const selected = tipPercentSelection === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={tipPercentageBase <= 0}
                    onClick={() => setTipPercentSelection(p)}
                    title={
                      tipPercentageBase <= 0
                        ? "Add services to use percentage tips"
                        : `${p}% of ${formatCurrency(tipPercentageBase, totals.currency)}`
                    }
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-sm min-h-[48px] min-w-[76px] transition-colors border-2 flex flex-col items-center justify-center gap-0.5",
                      tipPercentageBase <= 0 && "opacity-50 cursor-not-allowed",
                      selected
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-white text-gray-800 border-gray-200 hover:border-primary/50"
                    )}
                  >
                    <span className="font-bold leading-tight">{p}%</span>
                    <span className={cn("text-[11px] leading-tight", selected ? "text-white/90" : "text-gray-600")}>
                      {tipPercentageBase <= 0 ? "—" : formatCurrency(computed, totals.currency)}
                    </span>
                  </button>
                );
              })}
            </div>
            {tipPercentageBase <= 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Add at least one service to enable percentage-based tips.
              </p>
            )}
          </div>

          {tipSuggestions.some((n) => n > 0) && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900">Or choose a set amount</p>
              <p className="text-xs text-gray-500">Quick amounts from this provider (fixed currency).</p>
              <div className="flex flex-wrap gap-2">
                {tipSuggestions
                  .filter((n) => n > 0)
                  .map((n) => {
                    const selected =
                      tipPercentSelection === null && tipAmount === n && tipSuggestions.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setTipPercentSelection(null);
                          setTipAmount(n);
                        }}
                        className={cn(
                          "rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] transition-colors border-2",
                          selected
                            ? "bg-primary text-white border-primary shadow-sm"
                            : "bg-white text-gray-800 border-gray-200 hover:border-primary/50"
                        )}
                      >
                        {formatCurrency(n, totals.currency)}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="booking-tip-custom" className="text-sm font-medium text-gray-700">
              Custom amount
            </Label>
            <Input
              id="booking-tip-custom"
              type="number"
              min={0}
              step={10}
              placeholder="0"
              className="w-28 h-10 rounded-lg border-2 border-gray-200"
              value={
                tipPercentSelection !== null
                  ? ""
                  : tipAmount > 0 && !tipSuggestions.includes(tipAmount)
                    ? tipAmount
                    : ""
              }
              onChange={(e) => {
                setTipPercentSelection(null);
                setTipAmount(Math.max(0, Number(e.target.value) || 0));
              }}
            />
          </div>
        </div>
      )}

      {/* Payment Method Selection */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Payment Method</h3>
        
        {/* Method toggle: Card / Cash / Gift Card (each gated by feature flags) */}
        <div className={`grid gap-3 ${paystackEnabled && giftCardsEnabled && cashEnabledOnPlatform ? "grid-cols-3" : (paystackEnabled || giftCardsEnabled || cashEnabledOnPlatform) ? "grid-cols-2" : "grid-cols-1"}`}>
          {paystackEnabled && (
            <button
              type="button"
              onClick={() => setPaymentMethod("card")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                paymentMethod === "card"
                  ? "border-primary bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <CreditCard className={`w-5 h-5 ${paymentMethod === "card" ? "text-primary" : "text-gray-500"}`} />
              <span className={`text-sm font-medium ${paymentMethod === "card" ? "text-primary" : "text-gray-700"}`}>Card</span>
              {paymentMethod === "card" && <Check className="w-4 h-4 text-primary" />}
            </button>
          )}
          {cashEnabledOnPlatform && (
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                paymentMethod === "cash"
                  ? "border-primary bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <Banknote className={`w-5 h-5 ${paymentMethod === "cash" ? "text-primary" : "text-gray-500"}`} />
              <span className={`text-sm font-medium ${paymentMethod === "cash" ? "text-primary" : "text-gray-700"}`}>Cash</span>
              {paymentMethod === "cash" && <Check className="w-4 h-4 text-primary" />}
            </button>
          )}
          {giftCardsEnabled && (
            <button
              type="button"
              onClick={() => setPaymentMethod("giftcard")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                paymentMethod === "giftcard"
                  ? "border-primary bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <Gift className={`w-5 h-5 ${paymentMethod === "giftcard" ? "text-primary" : "text-gray-500"}`} />
              <span className={`text-sm font-medium ${paymentMethod === "giftcard" ? "text-primary" : "text-gray-700"}`}>Gift Card</span>
              {paymentMethod === "giftcard" && <Check className="w-4 h-4 text-primary" />}
            </button>
          )}
        </div>

        {/* Use wallet balance (when card selected, user has balance, and wallet feature enabled) */}
        {paymentMethod === "card" && user && walletEnabled && (
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
              <Wallet className="w-4 h-4 text-primary shrink-0" />
            )}
          </div>
        )}

        {/* Deposit vs Full payment option — only when provider accepts deposits */}
        {paymentMethod === "card" && providerRequiresDeposit && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentOption("full")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                paymentOption === "full"
                  ? "border-primary bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              {paymentOption === "full" && <CheckCircle className="w-4 h-4 text-primary" />}
              <span className={`text-sm font-medium ${paymentOption === "full" ? "text-primary" : "text-gray-700"}`}>
                Pay in Full
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentOption("deposit")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                paymentOption === "deposit"
                  ? "border-primary bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              {paymentOption === "deposit" && <CheckCircle className="w-4 h-4 text-primary" />}
              <span className={`text-sm font-medium ${paymentOption === "deposit" ? "text-primary" : "text-gray-700"}`}>
                Deposit ({depositPercentage}%)
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
                              ? "border-primary bg-pink-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          }`}
                        >
                          <div className={`w-10 h-7 rounded-md flex items-center justify-center ${
                            active ? "bg-primary/10" : "bg-gray-100"
                          }`}>
                            <CreditCard className={`w-5 h-5 ${active ? "text-primary" : "text-gray-500"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-semibold ${active ? "text-primary" : "text-gray-900"}`}>
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
                                  className="text-[10px] font-semibold text-primary hover:text-primary-hover underline disabled:opacity-50"
                                >
                                  {settingDefaultId === card.id ? "Updating..." : "Set default"}
                                </button>
                              )}
                            </div>
                            {expiry && (
                              <span className="text-xs text-gray-500">Expires {expiry}</span>
                            )}
                          </div>
                          {active && <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />}
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
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary-hover font-medium transition-colors"
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
                          onClick={() => toast.info(saveCardInfo, { duration: 8000 })}
                          className="p-0.5 rounded-full hover:bg-gray-200 text-primary"
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
        <div
          className={cn(
            "rounded-xl p-5 border-2 transition-all",
            acceptedCancellationPolicy
              ? "border-primary/35 bg-white shadow-sm"
              : "border-amber-400 bg-amber-50/90 shadow-md ring-2 ring-amber-300/70"
          )}
        >
          <div className="flex items-start gap-3 mb-3">
            <div className="rounded-full bg-primary/15 p-2 shrink-0">
              <Shield className="w-6 h-6 text-primary" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900 text-base mb-1">Cancellation Policy</h3>
              <p className="text-sm text-gray-700 leading-relaxed">{cancellationPolicy.policy_text}</p>
            </div>
          </div>
          <div
            className={cn(
              "flex items-start gap-4 rounded-lg p-4 border-2 bg-white",
              acceptedCancellationPolicy ? "border-primary/25" : "border-gray-300"
            )}
          >
            <Checkbox
              id="accept-cancellation-policy"
              checked={acceptedCancellationPolicy}
              onCheckedChange={(checked) => setAcceptedCancellationPolicy(checked === true)}
              className={cn(
                "mt-0.5 shrink-0 h-7 w-7 rounded-md border-2",
                "border-gray-500 data-[state=checked]:bg-primary data-[state=checked]:border-primary",
                "data-[state=unchecked]:bg-white",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              )}
            />
            <Label
              htmlFor="accept-cancellation-policy"
              className="text-sm sm:text-base font-medium text-gray-900 cursor-pointer leading-snug"
            >
              I understand and accept the cancellation policy. I acknowledge that cancellations made within{" "}
              {cancellationPolicy.hours_before_cutoff} hours of my appointment may result in a{" "}
              {cancellationPolicy.late_cancellation_type === "no_refund"
                ? "no refund"
                : cancellationPolicy.late_cancellation_type === "partial_refund"
                  ? "partial refund"
                  : "full refund"}
              .
            </Label>
          </div>
          {!acceptedCancellationPolicy && (
            <p className="mt-3 text-sm font-medium text-amber-900 flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden />
              Check the box above to continue to payment
            </p>
          )}
        </div>
      )}

      {user &&
        !bookingState.isGroupBooking &&
        !(bookingState.groupParticipants && bookingState.groupParticipants.length > 0) && (
          <div className="rounded-xl p-5 border border-gray-200 space-y-3 bg-gray-50/80">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Repeat className="w-4 h-4 text-primary" />
              Repeat this booking
            </h3>
            <p className="text-sm text-gray-600">
              Save the same services on a repeating schedule. If you pay online, the schedule is created after
              payment succeeds. Manage repeats under Account settings → Recurring bookings.
            </p>
            <div className="flex items-start gap-3">
              <Checkbox
                id="booking-flow-subscribe-recurring"
                checked={bookingState.subscribeRecurring === true}
                onCheckedChange={(c) =>
                  updateBookingState({ subscribeRecurring: c === true })
                }
                className="mt-1"
              />
              <div className="space-y-2 flex-1 min-w-0">
                <Label
                  htmlFor="booking-flow-subscribe-recurring"
                  className="text-sm font-medium text-gray-900 cursor-pointer"
                >
                  Turn on repeating visits
                </Label>
                {bookingState.subscribeRecurring === true && (
                  <div className="space-y-1">
                    <Label htmlFor="booking-flow-recurring-freq" className="text-xs text-gray-500">
                      How often
                    </Label>
                    <select
                      id="booking-flow-recurring-freq"
                      value={bookingState.recurringFrequency || "weekly"}
                      onChange={(e) =>
                        updateBookingState({
                          recurringFrequency: e.target.value as "weekly" | "biweekly" | "monthly",
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm min-h-[44px]"
                    >
                      <option value="weekly">Every week</option>
                      <option value="biweekly">Every 2 weeks</option>
                      <option value="monthly">Every month</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Payment Button */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-4 px-4 py-4 safe-area-bottom">
        {(() => {
          const selectedCard = usingSavedCard ? savedCards.find((c) => c.id === selectedCardId) : null;
          const depositAmount = Math.ceil((totals.total * depositPercentage) / 100);
          const chargeAmount = paymentOption === "deposit" ? depositAmount : totals.total;
          
          return (
            <Button
              onClick={handlePayment}
              disabled={isProcessing || isChargingCard || !bookingState.clientInfo || (cancellationPolicy != null && !acceptedCancellationPolicy)}
              className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary-hover disabled:opacity-50 touch-target flex items-center justify-center gap-2"
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
        // Keep booking checkout auth friction low: phone OTP first.
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
