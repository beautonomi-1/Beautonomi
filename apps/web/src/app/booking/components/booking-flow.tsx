"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import StepVenueChoice from "./steps/step-venue-choice";
import StepServiceSelection from "./steps/step-service-selection";
import StepGroupParticipants from "./steps/step-group-participants";
import StepPackages from "./steps/step-packages";
import StepCalendar from "./steps/step-calendar";
import StepPromotions from "./steps/step-promotions";
import StepYourInfo from "./steps/step-your-info";
import StepPayment from "./steps/step-payment";
import BookingActionBar from "./booking-action-bar";
import { ChevronLeft, X } from "lucide-react";

export type BookingMode = "salon" | "mobile";
export type BookingStep = "services" | "groupParticipants" | "venue" | "packages" | "calendar" | "promotions" | "yourInfo" | "payment";

export interface BookingState {
  mode: BookingMode | null;
  address: {
    id?: string;
    fullAddress: string;
    zoneId?: string;
    travelFee?: number;
    distanceKm?: number;
    travelTimeMinutes?: number;
    breakdown?: Array<{ label: string; amount: number }>;
    coordinates?: { lat: number; lng: number };
    structuredAddress?: {
      line1: string;
      city: string;
      country: string;
      postalCode?: string;
    };
    // House call specific fields
    apartmentUnit?: string;
    buildingName?: string;
    floorNumber?: string;
    accessCodes?: {
      gate?: string;
      buzzer?: string;
      door?: string;
    };
    parkingInstructions?: string;
    locationLandmarks?: string;
  } | null;
  selectedServices: Array<{
    id: string;
    title: string;
    duration: number;
    price: number;
    currency: string;
    staffId?: string;
    staffName?: string;
    baseServiceId?: string;
  }>;
  selectedAddons: Array<{
    id: string;
    title: string;
    price: number;
    duration: number;
  }>;
  selectedProducts: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    currency: string;
  }>;
  selectedDate: Date | null;
  selectedTimeSlot: string | null;
  promotions: {
    couponCode?: string;
    couponDiscount?: number;
    giftCardCode?: string;
    giftCardAmount?: number;
    loyaltyPointsUsed?: number;
    loyaltyDiscount?: number;
    membershipDiscount?: number;
    membershipPlanId?: string;
  };
  selectedPackage?: {
    id: string;
    title: string;
    price: number;
    discount: number;
  };
  selectedLocationId?: string;
  paymentMethod?: "card" | "cash" | "giftcard";
  paymentOption?: "deposit" | "full";
  useWallet?: boolean;
  saveCard?: boolean;
  setAsDefault?: boolean;
  serviceFeeAmount?: number;
  serviceFeePercentage?: number;
  taxAmount?: number;
  taxRate?: number;
  tipAmount?: number;
  providerId?: string;
  isGroupBooking?: boolean;
  groupParticipants?: Array<{
    id: string;
    name: string;
    email?: string;
    phone?: string;
    serviceIds: string[];
    notes?: string;
  }>;
  currentStepIndex?: number; // Used by step-payment to navigate back on conflict
  clientInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    specialRequests?: string;
    houseCallInstructions?: string;
  } | null;
}

const STEP_ORDER: BookingStep[] = ["services", "groupParticipants", "venue", "packages", "calendar", "promotions", "yourInfo", "payment"];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0,
  }),
};

