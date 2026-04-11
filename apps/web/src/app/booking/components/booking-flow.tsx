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
import {
  buildRetailCartRowsFromPublicPackage,
  cartMatchesPublicCatalogPackage,
  flattenProviderServicesToMenu,
  resolvePackageOfferingsFromFlatMenu,
  type ProviderServiceLike,
  type PublicProductCatalogRow,
} from "@beautonomi/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
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
    /** Turnover after this offering (`offerings.buffer_minutes`); used for slot span parity with validate-booking. */
    bufferMinutes?: number;
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
  /** When set with selectedPackage, redeems one prepaid session from this entitlement (see validateBooking). */
  customerPackageEntitlementId?: string | null;
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
  /** Slot hold ID reserved when leaving the calendar step — passed to booking creation to exclude from conflict check. */
  holdId?: string | null;
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
  /** When false and no URL/deeplink package, the packages step is omitted (empty catalog). */
  const [providerHasPackages, setProviderHasPackages] = useState<boolean | null>(null);
  /** Dedupe `?package=` deep-link prefill (per flow key + package id). */
  const packagePrefillDoneKeyRef = useRef<string | null>(null);

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

  /** Direct service/product deep links skip “packages first” — user chose a specific offering or retail item. */
  const serviceDirect = Boolean(
    searchParams.get("serviceId")?.trim() || searchParams.get("service")?.trim()
  );
  const productDirect = Boolean(
    searchParams.get("product_id")?.trim() || searchParams.get("product")?.trim()
  );

  /**
   * When `?package=` / `?package_id=` only (no direct service/product), packages step is first.
   * If customer came via `?service=` / `?product_id=` etc., stay on canonical order and omit the packages step
   * from this array so indices align with `effectiveStepOrder` (next/back never land on a ghost packages step).
   */
  const activeStepOrder = useMemo((): BookingStep[] => {
    const pkgPinned = Boolean(
      searchParams.get("package")?.trim() || searchParams.get("package_id")?.trim()
    );
    let steps: BookingStep[];
    if (!pkgPinned || serviceDirect || productDirect) {
      steps = [...STEP_ORDER];
    } else {
      const rest = STEP_ORDER.filter((s) => s !== "packages");
      const at = rest.indexOf("services");
      if (at >= 0) {
        steps = [...rest];
        steps.splice(at, 0, "packages");
      } else {
        steps = ["packages", ...rest] as BookingStep[];
      }
    }
    if (serviceDirect || productDirect) {
      const ix = steps.indexOf("packages");
      if (ix > -1) steps.splice(ix, 1);
    }
    return steps;
  }, [searchParams, serviceDirect, productDirect]);

  useEffect(() => {
    setCurrentStepIndex((i) => Math.max(0, Math.min(i, activeStepOrder.length - 1)));
  }, [activeStepOrder.length]);

  const currentStep = activeStepOrder[currentStepIndex] ?? STEP_ORDER[0];
  const [platformFeeSettings, setPlatformFeeSettings] = useState<{
    platform_service_fee_type: "percentage" | "fixed";
    platform_service_fee_percentage: number;
    platform_service_fee_fixed: number;
    show_service_fee_to_customer: boolean;
  } | null>(null);
  
  useEffect(() => {
    if (isReady && currentStep === "payment" && !checkoutTrackedRef.current) {
      checkoutTrackedRef.current = true;
      track(EVENT_CHECKOUT_START, { provider_id: bookingState.providerId });
    }
  }, [isReady, currentStep, bookingState.providerId, track]);

  useEffect(() => {
    const slug = searchParams.get("slug") || searchParams.get("partnerId");
    if (!slug) {
      setProviderHasPackages(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/public/providers/${encodeURIComponent(slug)}/packages`)
      .then((r) => r.json())
      .then((j: { data?: unknown }) => {
        const list = Array.isArray(j?.data) ? j.data : [];
        if (!cancelled) setProviderHasPackages(list.length > 0);
      })
      .catch(() => {
        if (!cancelled) setProviderHasPackages(true);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Load effective platform fee settings for this provider.
  // Pass provider_id so the API mirrors validate-booking priority:
  // provider customer_fee_config → platform_settings.payouts fallback.
  // Re-fetch when providerId is known so fee preview always matches what the server will charge.
  useEffect(() => {
    const loadPlatformFeeSettings = async () => {
      try {
        const url = bookingState.providerId
          ? `/api/public/platform-fees?provider_id=${encodeURIComponent(bookingState.providerId)}`
          : "/api/public/platform-fees";
        const response = await fetch(url);
        const data = await response.json();
        if (data.data) {
          setPlatformFeeSettings(data.data);
        }
      } catch (error) {
        console.error("Error loading platform fee settings:", error);
        setPlatformFeeSettings({
          platform_service_fee_type: "fixed",
          platform_service_fee_percentage: 0,
          platform_service_fee_fixed: 0,
          show_service_fee_to_customer: true,
        });
      }
    };
    void loadPlatformFeeSettings();
  }, [bookingState.providerId]);

  // Membership discount is applied server-side from provider membership plans (user_memberships) in validate-booking
  const membershipDiscountPercent = 0;

  // Calculate membership discount, tax, and platform service fee whenever relevant values change
  useEffect(() => {
    if (!platformFeeSettings) return;

    let servicesTotal = 0;
    if (bookingState.isGroupBooking && bookingState.groupParticipants?.length) {
      servicesTotal = bookingState.groupParticipants.reduce((total, participant) => {
        const participantTotal = participant.serviceIds.reduce((sum, serviceId) => {
          const service = bookingState.selectedServices.find((s) => s.id === serviceId);
          return sum + (service?.price || 0);
        }, 0);
        return total + participantTotal;
      }, 0);
    } else {
      servicesTotal = bookingState.selectedServices.reduce((sum, s) => sum + s.price, 0);
    }

    const subtotal =
      servicesTotal +
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
            updateBookingState({
              providerId: data.data.id,
              taxRate: data.data.tax_rate_percent != null ? Number(data.data.tax_rate_percent) : 0,
            });
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
    const steps = [...activeStepOrder];
    if (user && bookingState.clientInfo) {
      const index = steps.indexOf("yourInfo");
      if (index > -1) steps.splice(index, 1);
    }
    if (!bookingState.isGroupBooking) {
      const index = steps.indexOf("groupParticipants");
      if (index > -1) steps.splice(index, 1);
    }
    const pkgPinned = Boolean(
      searchParams.get("package")?.trim() || searchParams.get("package_id")?.trim()
    );
    if (providerHasPackages === false && !pkgPinned && !bookingState.selectedPackage) {
      const index = steps.indexOf("packages");
      if (index > -1) steps.splice(index, 1);
    }
    return steps;
  }, [
    user,
    bookingState.clientInfo,
    bookingState.isGroupBooking,
    bookingState.selectedPackage,
    providerHasPackages,
    searchParams,
    activeStepOrder,
  ]);

  const effectiveStepIndex = effectiveStepOrder.indexOf(currentStep);
  const progressStepIndex = effectiveStepIndex < 0 ? 0 : effectiveStepIndex;

  useLayoutEffect(() => {
    if (effectiveStepOrder.indexOf(currentStep) >= 0) return;
    const fallback = activeStepOrder.find(
      (s) =>
        activeStepOrder.indexOf(s) >= currentStepIndex && effectiveStepOrder.includes(s)
    );
    if (fallback) setCurrentStepIndex(activeStepOrder.indexOf(fallback));
  }, [currentStep, currentStepIndex, effectiveStepOrder, activeStepOrder]);

  const [isCreatingHold, setIsCreatingHold] = useState(false);

  /** Release an existing hold (best-effort, fire-and-forget). */
  const releaseHold = async (holdId: string) => {
    try {
      await fetcher.post(`/api/public/booking-holds/${holdId}/release`, {});
    } catch {
      // Non-fatal — server-side expiry will clean it up
    }
  };

  /** Create a booking hold when leaving the calendar step so the server can exclude
   *  it from the conflict check — prevents the customer's own slot reservation from
   *  blocking their own booking attempt. Non-fatal: booking proceeds even if hold fails. */
  const createHoldForCalendarExit = async (): Promise<string | null> => {
    if (
      !bookingState.providerId ||
      !bookingState.selectedDate ||
      !bookingState.selectedTimeSlot ||
      bookingState.selectedServices.length === 0
    ) return null;

    // Release any stale hold before creating a new one
    if (bookingState.holdId) {
      await releaseHold(bookingState.holdId);
    }

    try {
      const bookingDateTime = new Date(bookingState.selectedDate);
      const [h, m] = bookingState.selectedTimeSlot.split(":").map(Number);
      bookingDateTime.setHours(h, m, 0, 0);

      let totalMs = 0;
      for (const svc of bookingState.selectedServices) {
        totalMs += (svc.duration + (svc.bufferMinutes ?? 0)) * 60000;
      }
      const endDateTime = new Date(bookingDateTime.getTime() + totalMs);

      const res = await fetcher.post<{ data?: { hold_id?: string; id?: string } }>(
        "/api/public/booking-holds",
        {
          provider_id: bookingState.providerId,
          services: bookingState.selectedServices.map((s) => ({
            offering_id: s.id,
            staff_id: s.staffId ?? null,
          })),
          start_at: bookingDateTime.toISOString(),
          end_at: endDateTime.toISOString(),
          location_type: bookingState.mode === "mobile" ? "at_home" : "at_salon",
          location_id: bookingState.selectedLocationId ?? null,
        }
      );
      return res?.data?.hold_id ?? res?.data?.id ?? null;
    } catch {
      return null;
    }
  };

  const handleNext = () => {
    if (effectiveStepIndex < effectiveStepOrder.length - 1) {
      setDirection(1);
      const nextStep = effectiveStepOrder[effectiveStepIndex + 1];
      const nextIndex = activeStepOrder.indexOf(nextStep);

      // When leaving the calendar step, always create a fresh hold for the selected slot.
      if (currentStep === "calendar") {
        setIsCreatingHold(true);
        createHoldForCalendarExit().then((newHoldId) => {
          if (newHoldId) updateBookingState({ holdId: newHoldId });
          setIsCreatingHold(false);
          setCurrentStepIndex(nextIndex);
        });
        return;
      }

      setCurrentStepIndex(nextIndex);
    }
  };

  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;

  /** Navigate by index into `activeStepOrder` (order changes when `?package=` pins packages first). */
  const navigateToBookingStep = useCallback((stepIndex: number) => {
    setCurrentStepIndex(Math.max(0, Math.min(activeStepOrder.length - 1, stepIndex)));
  }, [activeStepOrder.length]);

  const handleBack = () => {
    if (effectiveStepIndex > 0) {
      setDirection(-1);
      const prevStep = effectiveStepOrder[effectiveStepIndex - 1];
      const prevIndex = activeStepOrder.indexOf(prevStep);
      // Clear hold when returning to the calendar step so a fresh hold is created
      // for the newly selected slot (prevents stale hold_id mismatch).
      if (prevStep === "calendar") {
        if (bookingState.holdId) releaseHold(bookingState.holdId);
        updateBookingState({ holdId: null });
      }
      setCurrentStepIndex(prevIndex);
    } else {
      router.back();
    }
  };

  const updateBookingState = (updates: Partial<BookingState>) => {
    setBookingState((prev) => ({ ...prev, ...updates }));
  };

  const packageFlowKey = useMemo(() => computeBookingFlowKey(searchParams), [searchParams]);

  useEffect(() => {
    packagePrefillDoneKeyRef.current = null;
  }, [packageFlowKey]);

  /** `?package=` / `?package_id=` deep link: prefill cart from `service_package_items` (staff defaults to `any`). */
  useEffect(() => {
    const pkgId = searchParams.get("package")?.trim() || searchParams.get("package_id")?.trim();
    const slug = searchParams.get("slug") || searchParams.get("partnerId");
    // Direct service/product links take precedence — do not replace cart with full package bundle.
    if (serviceDirect || productDirect) return;
    if (!pkgId || !slug || bookingState.selectedServices.length > 0) return;

    const dedupeKey = `${packageFlowKey}|pkg:${pkgId}`;
    if (packagePrefillDoneKeyRef.current === dedupeKey) return;

    let cancelled = false;
    (async () => {
      try {
        const [pkgRes, svcRes, prodRes] = await Promise.all([
          fetcher.get<unknown>(`/api/public/providers/${encodeURIComponent(slug)}/packages`),
          fetcher.get<{ data?: { categories?: Array<{ services?: unknown[] }> } }>(
            `/api/public/providers/${encodeURIComponent(slug)}/services`,
            { timeoutMs: 20000 }
          ),
          fetcher.get<unknown>(`/api/public/providers/${encodeURIComponent(slug)}/products`).catch(() => null),
        ]);
        if (cancelled) return;
        const rawPkg = (pkgRes as { data?: unknown }).data ?? pkgRes;
        const list = Array.isArray(rawPkg) ? rawPkg : [];
        type Pkg = {
          id: string;
          name?: string;
          title?: string;
          price?: number;
          discount_percentage?: number;
          services?: Array<{ id: string; type?: string }>;
          items?: Array<{ id: string; type?: string }>;
        };
        const pkg = (list as Pkg[]).find((p) => p.id === pkgId);
        if (!pkg) return;

        const svcPayload = (svcRes as { data?: { categories?: Array<{ services?: ProviderServiceLike[] }> } }).data ?? svcRes;
        const categories =
          svcPayload && typeof svcPayload === "object" && "categories" in svcPayload
            ? (svcPayload as { categories?: Array<{ services?: ProviderServiceLike[] }> }).categories
            : undefined;
        const flat = flattenProviderServicesToMenu(categories);
        const lines =
          pkg.services && pkg.services.length > 0
            ? pkg.services
            : (pkg.items ?? []).filter((x) => !x.type || x.type === "service");
        const ids = lines.map((l) => l.id).filter(Boolean) as string[];
        const resolved = resolvePackageOfferingsFromFlatMenu(
          ids,
          flat,
          LAST_RESORT_CURRENCY,
          "strict"
        );
        if (!resolved?.length) return;

        const built = resolved.map((r) => ({
          id: r.offeringId,
          title: r.title,
          duration: r.duration_minutes,
          bufferMinutes: r.buffer_minutes,
          price: r.price,
          currency: r.currency,
          staffId: "any",
        }));
        const servicesTotal = built.reduce((sum, s) => sum + s.price, 0);
        const discount =
          typeof pkg.price === "number" && pkg.price < servicesTotal
            ? servicesTotal - pkg.price
            : pkg.discount_percentage
              ? (servicesTotal * pkg.discount_percentage) / 100
              : 0;

        const rawProd = prodRes ? ((prodRes as { data?: unknown }).data ?? prodRes) : [];
        const prodList = Array.isArray(rawProd) ? rawProd : [];
        const selectedProducts = buildRetailCartRowsFromPublicPackage(
          pkg as { items?: Array<{ type?: string; id?: string; quantity?: number }> },
          prodList as PublicProductCatalogRow[],
          built[0]?.currency ?? LAST_RESORT_CURRENCY
        );

        packagePrefillDoneKeyRef.current = dedupeKey;
        updateBookingState({
          selectedServices: built,
          selectedProducts,
          selectedPackage: {
            id: pkg.id,
            title: pkg.title || pkg.name || "Package",
            price: pkg.price ?? Math.max(0, servicesTotal - discount),
            discount,
          },
        });
      } catch {
        // ignore — customer can still select services manually
      }
    })();
    return () => {
      cancelled = true;
    };
     
  }, [packageFlowKey, searchParams, bookingState.selectedServices.length, serviceDirect, productDirect]);

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
        if (
          !cartMatchesPublicCatalogPackage(
            bookingState.selectedServices.map((s) => s.id),
            bookingState.selectedProducts,
            pkg as { items?: Array<{ type?: string; id?: string; quantity?: number }>; services?: Array<{ id: string }> }
          )
        ) {
          return;
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
  }, [searchParams, bookingState.selectedServices, bookingState.selectedProducts, bookingState.selectedPackage?.id]);

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

      {/* Step Content — min-h-0 so flex child can shrink; inner scroll; pb reserves space for fixed BookingActionBar */}
      <main className="flex-1 min-h-0 overflow-hidden relative">
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
            className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-y-contain"
          >
            <div className="min-h-full pb-[calc(14rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(12rem+env(safe-area-inset-bottom,0px))]">
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
                  onNavigateToStep={(step) => {
                    if (step === "calendar") {
                      if (bookingState.holdId) releaseHold(bookingState.holdId);
                      updateBookingState({ holdId: null });
                    }
                    const idx = activeStepOrder.indexOf(step);
                    if (idx >= 0) setCurrentStepIndex(idx);
                  }}
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
        canProceed={(canProceed() ?? false) && !isCreatingHold}
        onNext={handleNext}
        onBack={handleBack}
      />
    </div>
  );
}
