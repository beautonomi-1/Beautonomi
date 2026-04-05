"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_CHECKOUT_START } from "@/lib/analytics/amplitude/types";
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
import { fetcher } from "@/lib/http/fetcher";
import {
  BOOKING_STATE_STORAGE_KEY,
  clearBookingFlowStorage,
  computeBookingFlowKey,
  restoreBookingFlowFromStorage,
  shouldForceFreshStartFromUrl,
} from "./booking-flow-persistence";
import { isCompleteE164 } from "@/lib/phone";

/** Same pattern as step-your-info (Continue gating must match that step). */
const BOOKING_CLIENT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  /** When set, percentage tip buttons stay highlighted after refresh (synced from payment step). */
  tipPercentSelection?: number | null;
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
  /** @deprecated Do not use — step navigation is via `onNavigateToStep` on payment. */
  currentStepIndex?: number;
  clientInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    specialRequests?: string;
    houseCallInstructions?: string;
  } | null;
  /** Repeating schedule after checkout (POST /api/public/bookings subscribe_recurring). */
  subscribeRecurring?: boolean;
  recurringFrequency?: "weekly" | "biweekly" | "monthly";
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

function defaultBookingState(
  user: { full_name?: string | null; email?: string | null; phone?: string | null } | null | undefined
): BookingState {
  return {
    mode: null,
    address: null,
    selectedServices: [],
    selectedAddons: [],
    selectedProducts: [],
    selectedDate: null,
    selectedTimeSlot: null,
    promotions: {},
    clientInfo: user
      ? {
          firstName: user.full_name?.split(" ")[0] || "",
          lastName: user.full_name?.split(" ").slice(1).join(" ") || "",
          email: user.email || "",
          phone: user.phone || "",
        }
      : null,
    subscribeRecurring: false,
    recurringFrequency: "weekly",
  };
}

/** Empty draft while keeping the same entry URL (slug + service + mode) when present. */
function freshBookingStateForUrl(
  user: { full_name?: string | null; email?: string | null; phone?: string | null } | null | undefined,
  searchParams: { get: (k: string) => string | null }
): BookingState {
  const fresh = defaultBookingState(user);
  const providerSlug = searchParams.get("slug") || searchParams.get("partnerId");
  const serviceId = searchParams.get("serviceId") || searchParams.get("service");
  const modeParam = searchParams.get("mode");
  if (providerSlug && serviceId) {
    return {
      ...fresh,
      mode: modeParam ? (modeParam as "salon" | "mobile") : "salon",
    };
  }
  return fresh;
}

