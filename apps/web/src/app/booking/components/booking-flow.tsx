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
import StepCalendar from "./steps/step-calendar";
import StepPromotions from "./steps/step-promotions";
import StepYourInfo from "./steps/step-your-info";
import StepForms from "./steps/step-forms";
import StepPayment from "./steps/step-payment";
import BookingActionBar from "./booking-action-bar";
import { ChevronLeft, X } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { getGuestFingerprintHash } from "@/lib/public-booking/guest-fingerprint";
import { formatLocalDateYYYYMMDD } from "@/lib/dates/format-local-date-yyyymmdd";
import { reconcileBookingInstantWithSlotLabel } from "@/lib/bookings/reconcile-booking-instant-with-slot-label";
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
  computeCatalogPackageServiceDiscount,
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
export type BookingStep = "services" | "groupParticipants" | "venue" | "calendar" | "promotions" | "yourInfo" | "forms" | "payment";

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
  /**
   * §Release-audit 2026-04: ISO-8601 UTC instant the availability engine
   * produced for `selectedTimeSlot`. Preferred over re-deriving the instant
   * from the HH:MM label + provider TZ at hold / booking time (which caused
   * the "invalid time / slot taken" bug in non-UTC deployments).
   */
  selectedSlotStart?: string | null;
  /** §Release-audit 2026-04: engine-emitted ISO end instant for the selected slot. */
  selectedSlotEnd?: string | null;
  /**
   * §Release-audit 2026-04: for any-staff slots, the list of active
   * `provider_staff.id`s who were free at this wall-clock time. Forwarded
   * to /api/public/booking-holds so the hold resolver prefers the same
   * staff the calendar surfaced.
   */
  selectedSlotAvailableStaffIds?: string[] | null;
  promotions: {
    couponCode?: string;
    couponDiscount?: number;
    giftCardCode?: string;
    giftCardAmount?: number;
    loyaltyPointsUsed?: number;
    loyaltyDiscount?: number;
    membershipDiscount?: number;
    membershipPlanId?: string;
    membershipPlanName?: string;
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
  taxIncluded?: boolean;
  tipAmount?: number;
  /** When set, percentage tip buttons stay highlighted after refresh (synced from payment step). */
  tipPercentSelection?: number | null;
  providerId?: string;
  /** IANA zone from GET /api/public/providers/[slug] — used to build `selected_datetime` for bookings. */
  providerTimezone?: string | null;
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
  /** Expiry for the active slot hold, shown on the payment step countdown. */
  holdExpiresAt?: string | null;
  /** Incremented when the parent needs the calendar step to reload availability. */
  availabilityRefreshToken?: number;
  /**
   * B11: provider intake / consent / waiver form responses captured on the
   * "forms" step. Keyed by `provider_forms.id` → `{ field_id: value }` so the
   * POST /api/public/bookings body matches the `/book/continue` schema
   * (`provider_form_responses`).
   */
  providerFormResponses?: Record<
    string,
    Record<string, string | number | boolean | null>
  >;
  /**
   * B11: booking-level custom field values (booking entity type). Keyed by
   * custom field `name`, matching POST /api/public/bookings `custom_field_values`.
   */
  customFieldValues?: Record<string, string | number | boolean | null>;
  /**
   * §15.4-24 (audit 2026-04): client-generated UUIDv4 sent as the
   * `Idempotency-Key` header on POST /api/public/bookings. Persisted in
   * the BookingState so accidental retries / page reloads reuse the same
   * key and the server-side ledger dedupes to the original booking
   * instead of creating a new one + double-charging.
   */
  idempotencyKey?: string;
}