export default function BookingFlow() {
  const { user, isLoading: _authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  
  // Restore booking state from localStorage if available (e.g., after OAuth redirect)
  const getInitialBookingState = (): BookingState => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('booking_state');
        if (saved) {
          const parsed = JSON.parse(saved);
          // Only restore if it's recent (within 1 hour)
          if (parsed.timestamp && Date.now() - parsed.timestamp < 3600000) {
            return parsed.state;
          }
        }
      } catch (e) {
        console.warn('Failed to restore booking state:', e);
      }
    }
    
    return {
      mode: null,
      address: null,
      selectedServices: [],
      selectedAddons: [],
      selectedProducts: [],
      selectedDate: null,
      selectedTimeSlot: null,
      promotions: {},
      clientInfo: user ? {
        firstName: user.full_name?.split(" ")[0] || "",
        lastName: user.full_name?.split(" ").slice(1).join(" ") || "",
        email: user.email || "",
        phone: user.phone || "",
      } : null,
    };
  };
  
  const [bookingState, setBookingState] = useState<BookingState>(getInitialBookingState);
  
  // Save booking state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && bookingState.selectedServices.length > 0) {
      try {
        localStorage.setItem('booking_state', JSON.stringify({
          state: bookingState,
          timestamp: Date.now(),
        }));
      } catch (e) {
        console.warn('Failed to save booking state:', e);
      }
    }
  }, [bookingState]);
  
  // Clear saved state after successful booking
  const _clearSavedState = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('booking_state');
      localStorage.removeItem('booking_redirect_state');
    }
  };

  const currentStep = STEP_ORDER[currentStepIndex];
  const [platformFeeSettings, setPlatformFeeSettings] = useState<{
    platform_service_fee_type: "percentage" | "fixed";
    platform_service_fee_percentage: number;
    platform_service_fee_fixed: number;
    show_service_fee_to_customer: boolean;
  } | null>(null);
  
  // Debug logging
  useEffect(() => {
    console.log(`[Booking Flow] Current step: ${currentStep} (index: ${currentStepIndex})`);
  }, [currentStep, currentStepIndex]);

  // Load platform fee settings
  useEffect(() => {
    const loadPlatformFeeSettings = async () => {
      try {
        const response = await fetch("/api/public/platform-fees");
        const data = await response.json();
        if (data.data) {
          setPlatformFeeSettings(data.data);
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
    loadPlatformFeeSettings();
  }, []);

  // Store membership discount percent
  const [membershipDiscountPercent, setMembershipDiscountPercent] = useState(0);

  // Fetch membership discount percent when provider is loaded
  useEffect(() => {
    if (!user?.id || !bookingState.providerId) {
      setMembershipDiscountPercent(0);
      return;
    }

    const fetchMembership = async () => {
      try {
        const response = await fetch(`/api/me/membership?provider_id=${bookingState.providerId}`);
        const data = await response.json();
        if (data.active && data.discount_percent > 0) {
          setMembershipDiscountPercent(data.discount_percent);
          updateBookingState({
            promotions: {
              ...bookingState.promotions,
              membershipPlanId: data.plan_id,
            },
          });
        } else {
          setMembershipDiscountPercent(0);
        }
      } catch (error) {
        console.error("Error fetching membership:", error);
        setMembershipDiscountPercent(0);
      }
    };

    fetchMembership();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, bookingState.providerId]);

  // Calculate membership discount, tax, and platform service fee whenever relevant values change
  useEffect(() => {
    if (!platformFeeSettings) return;

    const subtotal =
      bookingState.selectedServices.reduce((sum, s) => sum + s.price, 0) +
      bookingState.selectedAddons.reduce((sum, a) => sum + a.price, 0) +
      bookingState.selectedProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0) +
      (bookingState.address?.travelFee || 0);

    const otherDiscounts =
      (bookingState.promotions.couponDiscount || 0) +
      (bookingState.promotions.giftCardAmount || 0) +
      (bookingState.promotions.loyaltyDiscount || 0);

    const subtotalAfterOtherDiscounts = Math.max(0, subtotal - otherDiscounts);

    // Calculate membership discount (applied on subtotal after other discounts)
    const membershipDiscount =
      membershipDiscountPercent > 0
        ? Math.min((subtotalAfterOtherDiscounts * membershipDiscountPercent) / 100, subtotalAfterOtherDiscounts)
        : 0;

    const allDiscounts = otherDiscounts + membershipDiscount;
    const subtotalAfterDiscounts = Math.max(0, subtotal - allDiscounts);

    // Calculate tax (on subtotal after all discounts)
    const taxRate = bookingState.taxRate || 0;
    const taxAmount = taxRate > 0 ? Number(((subtotalAfterDiscounts * taxRate) / 100).toFixed(2)) : 0;

    // Calculate customer service fee (on subtotal after all discounts)
    const serviceFeeAmount =
      platformFeeSettings.platform_service_fee_type === "percentage"
        ? Number(((subtotalAfterDiscounts * platformFeeSettings.platform_service_fee_percentage) / 100).toFixed(2))
        : platformFeeSettings.platform_service_fee_fixed;
    
    const serviceFeePercentage = platformFeeSettings.platform_service_fee_type === "percentage"
      ? platformFeeSettings.platform_service_fee_percentage
      : 0;

    setBookingState((prev) => ({
      ...prev,
      promotions: {
        ...prev.promotions,
        membershipDiscount,
      },
      taxAmount,
      serviceFeeAmount: platformFeeSettings.show_service_fee_to_customer ? serviceFeeAmount : 0,
      serviceFeePercentage: platformFeeSettings.show_service_fee_to_customer ? serviceFeePercentage : 0,
    }));
  }, [
    bookingState.selectedServices,
    bookingState.selectedAddons,
    bookingState.selectedProducts,
    bookingState.address?.travelFee,
    bookingState.promotions.couponDiscount,
    bookingState.promotions.giftCardAmount,
    bookingState.promotions.loyaltyDiscount,
    membershipDiscountPercent,
    bookingState.taxRate,
    platformFeeSettings,
  ]);

  // Load provider ID from slug
  useEffect(() => {
    const providerSlug = searchParams.get("slug") || searchParams.get("partnerId");
    if (providerSlug && !bookingState.providerId) {
      const loadProviderId = async () => {
        try {
          const response = await fetch(`/api/public/providers/${encodeURIComponent(providerSlug)}`);
          const data = await response.json();
          if (data.data?.id) {
            updateBookingState({ providerId: data.data.id });
          }
        } catch (error) {
          console.error("Error loading provider ID:", error);
        }
      };
      loadProviderId();
    }
     
  }, [searchParams, bookingState.providerId]);

  // Load pre-selected service from URL
  useEffect(() => {
    const serviceId = searchParams.get("serviceId");
    const serviceParam = searchParams.get("service"); // Legacy support
    const providerSlug = searchParams.get("slug") || searchParams.get("partnerId");
    const modeParam = searchParams.get("mode"); // Optional mode from URL
    
    if (serviceId && providerSlug) {
      // Pre-select service - will be handled in service selection step
      // Set default mode if not provided (default to salon)
      if (!bookingState.mode) {
        const mode = modeParam ? (modeParam as "salon" | "mobile") : "salon";
        updateBookingState({ mode });
        console.log(`[Booking Flow] Setting default mode to: ${mode}`);
      }
      // Services is now step 0, so we stay at step 0 when service is pre-selected
      setCurrentStepIndex(0); // Start at services step (now first step)
      console.log(`[Booking Flow] Starting at services step with serviceId: ${serviceId}`);
    } else if (serviceParam && providerSlug) {
      // Legacy format support - parse JSON service data
      try {
        const _serviceData = JSON.parse(decodeURIComponent(serviceParam));
        // Set default mode if not provided
        if (!bookingState.mode) {
          const mode = modeParam ? (modeParam as "salon" | "mobile") : "salon";
          updateBookingState({ mode });
        }
        // Pre-select will be handled in service selection step
        setCurrentStepIndex(0); // Start at services step (now first step)
      } catch (error) {
        console.error("Error parsing service data:", error);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Get effective step order (skip yourInfo if user is logged in, skip groupParticipants if not group booking)
  const getEffectiveStepOrder = (): BookingStep[] => {
    const steps = [...STEP_ORDER];
    // Skip "yourInfo" step if user is logged in and has complete info
    if (user && bookingState.clientInfo) {
      const index = steps.indexOf("yourInfo");
      if (index > -1) steps.splice(index, 1);
    }
    // Skip "groupParticipants" step if not group booking
    if (!bookingState.isGroupBooking) {
      const index = steps.indexOf("groupParticipants");
      if (index > -1) steps.splice(index, 1);
    }
    return steps;
  };

  const effectiveStepOrder = getEffectiveStepOrder();
  const effectiveStepIndex = effectiveStepOrder.indexOf(currentStep);
  
  const handleNext = () => {
    if (effectiveStepIndex < effectiveStepOrder.length - 1) {
      setDirection(1);
      const nextStep = effectiveStepOrder[effectiveStepIndex + 1];
      const nextIndex = STEP_ORDER.indexOf(nextStep);
      setCurrentStepIndex(nextIndex);
    }
  };

  const handleBack = () => {
    if (effectiveStepIndex > 0) {
      setDirection(-1);
      const prevStep = effectiveStepOrder[effectiveStepIndex - 1];
      const prevIndex = STEP_ORDER.indexOf(prevStep);
      setCurrentStepIndex(prevIndex);
    } else {
      router.back();
    }
  };

  const updateBookingState = (updates: Partial<BookingState>) => {
    setBookingState((prev) => ({ ...prev, ...updates }));
  };

  // Sync step when step-payment sets currentStepIndex on conflict (go back to calendar)
  useEffect(() => {
    if (typeof bookingState.currentStepIndex === 'number' && bookingState.currentStepIndex !== currentStepIndex) {
      setCurrentStepIndex(bookingState.currentStepIndex);
    }
  }, [bookingState.currentStepIndex, currentStepIndex]);

  const canProceed = () => {
    switch (currentStep) {
      case "services":
        // Must have at least one service selected
        if (bookingState.selectedServices.length === 0) return false;
        // Every service must have a staff member assigned
        // This is required because availability is staff-specific
        const allServicesHaveStaff = bookingState.selectedServices.every(
          (service) => service.staffId && service.staffId.trim() !== ""
        );
        if (!allServicesHaveStaff) return false;
        return true;
      case "groupParticipants":
        // If group booking is enabled, must have at least one participant with services
        if (bookingState.isGroupBooking) {
          return bookingState.groupParticipants && 
                 bookingState.groupParticipants.length > 0 &&
                 bookingState.groupParticipants.some(p => p.serviceIds.length > 0);
        }
        return true; // Skip if not group booking
      case "venue":
        if (bookingState.mode === null) return false;
        if (bookingState.mode === "salon") {
          // For salon, location_id is required by API, but we allow proceeding if locations haven't loaded yet
          // The actual validation happens in payment step
          return true;
        }
        // For mobile, address is required
        return bookingState.address !== null;
      case "packages":
        return true; // Optional step
      case "calendar":
        return bookingState.selectedDate !== null && bookingState.selectedTimeSlot !== null;
      case "promotions":
        return true; // Optional step
      case "yourInfo":
        return bookingState.clientInfo !== null &&
               bookingState.clientInfo.firstName.trim() !== "" &&
               bookingState.clientInfo.lastName.trim() !== "" &&
               bookingState.clientInfo.email.trim() !== "" &&
               bookingState.clientInfo.phone.trim() !== "";
      case "payment":
        return bookingState.paymentMethod !== undefined;
      default:
        return false;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case "services":
        return "Select Services";
      case "groupParticipants":
        return "Add Participants";
      case "venue":
        return "How would you like your service?";
      case "packages":
        return "Select Package";
      case "calendar":
        return "Choose Date & Time";
      case "promotions":
        return "Promotions & Rewards";
      case "yourInfo":
        return "Your Information";
      case "payment":
        return "Review & Pay";
      default:
        return "Booking";
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col safe-area-inset">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 safe-area-top">
        <div className="flex items-center justify-between px-4 py-3 h-14">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors touch-target"
            aria-label="Go back"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">{getStepTitle()}</h1>
          <button
            onClick={() => router.push("/")}
            className="p-2 -mr-2 rounded-full hover:bg-gray-100 transition-colors touch-target"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {/* Progress Indicator */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2">
            {getEffectiveStepOrder().map((step, index) => {
              // Show step as completed if we've passed it
              const isCompleted = index < effectiveStepIndex;
              const isCurrent = index === effectiveStepIndex;
              
              return (
                <div
                  key={step}
                  className={`flex-1 h-1 rounded-full transition-colors ${
                    isCompleted || isCurrent
                      ? "bg-[#FF0077]"
                      : "bg-gray-200"
                  }`}
                  aria-label={`Step ${index + 1} of ${getEffectiveStepOrder().length}: ${step}`}
                  aria-current={isCurrent ? "step" : undefined}
                />
              );
            })}
          </div>
          <div className="text-xs text-gray-500 mt-1 text-center">
            Step {effectiveStepIndex + 1} of {getEffectiveStepOrder().length}
          </div>
        </div>
      </header>

      {/* Step Content */}
      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="absolute inset-0 overflow-y-auto"
          >
            <div className="min-h-full pb-32">
              {currentStep === "services" ? (
                <StepServiceSelection
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNext={handleNext}
                  providerSlug={searchParams.get("slug") || searchParams.get("partnerId") || ""}
                />
              ) : currentStep === "groupParticipants" ? (
                <StepGroupParticipants
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNext={handleNext}
                  providerSlug={searchParams.get("slug") || searchParams.get("partnerId") || ""}
                  maxGroupSize={10} // Will be fetched from API in the component
                  availableServices={bookingState.selectedServices.map(s => ({
                    id: s.id,
                    title: s.title,
                    price: s.price,
                    duration: s.duration,
                  }))}
                />
              ) : currentStep === "venue" ? (
                <StepVenueChoice
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNext={handleNext}
                  providerSlug={searchParams.get("slug") || searchParams.get("partnerId") || ""}
                />
              ) : currentStep === "packages" ? (
                <StepPackages
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNext={handleNext}
                  providerSlug={searchParams.get("slug") || searchParams.get("partnerId") || ""}
                />
              ) : currentStep === "calendar" ? (
                <StepCalendar
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNext={handleNext}
                  providerSlug={searchParams.get("slug") || searchParams.get("partnerId") || ""}
                />
              ) : currentStep === "promotions" ? (
                <StepPromotions
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNext={handleNext}
                />
              ) : currentStep === "yourInfo" ? (
                <StepYourInfo
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNext={handleNext}
                />
              ) : currentStep === "payment" ? (
                <StepPayment
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                />
              ) : (
                <div className="p-8 text-center text-gray-500">
                  Unknown step: {currentStep}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Sticky Action Bar */}
      <BookingActionBar
        bookingState={bookingState}
        currentStep={currentStep}
        canProceed={canProceed() ?? false}
        onNext={handleNext}
        onBack={handleBack}
      />
    </div>
  );
}