export default function BookingFlow() {
  const { user, isLoading: _authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { track, isReady } = useAmplitude();
  const checkoutTrackedRef = useRef(false);
  const prevFlowKeyRef = useRef<string | null>(null);
  const [direction, setDirection] = useState(0);

  const [currentStepIndex, setCurrentStepIndex] = useState(() => {
    if (typeof window === "undefined") return 0;
    if (shouldForceFreshStartFromUrl()) {
      clearBookingFlowStorage();
      return 0;
    }
    const fk = computeBookingFlowKey(searchParams);
    const r = restoreBookingFlowFromStorage(searchParams, fk);
    return r?.stepIndex ?? 0;
  });

  const [bookingState, setBookingState] = useState<BookingState>(() => {
    if (typeof window === "undefined") {
      return defaultBookingState(null);
    }
    if (shouldForceFreshStartFromUrl()) {
      clearBookingFlowStorage();
      return freshBookingStateForUrl(user, searchParams);
    }
    const fk = computeBookingFlowKey(searchParams);
    const r = restoreBookingFlowFromStorage(searchParams, fk);
    if (r) return r.state;
    return defaultBookingState(user);
  });

  // Persist draft + step + URL fingerprint so refresh resumes checkout and tip UI can sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (bookingState.selectedServices.length === 0) return;
    try {
      const flowKey = computeBookingFlowKey(searchParams);
      localStorage.setItem(
        BOOKING_STATE_STORAGE_KEY,
        JSON.stringify({
          state: bookingState,
          timestamp: Date.now(),
          flowKey,
          stepIndex: currentStepIndex,
        })
      );
    } catch (e) {
      console.warn("Failed to save booking state:", e);
    }
  }, [bookingState, currentStepIndex, searchParams]);

  const applyFreshBookingStart = useCallback(() => {
    clearBookingFlowStorage();
    setCurrentStepIndex(0);
    setDirection(0);
    checkoutTrackedRef.current = false;
    setBookingState(freshBookingStateForUrl(user, searchParams));
    prevFlowKeyRef.current = computeBookingFlowKey(searchParams);
  }, [user, searchParams]);

  // ?reset=1 — shareable “start over” link; reset React state then remove the param.
  useEffect(() => {
    if (searchParams.get("reset") !== "1") return;
    applyFreshBookingStart();
    const u = new URLSearchParams(searchParams.toString());
    u.delete("reset");
    const q = u.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, applyFreshBookingStart]);

  const handleStartOver = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Discard this booking and start over? Your selections and add-ons will be cleared."
      )
    ) {
      return;
    }
    applyFreshBookingStart();
  }, [applyFreshBookingStart]);

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

  useEffect(() => {
    if (isReady && currentStep === "payment" && !checkoutTrackedRef.current) {
      checkoutTrackedRef.current = true;
      track(EVENT_CHECKOUT_START, { provider_id: bookingState.providerId });
    }
  }, [isReady, currentStep, bookingState.providerId, track]);

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

  // Membership discount is applied server-side from provider membership plans (user_memberships) in validate-booking
  const membershipDiscountPercent = 0;

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
          // If provider opted out of search engine indexing, inject a noindex meta into this page
          if (data.data?.seo_indexable === false) {
            let robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
            if (!robotsMeta) {
              robotsMeta = document.createElement("meta");
              robotsMeta.name = "robots";
              document.head.appendChild(robotsMeta);
            }
            robotsMeta.content = "noindex, nofollow";
          }
        } catch (error) {
          console.error("Error loading provider ID:", error);
        }
      };
      loadProviderId();
    }
     
  }, [searchParams, bookingState.providerId]);

  // When slug / serviceId / mode in the URL changes, treat as a new booking entry and restart at step 0.
  useEffect(() => {
    const fk = computeBookingFlowKey(searchParams);
    if (prevFlowKeyRef.current === null) {
      prevFlowKeyRef.current = fk;
      return;
    }
    if (fk !== prevFlowKeyRef.current) {
      prevFlowKeyRef.current = fk;
      setCurrentStepIndex(0);
    }
  }, [searchParams]);

  // Load pre-selected service from URL (mode only — step is driven by persistence + flowKey effect above)
  useEffect(() => {
    const rawService = searchParams.get("serviceId") || searchParams.get("service");
    const providerSlug = searchParams.get("slug") || searchParams.get("partnerId");
    const modeParam = searchParams.get("mode"); // Optional mode from URL

    if (rawService && providerSlug) {
      if (!bookingState.mode) {
        const mode = modeParam ? (modeParam as "salon" | "mobile") : "salon";
        updateBookingState({ mode });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const effectiveStepOrder = useMemo((): BookingStep[] => {
    const steps = [...STEP_ORDER];
    if (user && bookingState.clientInfo) {
      const index = steps.indexOf("yourInfo");
      if (index > -1) steps.splice(index, 1);
    }
    if (!bookingState.isGroupBooking) {
      const index = steps.indexOf("groupParticipants");
      if (index > -1) steps.splice(index, 1);
    }
    return steps;
  }, [user, bookingState.clientInfo, bookingState.isGroupBooking]);

  const effectiveStepIndex = effectiveStepOrder.indexOf(currentStep);
  const progressStepIndex = effectiveStepIndex < 0 ? 0 : effectiveStepIndex;

  useLayoutEffect(() => {
    if (effectiveStepOrder.indexOf(currentStep) >= 0) return;
    const fallback = STEP_ORDER.find(
      (s) =>
        STEP_ORDER.indexOf(s) >= currentStepIndex && effectiveStepOrder.includes(s)
    );
    if (fallback) setCurrentStepIndex(STEP_ORDER.indexOf(fallback));
  }, [currentStep, currentStepIndex, effectiveStepOrder]);

  const handleNext = () => {
    if (effectiveStepIndex < effectiveStepOrder.length - 1) {
      setDirection(1);
      const nextStep = effectiveStepOrder[effectiveStepIndex + 1];
      const nextIndex = STEP_ORDER.indexOf(nextStep);
      setCurrentStepIndex(nextIndex);
    }
  };

  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;

  /** Navigate to a step by STEP_ORDER index (e.g. 0 = services, 4 = calendar). Do not persist in bookingState — avoids sync loops. */
  const navigateToBookingStep = useCallback((stepIndex: number) => {
    setCurrentStepIndex(Math.max(0, Math.min(STEP_ORDER.length - 1, stepIndex)));
  }, []);

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

  /** Apply `?package=` bundle metadata when selected services match the package definition (legacy `/booking` flow). */
  useEffect(() => {
    const pkgId = searchParams.get("package")?.trim();
    const slug = searchParams.get("slug") || searchParams.get("partnerId");
    if (!pkgId || !slug || bookingState.selectedServices.length === 0) return;
    if (bookingState.selectedPackage?.id === pkgId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data?: unknown } | unknown[]>(
          `/api/public/providers/${encodeURIComponent(slug)}/packages`
        );
        const raw = (res as { data?: unknown }).data ?? res;
        const list = Array.isArray(raw) ? raw : [];
        type Pkg = {
          id: string;
          name?: string;
          title?: string;
          price?: number;
          discount_percentage?: number;
          services?: Array<{ id: string }>;
          items?: Array<{ id?: string; type?: string }>;
        };
        const pkg = (list as Pkg[]).find((p) => p.id === pkgId);
        if (!pkg || cancelled) return;
        const svcItems =
          pkg.services && pkg.services.length > 0
            ? pkg.services
            : (pkg.items ?? []).filter((x) => x.type === "service" || !x.type);
        const wantIds = new Set(svcItems.map((s) => s.id).filter(Boolean) as string[]);
        if (wantIds.size === 0) return;
        const gotIds = new Set(bookingState.selectedServices.map((s) => s.id));
        if (wantIds.size !== gotIds.size) return;
        for (const w of wantIds) {
          if (!gotIds.has(w)) return;
        }
        const servicesTotal = bookingState.selectedServices.reduce((sum, s) => sum + s.price, 0);
        const discount =
          typeof pkg.price === "number" && pkg.price < servicesTotal
            ? servicesTotal - pkg.price
            : pkg.discount_percentage
              ? (servicesTotal * pkg.discount_percentage) / 100
              : 0;
        updateBookingState({
          selectedPackage: {
            id: pkg.id,
            title: pkg.title || pkg.name || "Package",
            price: pkg.price ?? Math.max(0, servicesTotal - discount),
            discount,
          },
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, bookingState.selectedServices, bookingState.selectedPackage?.id]);

  /** Skip the packages step when the URL package is already applied (same UX as empty packages list). */
  useEffect(() => {
    if (currentStep !== "packages") return;
    const pkgId = searchParams.get("package")?.trim();
    if (!pkgId || bookingState.selectedPackage?.id !== pkgId) return;
    const t = setTimeout(() => {
      handleNextRef.current();
    }, 80);
    return () => clearTimeout(t);
  }, [currentStep, searchParams, bookingState.selectedPackage?.id]);

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
      case "yourInfo": {
        const c = bookingState.clientInfo;
        if (!c) return false;
        return (
          c.firstName.trim() !== "" &&
          c.lastName.trim() !== "" &&
          BOOKING_CLIENT_EMAIL_REGEX.test(c.email.trim()) &&
          isCompleteE164(c.phone)
        );
      }
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
            onClick={() => {
              clearBookingFlowStorage();
              router.push("/");
            }}
            className="p-2 -mr-2 rounded-full hover:bg-gray-100 transition-colors touch-target"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {/* Progress Indicator */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2">
            {effectiveStepOrder.map((step, index) => {
              // Show step as completed if we've passed it
              const isCompleted = index < progressStepIndex;
              const isCurrent = index === progressStepIndex;
              
              return (
                <div
                  key={step}
                  className={`flex-1 h-1 rounded-full transition-colors ${
                    isCompleted || isCurrent
                      ? "bg-primary"
                      : "bg-gray-200"
                  }`}
                  aria-label={`Step ${index + 1} of ${effectiveStepOrder.length}: ${step}`}
                  aria-current={isCurrent ? "step" : undefined}
                />
              );
            })}
          </div>
          <div className="text-xs text-gray-500 mt-1 text-center">
            Step {progressStepIndex + 1} of {effectiveStepOrder.length}
          </div>
          <div className="flex justify-center mt-2">
            <button
              type="button"
              onClick={handleStartOver}
              className="text-xs font-medium text-gray-500 hover:text-gray-800 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-700"
            >
              Start over
            </button>
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
                  onNavigateToStep={navigateToBookingStep}
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