// Note: "packages" is no longer in the canonical step order. Packages are
// applied at the confirmation/payment step (mirrors customer-app `book-checkout.tsx`).
// Deep-links via `?package=` / `?package_id=` still prefill `selectedPackage`
// in state, and the payment step renders a picker for users who want to
// apply a package without arriving from a deep link.
const STEP_ORDER: BookingStep[] = ["services", "groupParticipants", "venue", "calendar", "promotions", "yourInfo", "forms", "payment"];

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
  const providerSlug = searchParams.get("slug") || searchParams.get("partnerId") || searchParams.get("provider_id");
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
  // Packages no longer drive a dedicated step. The payment step fetches the
  // package catalog itself when rendering the picker, so we don't need to
  // know provider-has-packages at the flow level any more.
  /**
   * B11: null = not yet loaded (keep the step in order so we never black-flash
   * past it); false = provider has no forms AND no booking custom-field defs
   * (drop the step); true = render it.
   */
  const [hasFormsStep, setHasFormsStep] = useState<boolean | null>(null);
  /** B11: StepForms broadcasts "all required fields satisfied" so the sticky
   * action bar can enable Continue without duplicating the validation rules
   * here. `true` when the step isn't shown (no forms configured). */
  const [formsStepComplete, setFormsStepComplete] = useState<boolean>(true);
  /** Dedupe `?package=` deep-link prefill (per flow key + package id). */
  const packagePrefillDoneKeyRef = useRef<string | null>(null);
  const selectedPackageCatalogRef = useRef<{
    id: string;
    shape: {
      items?: Array<{ type?: string; id?: string; quantity?: number; product_variant_id?: string | null }>;
      services?: Array<{ id: string }>;
    };
  } | null>(null);

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
   * Packages no longer have a dedicated step. URL deep-links (`?package=` /
   * `?package_id=`) are honoured via the prefill logic that populates
   * `selectedPackage` directly. The package picker now lives on the payment
   * (confirmation) step. We retain `serviceDirect` / `productDirect` flags
   * for future use.
   */
  const activeStepOrder = useMemo((): BookingStep[] => {
    void serviceDirect;
    void productDirect;
    return [...STEP_ORDER];
  }, [serviceDirect, productDirect]);

  useEffect(() => {
    setCurrentStepIndex((i) => Math.max(0, Math.min(i, activeStepOrder.length - 1)));
  }, [activeStepOrder.length]);

  const currentStep = activeStepOrder[currentStepIndex] ?? STEP_ORDER[0];
  const [platformFeeSettings, setPlatformFeeSettings] = useState<{
    platform_service_fee_type: "percentage" | "fixed";
    platform_service_fee_percentage: number;
    platform_service_fee_fixed: number;
    min_booking_amount?: number | null;
    max_fee_amount?: number | null;
    show_service_fee_to_customer: boolean;
  } | null>(null);
  
  useEffect(() => {
    if (isReady && currentStep === "payment" && !checkoutTrackedRef.current) {
      checkoutTrackedRef.current = true;
      track(EVENT_CHECKOUT_START, { provider_id: bookingState.providerId });
    }
  }, [isReady, currentStep, bookingState.providerId, track]);

  // B11: probe for provider forms / booking custom-field definitions up front
  // so `effectiveStepOrder` can drop the "forms" step before the user ever
  // navigates to it. StepForms will still perform the full fetch when mounted
  // (it needs the fields themselves to render), but this early check prevents
  // the progress bar from flashing a step that will immediately auto-skip.
  useEffect(() => {
    const providerId = bookingState.providerId;
    if (!providerId) {
      setHasFormsStep(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch(
        `/api/public/provider-forms?provider_id=${encodeURIComponent(providerId)}`,
      )
        .then((r) => (r.ok ? r.json() : Promise.resolve({})))
        .catch(() => ({})),
      fetch("/api/custom-fields/definitions?entity_type=booking")
        .then((r) => (r.ok ? r.json() : Promise.resolve({})))
        .catch(() => ({})),
    ])
      .then(([formsRes, defsRes]) => {
        if (cancelled) return;
        const formsData =
          (formsRes as { data?: { forms?: unknown[] } })?.data ?? formsRes;
        const forms = Array.isArray((formsData as { forms?: unknown[] })?.forms)
          ? (formsData as { forms: unknown[] }).forms
          : [];
        const defs = Array.isArray(
          (defsRes as { data?: { definitions?: unknown[] } })?.data?.definitions,
        )
          ? (defsRes as { data: { definitions: unknown[] } }).data.definitions
          : [];
        const hasAny = forms.length > 0 || defs.length > 0;
        setHasFormsStep(hasAny);
        // Keep Continue disabled until StepForms actually reports a clean
        // state — otherwise the parent would hold `formsStepComplete=true`
        // from a previous flow and let the user skip required fields.
        if (hasAny) setFormsStepComplete(false);
        else setFormsStepComplete(true);
      })
      .catch(() => {
        if (!cancelled) {
          setHasFormsStep(false);
          setFormsStepComplete(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookingState.providerId]);

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

  // Customer-facing membership preview: membership discount is computed authoritatively by the
  // server in validate-booking, but we still preview it here so the action bar / payment step
  // show the correct subtotal-after-membership, tax base, and Platform fee base before submit.
  // Source: GET /api/me/membership → provider_memberships[].discount_percent for current providerId.
  const [membershipDiscountPercent, setMembershipDiscountPercent] = useState<number>(0);
  const [membershipPlanId, setMembershipPlanId] = useState<string | null>(null);
  const [membershipPlanName, setMembershipPlanName] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingState.providerId) {
      setMembershipDiscountPercent(0);
      setMembershipPlanId(null);
      setMembershipPlanName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/membership", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const json = await res.json();
        const list = (json?.data?.provider_memberships ?? []) as Array<{
          plan_id?: string;
          plan_name?: string;
          provider_id?: string;
          discount_percent?: number;
        }>;
        const match = list.find((m) => m?.provider_id === bookingState.providerId);
        if (cancelled) return;
        const pct = match ? Number(match.discount_percent) : 0;
        if (Number.isFinite(pct) && pct > 0 && pct <= 100) {
          setMembershipDiscountPercent(pct);
          setMembershipPlanId(match?.plan_id ?? null);
          setMembershipPlanName((match?.plan_name?.trim() || null) ?? null);
        } else {
          setMembershipDiscountPercent(0);
          setMembershipPlanId(null);
          setMembershipPlanName(null);
        }
      } catch {
        // Membership preview is optional; never block the flow.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingState.providerId]);

  // Calculate membership discount, tax, and Platform Fee whenever relevant values change
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

    const packageDiscount = bookingState.selectedPackage
      ? computeCatalogPackageServiceDiscount(
          {
            price: bookingState.selectedPackage.price,
            discount_percentage: bookingState.selectedPackage.discount,
          },
          servicesTotal,
        )
      : 0;

    const subtotal =
      Math.max(0, servicesTotal - packageDiscount) +
      bookingState.selectedAddons.reduce((sum, a) => sum + a.price, 0) +
      bookingState.selectedProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0) +
      (bookingState.address?.travelFee || 0);

    // Coupon only — gift cards are payment tender, not booking discounts.
    const nonMembershipDiscounts =
      (bookingState.promotions.couponDiscount || 0);

    const subtotalAfterPromo = Math.max(0, subtotal - nonMembershipDiscounts);

    const membershipDiscount =
      membershipDiscountPercent > 0
        ? Math.min((subtotalAfterPromo * membershipDiscountPercent) / 100, subtotalAfterPromo)
        : 0;

    const loyaltyDiscount = bookingState.promotions.loyaltyDiscount || 0;
    const allDiscounts =
      nonMembershipDiscounts + membershipDiscount + loyaltyDiscount;
    const subtotalAfterDiscounts = Math.max(0, subtotal - allDiscounts);

    // Calculate tax (on subtotal after all discounts)
    const taxRate = bookingState.taxRate || 0;
    const taxAmount = taxRate > 0
      ? bookingState.taxIncluded
        ? Number((subtotalAfterDiscounts - subtotalAfterDiscounts / (1 + taxRate / 100)).toFixed(2))
        : Number(((subtotalAfterDiscounts * taxRate) / 100).toFixed(2))
      : 0;

    // Calculate customer-paid Platform Fee (on subtotal after all discounts)
    const minBookingAmount = Number(platformFeeSettings.min_booking_amount || 0);
    let serviceFeeAmount = subtotalAfterDiscounts >= minBookingAmount
      ? (
      platformFeeSettings.platform_service_fee_type === "percentage"
        ? Number(((subtotalAfterDiscounts * platformFeeSettings.platform_service_fee_percentage) / 100).toFixed(2))
        : platformFeeSettings.platform_service_fee_fixed
      )
      : 0;
    if (
      platformFeeSettings.platform_service_fee_type === "percentage" &&
      platformFeeSettings.max_fee_amount != null
    ) {
      serviceFeeAmount = Math.min(serviceFeeAmount, Number(platformFeeSettings.max_fee_amount || 0));
    }
    
    const serviceFeePercentage = platformFeeSettings.platform_service_fee_type === "percentage"
      ? platformFeeSettings.platform_service_fee_percentage
      : 0;

    setBookingState((prev) => ({
      ...prev,
      promotions: {
        ...prev.promotions,
        membershipDiscount,
        membershipPlanId: membershipPlanId ?? prev.promotions.membershipPlanId,
        membershipPlanName: membershipPlanName ?? prev.promotions.membershipPlanName,
      },
      taxAmount,
      serviceFeeAmount: platformFeeSettings.show_service_fee_to_customer ? serviceFeeAmount : 0,
      serviceFeePercentage: platformFeeSettings.show_service_fee_to_customer ? serviceFeePercentage : 0,
    }));
  }, [
    bookingState.selectedServices,
    bookingState.selectedAddons,
    bookingState.selectedProducts,
    bookingState.selectedPackage,
    bookingState.address?.travelFee,
    bookingState.promotions.couponDiscount,
    bookingState.promotions.loyaltyDiscount,
    membershipDiscountPercent,
    membershipPlanId,
    membershipPlanName,
    bookingState.taxRate,
    bookingState.taxIncluded,
    platformFeeSettings,
  ]);

  // Load provider ID from slug
  useEffect(() => {
    const providerSlug = searchParams.get("slug") || searchParams.get("partnerId") || searchParams.get("provider_id");
    if (providerSlug && !bookingState.providerId) {
      const loadProviderId = async () => {
        try {
          const response = await fetch(`/api/public/providers/${encodeURIComponent(providerSlug)}`);
          const data = await response.json();
          if (data.data?.id) {
            updateBookingState({
              providerId: data.data.id,
              taxRate: data.data.tax_rate_percent != null ? Number(data.data.tax_rate_percent) : 0,
              taxIncluded: Boolean(data.data.tax_inclusive),
              providerTimezone: data.data.timezone ?? null,
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
    const providerSlug = searchParams.get("slug") || searchParams.get("partnerId") || searchParams.get("provider_id");
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
    // B11: drop the forms step when the provider has nothing configured AND no
    // booking-level custom fields exist. While loading (null) we keep the step
    // in the order; StepForms shows a spinner and auto-advances once it
    // confirms there's nothing to collect.
    if (hasFormsStep === false) {
      const index = steps.indexOf("forms");
      if (index > -1) steps.splice(index, 1);
    }
    return steps;
  }, [
    user,
    bookingState.clientInfo,
    bookingState.isGroupBooking,
    hasFormsStep,
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

  /**
   * §Launch-audit 2026-04-18: the sticky BookingActionBar grows taller
   * as fees/tax/tip/discount rows appear, so a static `pb-14rem` on the
   * scroll container was not enough to keep the last few fields of the
   * venue / your-info / forms steps visible on mobile. A ResizeObserver
   * on the action bar publishes its measured height to the root
   * element as `--booking-action-bar-h`; the scroll container then pads
   * by that value + a small buffer — so the bottom of any step stays
   * above the action bar regardless of viewport or row count.
   *
   * We set the var on `document.documentElement` (not the scroll
   * container's ref) because the scroll container is re-mounted on each
   * step change inside `<AnimatePresence mode="wait">`, which would
   * drop the var mid-transition and cause a one-frame snap-to-default.
   */
  const actionBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = actionBarRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const apply = (height: number) => {
      document.documentElement.style.setProperty(
        "--booking-action-bar-h",
        `${Math.ceil(height)}px`,
      );
    };
    apply(node.getBoundingClientRect().height);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.height);
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--booking-action-bar-h");
    };
  }, []);

  /** Release an existing hold (best-effort, fire-and-forget). */
  const releaseHold = async (holdId: string) => {
    try {
      await fetcher.post(`/api/public/booking-holds/${holdId}/release`, {});
    } catch {
      // Non-fatal — server-side expiry will clean it up
    }
  };

  /** Create a booking hold before leaving the calendar step. */
  const createHoldForCalendarExit = async (): Promise<{ holdId: string; expiresAt: string | null } | null> => {
    if (
      !bookingState.providerId ||
      !bookingState.selectedDate ||
      !bookingState.selectedTimeSlot ||
      bookingState.selectedServices.length === 0
    ) return null;

    // Previous hold is cancelled server-side via `previous_hold_id` — do not release early.

    try {
      // §Release-audit 2026-04: prefer the engine-emitted ISO start instant
      // captured at slot selection. Only fall back to deriving the instant
      // from HH:MM + provider TZ when the calendar didn't capture it (older
      // persisted drafts from before this release).
      const dateStr = formatLocalDateYYYYMMDD(new Date(bookingState.selectedDate!));
      const bookingDateTime = reconcileBookingInstantWithSlotLabel(
        bookingState.selectedSlotStart,
        dateStr,
        bookingState.selectedTimeSlot!,
        bookingState.providerTimezone,
      );

      let totalMs = 0;
      for (const svc of bookingState.selectedServices) {
        totalMs += (svc.duration + (svc.bufferMinutes ?? 0)) * 60000;
      }
      for (const addon of bookingState.selectedAddons) {
        totalMs += (addon.duration ?? 0) * 60000;
      }
      // Prefer the engine ISO end if present + a matching start; otherwise
      // derive end from the summed cart duration.
      const endDateTime =
        bookingState.selectedSlotStart && bookingState.selectedSlotEnd
          ? new Date(bookingState.selectedSlotEnd)
          : new Date(bookingDateTime.getTime() + totalMs);
      const cachedPackage = selectedPackageCatalogRef.current;
      const packageIdForHold =
        bookingState.selectedPackage?.id &&
        cachedPackage?.id === bookingState.selectedPackage.id &&
        cartMatchesPublicCatalogPackage(
          bookingState.selectedServices.map((s) => s.id),
          bookingState.selectedProducts,
          cachedPackage.shape
        )
          ? bookingState.selectedPackage.id
          : null;

      // Wave 2.1 (audit 2026-04 final 100/100): UUIDv4 idempotency key
      // per slot-select. Internal retries inside fetcher use the same
      // key so the server returns the cached response instead of
      // double-creating a hold.
      const holdIdemKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === "x" ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

      const res = await fetcher.post<{
        data?: { hold_id?: string; id?: string; expires_at?: string | null };
        hold_id?: string;
        id?: string;
        expires_at?: string | null;
      }>(
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
          previous_hold_id: bookingState.holdId || null,
          guest_fingerprint_hash: getGuestFingerprintHash(),
          // §Release-audit 2026-04: when the slot came from an any-staff
          // union, forward the engine's list of free staff so the hold
          // resolver prefers the exact staff the calendar surfaced.
          preferred_staff_ids: bookingState.selectedSlotAvailableStaffIds ?? null,
          ...(packageIdForHold
            ? {
                package_id: packageIdForHold,
                primary_package_id: packageIdForHold,
              }
            : {}),
          ...(bookingState.mode === "mobile" && bookingState.address?.structuredAddress
            ? {
                address: {
                  line1: bookingState.address.structuredAddress.line1,
                  city: bookingState.address.structuredAddress.city,
                  country: bookingState.address.structuredAddress.country,
                  postal_code: bookingState.address.structuredAddress.postalCode,
                  ...(bookingState.address.coordinates
                    ? { latitude: bookingState.address.coordinates.lat, longitude: bookingState.address.coordinates.lng }
                    : {}),
                },
              }
            : {}),
        },
        { headers: { "Idempotency-Key": holdIdemKey } }
      );
      const holdId = res?.data?.hold_id ?? res?.data?.id ?? res?.hold_id ?? res?.id ?? null;
      if (!holdId) {
        throw new Error("No hold id returned");
      }
      return { holdId, expiresAt: res?.data?.expires_at ?? res?.expires_at ?? null };
    } catch (err) {
      console.warn("[booking] hold creation failed:", err);
      toast.warning("Could not reserve your time slot. Please choose another available time.");
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
        createHoldForCalendarExit().then((hold) => {
          if (!hold) {
            updateBookingState({
              holdId: null,
              holdExpiresAt: null,
              selectedTimeSlot: null,
              selectedSlotStart: null,
              selectedSlotEnd: null,
              selectedSlotAvailableStaffIds: null,
              availabilityRefreshToken: Date.now(),
            });
            setIsCreatingHold(false);
            return;
          }
          updateBookingState({ holdId: hold.holdId, holdExpiresAt: hold.expiresAt });
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

  /** Navigate by index into `activeStepOrder` (canonical booking steps only). */
  const navigateToBookingStep = useCallback((stepIndex: number) => {
    setCurrentStepIndex(Math.max(0, Math.min(activeStepOrder.length - 1, stepIndex)));
  }, [activeStepOrder.length]);

  const handleBack = async () => {
    if (effectiveStepIndex > 0) {
      setDirection(-1);
      const prevStep = effectiveStepOrder[effectiveStepIndex - 1];
      const prevIndex = activeStepOrder.indexOf(prevStep);
      // Clear hold when returning to the calendar step so a fresh hold is created
      // for the newly selected slot (prevents stale hold_id mismatch).
      if (prevStep === "calendar") {
        const id = bookingState.holdId;
        if (id) await releaseHold(id);
        updateBookingState({ holdId: null, holdExpiresAt: null });
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
    selectedPackageCatalogRef.current = null;
  }, [packageFlowKey]);

  /** `?package=` / `?package_id=` deep link: prefill cart from `service_package_items` (staff defaults to `any`). */
  useEffect(() => {
    const pkgId = searchParams.get("package")?.trim() || searchParams.get("package_id")?.trim();
    const slug = searchParams.get("slug") || searchParams.get("partnerId") || searchParams.get("provider_id");
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
          items?: Array<{ id: string; type?: string; quantity?: number; product_variant_id?: string | null }>;
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
        selectedPackageCatalogRef.current = {
          id: pkg.id,
          shape: { items: pkg.items, services: pkg.services },
        };
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
    const pkgId = searchParams.get("package")?.trim() || searchParams.get("package_id")?.trim();
    const slug = searchParams.get("slug") || searchParams.get("partnerId") || searchParams.get("provider_id");
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
          items?: Array<{ id?: string; type?: string; quantity?: number; product_variant_id?: string | null }>;
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
        selectedPackageCatalogRef.current = {
          id: pkg.id,
          shape: { items: pkg.items, services: pkg.services },
        };
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

  /** Drop stale package context when the customer changes services/products after package prefill. */
  useEffect(() => {
    const pkg = bookingState.selectedPackage;
    if (!pkg?.id) return;

    const cached = selectedPackageCatalogRef.current;
    if (cached?.id === pkg.id) {
      const stillMatches = cartMatchesPublicCatalogPackage(
        bookingState.selectedServices.map((s) => s.id),
        bookingState.selectedProducts,
        cached.shape
      );
      if (!stillMatches) {
        selectedPackageCatalogRef.current = null;
        updateBookingState({ selectedPackage: undefined, customerPackageEntitlementId: null });
      }
      return;
    }

    const slug = searchParams.get("slug") || searchParams.get("partnerId") || searchParams.get("provider_id");
    if (!slug) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data?: unknown } | unknown[]>(
          `/api/public/providers/${encodeURIComponent(slug)}/packages`
        );
        if (cancelled) return;
        const raw = (res as { data?: unknown }).data ?? res;
        const list = Array.isArray(raw) ? raw : [];
        type Pkg = {
          id: string;
          services?: Array<{ id: string }>;
          items?: Array<{ id?: string; type?: string; quantity?: number; product_variant_id?: string | null }>;
        };
        const live = (list as Pkg[]).find((p) => p.id === pkg.id);
        if (!live) {
          selectedPackageCatalogRef.current = null;
          updateBookingState({ selectedPackage: undefined, customerPackageEntitlementId: null });
          return;
        }
        const shape = { items: live.items, services: live.services };
        selectedPackageCatalogRef.current = { id: live.id, shape };
        if (
          !cartMatchesPublicCatalogPackage(
            bookingState.selectedServices.map((s) => s.id),
            bookingState.selectedProducts,
            shape
          )
        ) {
          selectedPackageCatalogRef.current = null;
          updateBookingState({ selectedPackage: undefined, customerPackageEntitlementId: null });
        }
      } catch {
        // Keep the last known state; server validation remains authoritative.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingState.selectedPackage?.id, bookingState.selectedServices, bookingState.selectedProducts, searchParams]);

  // Note: the packages step has been removed. Package deep-links (`?package=...`)
  // populate `bookingState.selectedPackage` via prefill above; users who want
  // to apply a package without a deep link do so on the payment step picker.

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
      case "forms": {
        // B11: gate on required provider-form fields and required booking
        // custom fields. StepForms reports counts via onLoaded; the deeper
        // definitions live in that component, so here we only enforce a
        // shallow check: if we know there's nothing to collect
        // (`hasFormsStep === false`) the step should already be out of the
        // order; if we haven't finished loading yet, don't let the user
        // advance past a screen they haven't seen.
        if (hasFormsStep === null) return false;
        if (hasFormsStep === false) return true;
        return formsStepComplete;
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
      case "calendar":
        return "Choose Date & Time";
      case "promotions":
        return "Promotions & Rewards";
      case "yourInfo":
        return "Your Information";
      case "forms":
        return "Additional Details";
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
        <AnimatePresence initial={false} custom={direction}>
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
            style={{
              // Fallback padding matches the old constants until the
              // ResizeObserver publishes a measured height (first frame).
              // `+ 1.5rem` gives the last field a little breathing room
              // above the action bar; env(safe-area-inset-bottom) is
              // already part of the action bar's own padding.
              paddingBottom:
                "calc(var(--booking-action-bar-h, 14rem) + 1.5rem)",
            }}
          >
            <div className="min-h-full">
              {currentStep === "services" ? (
                <StepServiceSelection
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNext={handleNext}
                  providerSlug={searchParams.get("slug") || searchParams.get("partnerId") || searchParams.get("provider_id") || ""}
                />
              ) : currentStep === "groupParticipants" ? (
                <StepGroupParticipants
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNext={handleNext}
                  providerSlug={searchParams.get("slug") || searchParams.get("partnerId") || searchParams.get("provider_id") || ""}
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
                  providerSlug={searchParams.get("slug") || searchParams.get("partnerId") || searchParams.get("provider_id") || ""}
                />
              ) : currentStep === "calendar" ? (
                <StepCalendar
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNext={handleNext}
                  providerSlug={searchParams.get("slug") || searchParams.get("partnerId") || searchParams.get("provider_id") || ""}
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
              ) : currentStep === "forms" ? (
                <StepForms
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNext={handleNext}
                  onLoaded={({
                    providerFormsCount,
                    customFieldDefinitionsCount,
                  }) => {
                    setHasFormsStep(
                      providerFormsCount > 0 ||
                        customFieldDefinitionsCount > 0,
                    );
                  }}
                  onCompletionChange={setFormsStepComplete}
                />
              ) : currentStep === "payment" ? (
                <StepPayment
                  bookingState={bookingState}
                  updateBookingState={updateBookingState}
                  onNavigateToStep={async (step) => {
                    if (step === "calendar") {
                      const id = bookingState.holdId;
                      if (id) await releaseHold(id);
                      updateBookingState({
                        holdId: null,
                        holdExpiresAt: null,
                        selectedTimeSlot: null,
                        selectedSlotStart: null,
                        selectedSlotEnd: null,
                        selectedSlotAvailableStaffIds: null,
                      });
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

      {/* Sticky Action Bar — ref is forwarded to the root motion.div
          inside the component so ResizeObserver can publish its
          measured height to `--booking-action-bar-h` (see effect
          above). */}
      <BookingActionBar
        ref={actionBarRef}
        bookingState={bookingState}
        currentStep={currentStep}
        canProceed={(canProceed() ?? false) && !isCreatingHold}
        onNext={handleNext}
        onBack={handleBack}
      />
    </div>
  );
}
