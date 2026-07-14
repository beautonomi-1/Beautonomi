"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_CHECKOUT_START } from "@/lib/analytics/amplitude/types";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { fetchProviderContactDisclosure } from "@/lib/providers/fetch-provider-contact";
import { getUserFacingMessage, extractErrorCode } from "@/lib/errors/user-messages";
import { cancellationRequiresAck } from "@beautonomi/i18n";
import { toast } from "sonner";
import { Loader2, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { BeautonomiGateModal } from "./BeautonomiGateModal";
import { rememberBookingDraftTenant } from "@/lib/booking/booking-draft-tenant";
import { getGuestFingerprintHash } from "@/lib/public-booking/guest-fingerprint";
import {
  BookingNav,
  StepVenue,
  StepCategory,
  StepServices,
  StepAddons,
  StepGroupParticipants,
  StepStaff,
  StepSchedule,
  StepIntake,
  StepReview,
} from "./booking-engine";
import ResourceSelection from "@/components/booking/ResourceSelection";
import type {
  BookingData,
  BookingStep,
  LocationOption,
  ServiceOption,
  PackageOption,
  StaffOption,
  AddonOption,
  ServiceVariant,
  BookingServiceEntry,
  ProviderCategoryOption,
} from "../types/booking-engine";

import {
  buildRetailCartRowsFromPublicPackage,
  cartMatchesPublicCatalogPackage,
  coerceSelectedDate,
  formatBusinessDayYYYYMMDD,
  mergeExpressProductCartLines,
  resolvePackageOfferingsFromFlatMenu,
  startOfBusinessDayLocalDate,
  type ProviderServiceLike,
  type ResolvedOfferingLine,
  type PublicProductCatalogRow,
} from "@beautonomi/utils";
import {
  computeAtHomeLinePrice,
  resolveAtHomeAdjustmentForOffering,
} from "@beautonomi/utils";
import { parseProductsQueryParam, type ProductCartLine } from "@/lib/express-booking/prefill";
import {
  BOOKING_ACCENT,
  BOOKING_BG,
  BOOKING_GLASS_BG,
  BOOKING_EDGE,
  BOOKING_SHADOW_MAIN,
  BOOKING_SHADOW_CARD,
  PLATFORM_NAME,
  BOOKING_TEXT_SECONDARY,
  BOOKING_TEXT_PRIMARY,
} from "../constants";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { PUBLIC_BOOKING_MAX_ADVANCE_DAYS } from "@/lib/provider-booking/public-booking-slot-policy";

/** Aligns with server `buffer_minutes || 0` when offering buffer is unknown. */
const DEFAULT_SLOT_BUFFER_MINUTES = 0;

function buildProviderServicesLikeMenu(
  baseServices: ServiceOption[],
  variantsByServiceId: Record<string, ServiceVariant[]>,
  tenantCurrencyFallback: string
): ProviderServiceLike[] {
  return baseServices.map((svc) => ({
    id: svc.id,
    title: svc.title,
    duration_minutes: svc.duration_minutes,
    price: typeof svc.price === "number" ? svc.price : Number(svc.price) || 0,
    currency: svc.currency ?? tenantCurrencyFallback,
    buffer_minutes: (svc as { buffer_minutes?: number }).buffer_minutes,
    variants: (variantsByServiceId[svc.id] ?? []).map((v) => ({
      id: v.id,
      title: v.title ?? v.variant_name,
      duration_minutes: (v as { duration_minutes?: number }).duration_minutes ?? v.duration ?? 60,
      price: typeof v.price === "number" ? v.price : Number(v.price) || 0,
      buffer_minutes: (v as { buffer_minutes?: number }).buffer_minutes,
    })),
  }));
}

function normalizeDeepLinkOfferingIds(rawIds: string[], baseServices: ServiceOption[]): string[] {
  const out: string[] = [];
  for (const raw of rawIds) {
    const id = raw.trim();
    if (!id) continue;
    const bySlug = baseServices.find((s) => (s as { slug?: string }).slug === id);
    out.push(bySlug ? bySlug.id : id);
  }
  return out;
}

function resolveLineAtHomeAdjustment(
  line: ResolvedOfferingLine,
  baseServices: ServiceOption[],
  variantsByServiceId: Record<string, ServiceVariant[]>
): number {
  for (const svc of baseServices) {
    const vars = variantsByServiceId[svc.id] ?? [];
    if (vars.some((v) => v.id === line.offeringId)) {
      return Number(svc.at_home_price_adjustment ?? 0);
    }
    if (svc.id === line.offeringId) {
      return Number(svc.at_home_price_adjustment ?? 0);
    }
  }
  return 0;
}

function resolvedLinesToBookingEntries(
  lines: ResolvedOfferingLine[],
  baseServices: ServiceOption[],
  variantsByServiceId: Record<string, ServiceVariant[]>,
  treatAsAtHomeForPricing: boolean,
  fallbackCurrency: string
): BookingServiceEntry[] {
  return lines.map((line) => {
    const adjustment = treatAsAtHomeForPricing
      ? resolveLineAtHomeAdjustment(line, baseServices, variantsByServiceId)
      : 0;
    const priced = computeAtHomeLinePrice(line.price, adjustment, treatAsAtHomeForPricing);
    return {
      offering_id: line.offeringId,
      title: line.title,
      duration_minutes: line.duration_minutes,
      price: priced.displayPrice,
      base_price: priced.basePrice,
      at_home_price_adjustment: priced.adjustmentApplied,
      currency: line.currency ?? fallbackCurrency,
    };
  });
}

function resolveOfferingDurationBufferForSlot(
  offeringId: string,
  offeringsList: Array<{ id: string; duration_minutes?: number; buffer_minutes?: number }>,
  variantsByServiceId: Record<string, ServiceVariant[]>
): { duration: number; buffer: number } {
  const base = offeringsList.find((o) => o.id === offeringId);
  if (base) {
    return {
      duration: base.duration_minutes ?? 60,
      buffer: base.buffer_minutes ?? DEFAULT_SLOT_BUFFER_MINUTES,
    };
  }
  for (const svc of offeringsList) {
    const vars = variantsByServiceId[svc.id] ?? [];
    const v = vars.find((vv) => vv.id === offeringId);
    if (v) {
      const dur = (v as { duration_minutes?: number }).duration_minutes ?? v.duration ?? 60;
      const buf =
        (v as { buffer_minutes?: number }).buffer_minutes ??
        (svc as { buffer_minutes?: number }).buffer_minutes ??
        DEFAULT_SLOT_BUFFER_MINUTES;
      return { duration: dur, buffer: buf };
    }
  }
  return { duration: 60, buffer: DEFAULT_SLOT_BUFFER_MINUTES };
}

/** `fetcher.get` defaults to 15s client cache — availability must always be fresh (tab switches, holds, concurrent bookings). */
const AVAILABILITY_FETCH_OPTS = { staleTimeMs: 0 } as const;

function inferCategoryForPreselected(
  entries: BookingServiceEntry[],
  baseServices: ServiceOption[],
  variantsByServiceId: Record<string, ServiceVariant[]>
): ProviderCategoryOption | null {
  if (entries.length === 0) return null;
  const oid = entries[0].offering_id;
  const offering =
    baseServices.find((o) => o.id === oid) ??
    baseServices.find((o) => (variantsByServiceId[o.id] ?? []).some((v) => v.id === oid));
  if (!offering) return null;
  const o = offering as ServiceOption & {
    provider_categories?: { id: string; name: string; description?: string | null; display_order?: number; color?: string | null };
  };
  const cat = o.provider_categories;
  if (cat?.id && cat?.name) {
    return {
      id: cat.id,
      name: cat.name,
      description: cat.description ?? null,
      color: cat.color ?? null,
      display_order: cat.display_order ?? 0,
    };
  }
  return {
    id: "_other",
    name: "Other Services",
    description: null,
    color: null,
    display_order: 999,
  };
}

const defaultBookingData: BookingData = {
  venueType: "at_salon",
  selectedLocation: null,
  atHomeAddress: { line1: "", city: "", country: "ZA" },
  selectedCategory: null,
  selectedPackage: null,
  selectedServices: [],
  selectedProducts: [],
  selectedAddonIds: [],
  addonsSubtotal: 0,
  selectedStaff: null,
  selectedDate: null,
  selectedSlot: null,
  selectedResourceIds: [],
  client: {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    specialRequests: "",
  },
  currency: LAST_RESORT_CURRENCY,
  servicesSubtotal: 0,
  totalDurationMinutes: 0,
};

function cartMatchesCatalogPackage(
  services: BookingServiceEntry[],
  productRows: Array<{ id: string; quantity: number }>,
  pkg: PackageOption | null
): boolean {
  if (!pkg) return false;
  return cartMatchesPublicCatalogPackage(
    services.map((s) => s.offering_id),
    productRows,
    pkg
  );
}

function toProductCartLines(rows: Array<{ id: string; quantity: number }>): ProductCartLine[] {
  const out: ProductCartLine[] = [];
  for (const p of rows) {
    const colon = p.id.indexOf(":");
    const product_id = colon !== -1 ? p.id.slice(0, colon) : p.id;
    const vid = colon !== -1 ? p.id.slice(colon + 1) : null;
    out.push({
      product_id,
      quantity: p.quantity,
      ...(vid ? { product_variant_id: vid } : {}),
    });
  }
  return out;
}

interface Provider {
  id: string;
  slug: string;
  business_name: string;
  timezone?: string | null;
}

interface OnlineBookingSettings {
  staff_selection_mode: "client_chooses" | "anyone_default" | "hidden_auto_assign";
  require_auth_step: "checkout" | "before_time_selection";
  min_notice_minutes: number;
  max_advance_days: number;
  allow_pay_in_person?: boolean;
  deposit_required?: boolean;
  deposit_amount?: number | null;
  deposit_percent?: number | null;
  allow_online_waitlist?: boolean;
}

interface GroupBookingSettings {
  enabled: boolean;
  maxGroupSize: number;
  excludedServices: string[];
  enabledLocations: string[];
}

interface ProviderFormField {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
  sort_order: number;
}

interface ProviderForm {
  id: string;
  title: string;
  description: string | null;
  form_type: string;
  is_required: boolean;
  is_active: boolean;
  fields: ProviderFormField[];
}

interface CancellationPolicy {
  policy_text?: string | null;
  hours_before_cutoff?: number;
  grace_window_minutes?: number;
  late_cancellation_type?: "no_refund" | "partial_refund" | "full_refund";
  late_refund_percentage?: number;
  refund_percentage?: number;
  fee_amount?: number;
  fee_type?: "fixed" | "percentage";
  no_show_fee_enabled?: boolean;
  no_show_fee_amount?: number;
  currency?: string;
}

interface OnlineBookingFlowNewProps {
  provider: Provider;
  /**
   * Deep-link / express-booking query string (see `/book/l/[slug]` → `/book/[slug]?...`).
   * After hold creation, checkout extras (promo codes, tips, payment choice, wallet when enabled) live on `/book/continue`.
   */
  queryParams?: {
    service?: string;
    /** Comma-separated offering IDs (express link). Variants: parent id → first variant; explicit variant id supported. */
    services?: string;
    staff?: string;
    location?: string;
    location_type?: "at_home" | "at_salon";
    anyone?: boolean;
    /** Suggested day for schedule step (e.g. `YYYY-MM-DD`) */
    date?: string;
    auth_return?: string;
    /** Comma-separated addon offering UUIDs (express prefill) */
    addons?: string;
    promo?: string;
    gift_card?: string;
    /** URL-encoded JSON: `[{ product_id, quantity, product_variant_id? }]` */
    products?: string;
    /** Active `service_packages.id` — preselects bundle and line items */
    package?: string;
    /** Referral / invite code — attached to signed-in user before hold (customer app parity). */
    ref?: string;
  };
  embed?: boolean;
}

export default function OnlineBookingFlowNew({
  provider,
  queryParams = {},
  embed = false,
}: OnlineBookingFlowNewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { track, isReady } = useAmplitude();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const tenantRegionCode = bundle?.meta?.tenant_region?.code ?? "ZA";
  const checkoutTrackedRef = useRef(false);
  const appliedQueryAddonsRef = useRef(false);
  const prevStepRef = useRef<BookingStep | null>(null);
  const packageProductLineIdsRef = useRef<Set<string>>(new Set());
  const referralAttachSucceededRef = useRef(false);

  const [step, setStep] = useState<BookingStep>("venue");
  const [bookingData, setBookingData] = useState<BookingData>(() => ({
    ...defaultBookingData,
    venueType: (queryParams.location_type as "at_salon" | "at_home") ?? "at_salon",
    currency: tenantCurrency,
    atHomeAddress: { ...defaultBookingData.atHomeAddress, country: tenantRegionCode },
  }));

  const updateDataRef = useRef<(patch: Partial<BookingData>) => void>(() => {});
  const updateDataImpl = useCallback((patch: Partial<BookingData>) => {
    setBookingData((prev) => {
      const next = { ...prev, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "selectedDate")) {
        next.selectedDate = coerceSelectedDate(patch.selectedDate);
      }
      const servicesSubtotal = next.selectedServices.reduce((s, e) => s + e.price, 0);
      return {
        ...next,
        servicesSubtotal: next.selectedPackage ? (next.selectedPackage.price ?? servicesSubtotal) : servicesSubtotal,
        totalDurationMinutes: next.selectedServices.reduce((s, e) => s + e.duration_minutes, 0),
        currency: next.selectedServices[0]?.currency ?? next.currency ?? tenantCurrency,
      };
    });
  }, [tenantCurrency]);
  updateDataRef.current = updateDataImpl;
  const updateData = useCallback((patch: Partial<BookingData>) => updateDataRef.current(patch), []);

  /** Checkout reads these from sessionStorage (see `/book/continue`). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (queryParams.promo?.trim()) {
        sessionStorage.setItem("beautonomi_booking_promotion_code", queryParams.promo.trim());
      }
      if (queryParams.gift_card?.trim()) {
        sessionStorage.setItem("beautonomi_booking_gift_card_code", queryParams.gift_card.trim());
      }
      const cartLines = parseProductsQueryParam(queryParams.products);
      if (cartLines.length > 0) {
        sessionStorage.setItem("beautonomi_booking_product_cart", JSON.stringify(cartLines));
      }
    } catch {
      // ignore
    }
  }, [queryParams.promo, queryParams.gift_card, queryParams.products]);

  /** When config-bundle resolves after first paint, replace stale ZA default with `tenant_region.code` (user edits preserved). */
  useEffect(() => {
    const code = bundle?.meta?.tenant_region?.code?.trim();
    if (!code) return;
    setBookingData((prev) => {
      if (prev.atHomeAddress.country === code) return prev;
      if (prev.atHomeAddress.country !== "ZA") return prev;
      return {
        ...prev,
        atHomeAddress: { ...prev.atHomeAddress, country: code },
      };
    });
  }, [bundle?.meta?.tenant_region?.code]);

  /** Drop stale package context if the user changed services/products after `?package=` / bundle prefill (keeps consume `package_id` honest). */
  useEffect(() => {
    setBookingData((prev) => {
      const pkg = prev.selectedPackage;
      if (!pkg) return prev;
      if (cartMatchesCatalogPackage(prev.selectedServices, prev.selectedProducts ?? [], pkg)) return prev;
      const servicesSubtotal = prev.selectedServices.reduce((s, e) => s + e.price, 0);
      const packageProductLineIds = packageProductLineIdsRef.current;
      const selectedProducts =
        packageProductLineIds.size > 0
          ? (prev.selectedProducts ?? []).filter((p) => !packageProductLineIds.has(p.id))
          : (prev.selectedProducts ?? []);
      packageProductLineIdsRef.current = new Set();
      return {
        ...prev,
        selectedPackage: null,
        selectedProducts,
        servicesSubtotal,
        totalDurationMinutes: prev.selectedServices.reduce((s, e) => s + e.duration_minutes, 0),
      };
    });
  }, [bookingData.selectedServices, bookingData.selectedProducts, bookingData.selectedPackage]);

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [offerings, setOfferings] = useState<ServiceOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [addons, setAddons] = useState<AddonOption[]>([]);
  const [variantsByServiceId, setVariantsByServiceId] = useState<Record<string, ServiceVariant[]>>({});

  useEffect(() => {
    if (offerings.length === 0) return;
    const isAtHome = bookingData.venueType === "at_home";
    setBookingData((prev) => {
      if (prev.selectedServices.length === 0) return prev;
      let changed = false;
      const nextServices = prev.selectedServices.map((entry) => {
        const row = offerings.find((o) => o.id === entry.offering_id);
        const basePrice = row?.price ?? entry.base_price ?? entry.price;
        const adjustment = resolveAtHomeAdjustmentForOffering(
          offerings as Array<{
            id: string;
            parent_service_id?: string | null;
            at_home_price_adjustment?: number | null;
          }>,
          entry.offering_id
        );
        const priced = computeAtHomeLinePrice(basePrice, adjustment, isAtHome);
        if (
          Math.abs(priced.displayPrice - entry.price) < 0.005 &&
          entry.base_price === priced.basePrice &&
          entry.at_home_price_adjustment === priced.adjustmentApplied
        ) {
          return entry;
        }
        changed = true;
        return {
          ...entry,
          price: priced.displayPrice,
          base_price: priced.basePrice,
          at_home_price_adjustment: priced.adjustmentApplied,
        };
      });
      if (!changed) return prev;
      const servicesSubtotal = prev.selectedPackage
        ? (prev.selectedPackage.price ?? nextServices.reduce((s, e) => s + e.price, 0))
        : nextServices.reduce((s, e) => s + e.price, 0);
      return {
        ...prev,
        selectedServices: nextServices,
        servicesSubtotal,
      };
    });
  }, [bookingData.venueType, offerings]);

  const [settings, setSettings] = useState<OnlineBookingSettings>({
    staff_selection_mode: "client_chooses",
    require_auth_step: "checkout",
    min_notice_minutes: 0,
    max_advance_days: 365,
  });

  const [slots, setSlots] = useState<Array<{ start: string; end: string; staff_id?: string; is_available?: boolean }>>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [holdId, setHoldId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return sessionStorage.getItem("beautonomi_hold_id") || null; } catch { return null; }
  });
  /** Mirrors `/book/continue` countdown while the auth gate is open (from latest hold create + session restore). */
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const e = sessionStorage.getItem("beautonomi_hold_expires_at");
      return e?.trim() || null;
    } catch {
      return null;
    }
  });
  const [gateOpen, setGateOpen] = useState(false);
  const [preAuthGateOpen, setPreAuthGateOpen] = useState(false);
  const [creatingHold, setCreatingHold] = useState(false);
  const [providerForms, setProviderForms] = useState<ProviderForm[]>([]);
  const [bookingCustomDefinitions, setBookingCustomDefinitions] = useState<Array<{ id: string; name: string; label: string; field_type: string; is_required: boolean }>>([]);
  const [cancellationPolicy, setCancellationPolicy] = useState<CancellationPolicy | null>(null);
  const [groupBookingSettings, setGroupBookingSettings] = useState<GroupBookingSettings>({
    enabled: false,
    maxGroupSize: 10,
    excludedServices: [],
    enabledLocations: [],
  });

  const showStaffStep = settings.staff_selection_mode === "client_chooses";
  const showGroupStep = groupBookingSettings.enabled === true;
  const authBeforeSlots = settings.require_auth_step === "before_time_selection";

  /** Avoid null staff + ambiguous slots: default to “any” so availability + hold use anyone-mode (matches StepStaff). */
  useEffect(() => {
    if (step !== "staff" || !showStaffStep) return;
    if (bookingData.selectedStaff != null) return;
    updateData({
      selectedStaff: {
        id: "any",
        name: "Any Professional",
        role: "Fastest availability",
      },
    });
  }, [step, showStaffStep, bookingData.selectedStaff, updateData]);

  useEffect(() => {
    if (isReady && step === "review" && provider?.id && !checkoutTrackedRef.current) {
      checkoutTrackedRef.current = true;
      track(EVENT_CHECKOUT_START, { provider_id: provider.id, provider_name: provider.business_name });
    }
  }, [isReady, step, provider?.id, provider?.business_name, track]);

  // Derive provider categories from offerings (unique by provider_category_id)
  const categories: ProviderCategoryOption[] = (() => {
    const seen = new Map<string, ProviderCategoryOption>();
    for (const o of offerings as (ServiceOption & { provider_categories?: { id: string; name: string; description?: string | null; display_order?: number; color?: string | null }; master_service_name?: string })[]) {
      const cat = (o as any).provider_categories;
      if (cat?.id && cat?.name) {
        if (!seen.has(cat.id)) {
          seen.set(cat.id, { id: cat.id, name: cat.name, description: cat.description ?? null, color: cat.color ?? null, display_order: cat.display_order ?? 0 });
        }
      } else {
        if (!seen.has("_other")) {
          seen.set("_other", { id: "_other", name: "Other Services", description: null, display_order: 999 });
        }
      }
    }
    const list = Array.from(seen.values()).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    if (list.length === 0) return [{ id: "_all", name: "Services", description: "All services" }];
    return list;
  })();

  // Offerings filtered by selected category for the services step
  const offeringsForStep = (() => {
    if (!bookingData.selectedCategory) return offerings;
    const cat = bookingData.selectedCategory;
    if (cat.id === "_all") return offerings;
    if (cat.id === "_other") {
      return (offerings as any[]).filter((o) => !o.provider_categories?.id && !o.provider_category_id);
    }
    return (offerings as any[]).filter(
      (o) => o.provider_categories?.id === cat.id || o.provider_category_id === cat.id || o.master_service_name === cat.name
    );
  })();

  /** `?package=` deep link: bundle applied and line items still match — skip redundant category + packages UI. */
  const packageQueryId = queryParams.package?.trim() ?? "";
  const prefillFromPackageDeepLink =
    Boolean(
      packageQueryId &&
        bookingData.selectedPackage &&
        bookingData.selectedPackage.id === packageQueryId &&
        bookingData.selectedServices.length > 0 &&
        cartMatchesCatalogPackage(
          bookingData.selectedServices,
          bookingData.selectedProducts ?? [],
          bookingData.selectedPackage
        )
    );

  const serviceDeepLinkParam = (queryParams.service?.trim() || queryParams.services?.trim()) ?? "";
  const hasServiceDeepLinkPrefill =
    Boolean(serviceDeepLinkParam) &&
    bookingData.selectedServices.length > 0 &&
    bookingData.selectedCategory != null;

  const handleVenueNext = () => {
    if (prefillFromPackageDeepLink && bookingData.selectedCategory) {
      setStep("services");
      return;
    }
    if (hasServiceDeepLinkPrefill) {
      setStep("services");
      return;
    }
    setStep("category");
  };

  /**
   * Auto-skip the venue step when an express link has prefilled services + category.
   * Without this, customers following an express link always see the venue selection
   * screen even though location type is already determined from the link.
   */
  useEffect(() => {
    if (step !== "venue") return;
    if (!serviceDeepLinkParam) return;
    if (isLoading) return;
    if (bookingData.selectedServices.length === 0) return;
    if (!bookingData.selectedCategory) return;
    setStep("services");
  }, [
    step,
    serviceDeepLinkParam,
    isLoading,
    bookingData.selectedServices.length,
    bookingData.selectedCategory,
  ]);

  /** If async prefill completes while user is still on category, jump to services. */
  useEffect(() => {
    if (step !== "category") return;
    if (!packageQueryId || !bookingData.selectedPackage || bookingData.selectedPackage.id !== packageQueryId) return;
    if (!cartMatchesCatalogPackage(bookingData.selectedServices, bookingData.selectedProducts ?? [], bookingData.selectedPackage))
      return;
    if (!bookingData.selectedCategory) return;
    setStep("services");
  }, [
    step,
    packageQueryId,
    bookingData.selectedPackage,
    bookingData.selectedServices,
    bookingData.selectedCategory,
  ]);

  /** Same as package: when ?service= / ?services= prefill lands after venue, skip category so selection stays aligned with the link. */
  useEffect(() => {
    if (step !== "category") return;
    if (!serviceDeepLinkParam) return;
    if (bookingData.selectedServices.length === 0) return;
    if (!bookingData.selectedCategory) return;
    setStep("services");
  }, [
    step,
    serviceDeepLinkParam,
    bookingData.selectedServices.length,
    bookingData.selectedCategory?.id,
  ]);

  // Auto-select single category when only one exists
  useEffect(() => {
    if (step === "category" && categories.length === 1 && !bookingData.selectedCategory) {
      updateDataRef.current({ selectedCategory: categories[0] });
    }
  }, [step, categories, bookingData.selectedCategory]);

  /**
   * When the user arrives at the "services" step with pre-selected services but no selectedCategory
   * (e.g. navigating directly from the partner profile without a URL ?service= param), infer and
   * apply the correct category so the offerings list is filtered correctly.
   */
  useEffect(() => {
    if (step !== "services") return;
    if (bookingData.selectedCategory) return;
    if (bookingData.selectedServices.length === 0) return;
    if (offerings.length === 0) return;
    const firstId = bookingData.selectedServices[0]?.offering_id;
    if (!firstId) return;
    const matchingOffering = (offerings as any[]).find(
      (o) => o.id === firstId || o.provider_category_id === firstId
    );
    if (!matchingOffering) return;
    const catId = matchingOffering.provider_categories?.id ?? matchingOffering.provider_category_id;
    if (!catId) return;
    const cat = categories.find((c) => c.id === catId);
    if (cat) {
      updateDataRef.current({ selectedCategory: cat });
    }
  }, [step, bookingData.selectedCategory, bookingData.selectedServices, offerings, categories]);

  useEffect(() => {
    setBookingData((prev) => {
      const addonsSubtotal = prev.selectedAddonIds.reduce((sum, id) => {
        const a = addons.find((x) => x.id === id);
        return sum + (a ? a.price : 0);
      }, 0);
      return { ...prev, addonsSubtotal };
    });
  }, [addons, bookingData.selectedAddonIds]);

  // Group booking: slot duration = max(primary duration, each participant's total duration) so one time slot fits everyone
  useEffect(() => {
    if (!bookingData.isGroupBooking || !bookingData.groupParticipants?.length) return;
    const primaryDur = bookingData.selectedServices.reduce((s, e) => s + e.duration_minutes, 0);
    let maxDur = primaryDur;
    for (const p of bookingData.groupParticipants) {
      const pDur = p.service_ids.reduce(
        (sum, id) => sum + (offerings.find((o) => o.id === id)?.duration_minutes ?? 0),
        0
      );
      maxDur = Math.max(maxDur, pDur);
    }
    setBookingData((prev) => (prev.totalDurationMinutes === maxDur ? prev : { ...prev, totalDurationMinutes: maxDur }));
  }, [
    bookingData.isGroupBooking,
    bookingData.groupParticipants,
    bookingData.selectedServices,
    offerings,
  ]);

  useEffect(() => {
    const load = async () => {
      try {
        const [offeringsRes, staffRes, providerRes, settingsRes, packagesRes] = await Promise.all([
          fetcher.get<{ data: ServiceOption[] }>(`/api/public/providers/${provider.slug}/offerings`),
          fetcher
            .get<{ data: StaffOption[] }>(`/api/public/providers/${provider.slug}/staff`)
            .catch(() => ({ data: [] })),
          fetcher.get<{ data: { locations?: LocationOption[] } }>(`/api/public/providers/${provider.slug}`),
          fetcher.get<{ data: OnlineBookingSettings }>(`/api/public/providers/${provider.slug}/online-booking-settings`).catch(() => ({ data: null })),
          fetcher.get<{ data: PackageOption[] }>(`/api/public/providers/${provider.slug}/packages`).catch(() => ({ data: [] })),
        ]);

        const rawOfferings = (offeringsRes as any)?.data ?? offeringsRes ?? [];
        const list = Array.isArray(rawOfferings) ? rawOfferings : [];
        const baseServices = list.filter(
          (o: any) => o.service_type !== "addon" && !o.parent_service_id
        );
        setOfferings(baseServices);

        const staffList = (staffRes as any)?.data ?? staffRes ?? [];
        const staffArray = Array.isArray(staffList) ? staffList : [];
        setStaff(staffArray);

        // Inject noindex if provider opted out of search engine indexing
        if ((providerRes as any)?.data?.seo_indexable === false) {
          let robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
          if (!robotsMeta) {
            robotsMeta = document.createElement("meta");
            robotsMeta.name = "robots";
            document.head.appendChild(robotsMeta);
          }
          robotsMeta.content = "noindex, nofollow";
        }

        let locs = (providerRes as any)?.data?.locations ?? [];
        if (user?.id && Array.isArray(locs) && locs.length > 0) {
          const contact = await fetchProviderContactDisclosure(provider.slug);
          if (contact?.locations?.length) {
            const byId = new Map(contact.locations.map((l) => [l.id, l]));
            locs = locs.map((l: LocationOption) => ({ ...l, ...byId.get(l.id) }));
          }
        }
        setLocations(Array.isArray(locs) ? locs : []);
        const salonLocs = Array.isArray(locs) ? locs.filter((l: any) => (l.location_type || "salon") === "salon") : [];
        /** Express links pass location_type=at_home; must not be overwritten when provider also has salon locations. */
        const expressAtHome = queryParams.location_type === "at_home";
        const treatAsAtHomeForPricing = expressAtHome || salonLocs.length === 0;

        if (expressAtHome) {
          setBookingData((prev) => ({
            ...prev,
            venueType: "at_home",
            selectedLocation: null,
          }));
        } else if (salonLocs.length > 0) {
          const primary = salonLocs.find((l: LocationOption) => l.is_primary) ?? salonLocs[0];
          const fromQuery = queryParams.location
            ? salonLocs.find((l: any) => l.id === queryParams.location || (l as any).slug === queryParams.location)
            : null;
          setBookingData((prev) => ({
            ...prev,
            venueType: "at_salon",
            selectedLocation: fromQuery ?? primary,
          }));
        } else {
          setBookingData((prev) => ({
            ...prev,
            venueType: "at_home",
            selectedLocation: null,
          }));
        }

        const s = (settingsRes as any)?.data;
        if (s) setSettings(s);

        const pkgList = (packagesRes as any)?.data ?? packagesRes ?? [];
        setPackages(Array.isArray(pkgList) ? pkgList : []);

        // Build the variant map from the flat offerings list first — this avoids N separate API
        // calls and is always available since the /offerings endpoint already returns all rows.
        const embeddedVariantMap: Record<string, ServiceVariant[]> = {};
        list.forEach((o: any) => {
          if (o.parent_service_id && (o.service_type === "variant" || o.variant_name)) {
            if (!embeddedVariantMap[o.parent_service_id]) embeddedVariantMap[o.parent_service_id] = [];
            embeddedVariantMap[o.parent_service_id].push({
              id: o.id,
              title: o.title ?? o.variant_name ?? "",
              variant_name: o.variant_name ?? o.title ?? "",
              description: o.description ?? null,
              price: Number(o.price) || 0,
              // The separate variants API returns 'duration'; the offerings list uses 'duration_minutes'.
              duration: o.duration_minutes ?? o.duration ?? 60,
              currency: o.currency ?? tenantCurrency,
              variant_sort_order: o.variant_sort_order ?? 0,
            } as ServiceVariant);
          }
        });
        // Sort each group by variant_sort_order then price
        Object.values(embeddedVariantMap).forEach((arr) =>
          arr.sort((a: any, b: any) => (a.variant_sort_order - b.variant_sort_order) || (a.price - b.price))
        );

        // Also fire the dedicated variants API for any parent whose variant list was empty in the
        // flat response (e.g. pagination gaps), but skip ones we already have.
        const needsVariantFetch = baseServices.filter((svc: any) => !embeddedVariantMap[svc.id]);
        const fetchedMap: Record<string, ServiceVariant[]> = {};
        if (needsVariantFetch.length > 0) {
          const variantResults = await Promise.all(
            needsVariantFetch.map((svc: any) =>
              fetcher.get(`/api/public/providers/${provider.slug}/services/${svc.id}/variants`).catch(() => ({ data: { variants: [] } }))
            )
          );
          needsVariantFetch.forEach((svc: any, i: number) => {
            const res = variantResults[i] as any;
            const vs: any[] = res?.data?.variants ?? res?.variants ?? [];
            if (vs.length > 0) fetchedMap[svc.id] = vs;
          });
        }

        const map: Record<string, ServiceVariant[]> = { ...embeddedVariantMap, ...fetchedMap };
        setVariantsByServiceId(map);

        const flatMenu = buildProviderServicesLikeMenu(baseServices, map, tenantCurrency);

        if (queryParams.services) {
          const rawIds = queryParams.services.split(",").map((id) => id.trim()).filter(Boolean);
          const normalized = normalizeDeepLinkOfferingIds(rawIds, baseServices);
          const lines = resolvePackageOfferingsFromFlatMenu(normalized, flatMenu, tenantCurrency, "skip");
          const entries = lines?.length
            ? resolvedLinesToBookingEntries(lines, baseServices, map, treatAsAtHomeForPricing, tenantCurrency)
            : [];
          if (entries.length > 0) {
            const inferred = inferCategoryForPreselected(entries, baseServices, map);
            setBookingData((prev) => ({
              ...prev,
              selectedPackage: null,
              selectedServices: entries,
              selectedProducts: [],
              selectedCategory: inferred ?? prev.selectedCategory,
              servicesSubtotal: entries.reduce((sum, e) => sum + e.price, 0),
              totalDurationMinutes: entries.reduce((sum, e) => sum + e.duration_minutes, 0),
              currency: entries[0]?.currency ?? prev.currency ?? tenantCurrency,
            }));
          }
        } else if (queryParams.service) {
          const normalized = normalizeDeepLinkOfferingIds([queryParams.service], baseServices);
          const lines = resolvePackageOfferingsFromFlatMenu(normalized, flatMenu, tenantCurrency, "strict");
          const entries = lines?.length
            ? resolvedLinesToBookingEntries(lines, baseServices, map, treatAsAtHomeForPricing, tenantCurrency)
            : [];
          if (entries.length > 0) {
            const inferred = inferCategoryForPreselected(entries, baseServices, map);
            setBookingData((prev) => ({
              ...prev,
              selectedPackage: null,
              selectedServices: entries,
              selectedProducts: [],
              selectedCategory: inferred ?? prev.selectedCategory,
              servicesSubtotal: entries.reduce((sum, e) => sum + e.price, 0),
              totalDurationMinutes: entries.reduce((sum, e) => sum + e.duration_minutes, 0),
              currency: entries[0]?.currency ?? prev.currency ?? tenantCurrency,
            }));
          }
        } else if (queryParams.package?.trim()) {
          const pkgId = queryParams.package.trim();
          const pkgListArr = Array.isArray(pkgList) ? pkgList : [];
          const pkg = pkgListArr.find((p: { id?: string }) => p.id === pkgId) as
            | {
                id: string;
                name?: string;
                price?: number;
                currency?: string;
                services?: Array<{ id: string; title?: string; duration_minutes?: number }>;
                items?: Array<{ type?: string; id?: string; title?: string; duration_minutes?: number }>;
              }
            | undefined;
          if (pkg) {
            const svcItems =
              pkg.services && pkg.services.length > 0
                ? pkg.services
                : (pkg.items ?? []).filter((x) => x.type === "service" || !x.type);
            const ids = svcItems.map((it) => it.id).filter(Boolean) as string[];
            const normalizedIds = normalizeDeepLinkOfferingIds(ids, baseServices);
            let lines = resolvePackageOfferingsFromFlatMenu(normalizedIds, flatMenu, tenantCurrency, "strict");
            if (!lines?.length && normalizedIds.length > 0) {
              lines = resolvePackageOfferingsFromFlatMenu(normalizedIds, flatMenu, tenantCurrency, "skip");
            }
            const entries = lines?.length
              ? resolvedLinesToBookingEntries(lines, baseServices, map, treatAsAtHomeForPricing, tenantCurrency)
              : [];
            if (entries.length > 0) {
              const inferred = inferCategoryForPreselected(entries, baseServices, map);
              const subtotal =
                typeof pkg.price === "number" ? pkg.price : entries.reduce((sum, e) => sum + e.price, 0);
              let selectedProducts: BookingData["selectedProducts"] = [];
              const hasProductLines = (pkg.items ?? []).some((x: { type?: string }) => x.type === "product");
              if (hasProductLines) {
                try {
                  const pr = await fetcher.get<unknown>(`/api/public/providers/${provider.slug}/products`);
                  const raw = (pr as { data?: unknown })?.data ?? pr ?? [];
                  const list = Array.isArray(raw) ? raw : [];
                  selectedProducts = buildRetailCartRowsFromPublicPackage(
                    pkg as { items?: Array<{ type?: string; id?: string; quantity?: number }> },
                    list as PublicProductCatalogRow[],
                    tenantCurrency
                  );
                } catch {
                  /* ignore — customer can still complete checkout without prefilled retail */
                }
              }
              packageProductLineIdsRef.current = new Set(selectedProducts.map((p) => p.id));
              setBookingData((prev) => ({
                ...prev,
                selectedPackage: pkg as unknown as BookingData["selectedPackage"],
                selectedServices: entries,
                selectedProducts,
                selectedCategory: inferred ?? prev.selectedCategory,
                servicesSubtotal: subtotal,
                totalDurationMinutes: entries.reduce((sum, e) => sum + e.duration_minutes, 0),
                currency: entries[0]?.currency ?? pkg.currency ?? prev.currency ?? tenantCurrency,
              }));
            }
          }
        }

        if (queryParams.date) {
          const d = coerceSelectedDate(queryParams.date);
          if (d) {
            setBookingData((prev) => ({ ...prev, selectedDate: d, selectedSlot: null, selectedResourceIds: [] }));
          }
        }
        if (queryParams.anyone || s?.staff_selection_mode === "anyone_default") {
          setBookingData((prev) => ({ ...prev, selectedStaff: { id: "any", name: "No preference", role: "Anyone available" } }));
        } else if (queryParams.staff && staffArray.length > 0) {
          const st = staffArray.find((s: StaffOption) => s.id === queryParams.staff);
          if (st) setBookingData((prev) => ({ ...prev, selectedStaff: st }));
        }

        // Group booking settings (for group step)
        const groupRes = await fetcher
          .get<{ data?: { enabled?: boolean; maxGroupSize?: number; excludedServices?: string[]; enabledLocations?: string[] } }>(
            `/api/public/providers/${provider.slug}/group-booking-settings`
          )
          .catch(() => ({ data: { enabled: false, maxGroupSize: 10, excludedServices: [], enabledLocations: [] } }));
        const g = (groupRes as any)?.data ?? groupRes ?? {};
        setGroupBookingSettings({
          enabled: g.enabled === true,
          maxGroupSize: typeof g.maxGroupSize === "number" ? g.maxGroupSize : 10,
          excludedServices: Array.isArray(g.excludedServices) ? g.excludedServices : [],
          enabledLocations: Array.isArray(g.enabledLocations) ? g.enabledLocations : [],
        });

        // Load provider forms and booking custom field definitions for intake step
        const [formsRes, customRes] = await Promise.all([
          fetcher.get<{ data?: { forms?: ProviderForm[] }; forms?: ProviderForm[] }>(`/api/public/provider-forms?provider_id=${provider.id}`).catch(() => ({ data: { forms: [] } })),
          fetcher.get<{ data?: { definitions?: Array<{ id: string; name: string; label: string; field_type: string; is_required: boolean }> } }>("/api/custom-fields/definitions?entity_type=booking").catch(() => ({ data: { definitions: [] } })),
        ]);
        const formsData = (formsRes as { data?: { forms?: ProviderForm[] }; forms?: ProviderForm[] })?.data ?? formsRes;
        const formsList =
          Array.isArray((formsData as { forms?: ProviderForm[] }).forms)
            ? (formsData as { forms: ProviderForm[] }).forms
            : Array.isArray((formsData as { data?: { forms?: ProviderForm[] } }).data?.forms)
              ? (formsData as { data: { forms: ProviderForm[] } }).data.forms
              : [];
        setProviderForms(formsList);
        const defs = (customRes as { data?: { definitions?: Array<{ id: string; name: string; label: string; field_type: string; is_required: boolean }> } })?.data?.definitions ?? [];
        setBookingCustomDefinitions(Array.isArray(defs) ? defs : []);
      } catch (e) {
        toast.error(e instanceof FetchError ? e.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [
    provider.slug,
    provider.id,
    queryParams.service,
    queryParams.services,
    queryParams.staff,
    queryParams.anyone,
    queryParams.location,
    queryParams.location_type,
    queryParams.date,
    queryParams.package,
    user?.id,
  ]);

  // Load cancellation policy when we have provider and venue (for review step)
  useEffect(() => {
    if (!provider.id || step !== "review") return;
    const locationType = bookingData.venueType === "at_home" ? "at_home" : "at_salon";
    fetcher
      .get<{ data?: CancellationPolicy[] }>(`/api/public/cancellation-policy?provider_id=${provider.id}&location_type=${locationType}`)
      .then((res) => {
        const data = (res as { data?: CancellationPolicy[] })?.data;
        if (data && data.length > 0) setCancellationPolicy(data[0]);
        else setCancellationPolicy(null);
      })
      .catch(() => setCancellationPolicy(null));
  }, [provider.id, bookingData.venueType, step]);

  // Fetch addons for every selected service and merge (dedupe by id) so multi-service bookings show all applicable addons
  const serviceIdsForAddons = bookingData.selectedServices
    .map((s) => s.offering_id ?? (s as any).id)
    .filter(Boolean) as string[];
  useEffect(() => {
    if (!provider.slug || serviceIdsForAddons.length === 0) {
      setAddons([]);
      return;
    }
    Promise.all(
      serviceIdsForAddons.map((serviceId) =>
        fetcher
          .get<{ data?: { all_addons?: AddonOption[] }; all_addons?: AddonOption[] }>(
            `/api/public/providers/${provider.slug}/services/${serviceId}/addons`
          )
          .then((res) => {
            const data = res as any;
            return data?.data?.all_addons ?? data?.all_addons ?? data?.data ?? [];
          })
          .catch(() => [] as AddonOption[])
      )
    ).then((results) => {
      const byId = new Map<string, AddonOption>();
      for (const list of results) {
        const arr = Array.isArray(list) ? list : [];
        for (const a of arr) {
          if (a?.id && !byId.has(a.id)) byId.set(a.id, a);
        }
      }
      setAddons(Array.from(byId.values()));
    });
  }, [provider.slug, serviceIdsForAddons.join(",")]);

  useEffect(() => {
    if (appliedQueryAddonsRef.current) return;
    const raw = queryParams.addons?.trim();
    if (!raw) return;
    if (addons.length === 0) return;
    const want = raw.split(",").map((x) => x.trim()).filter(Boolean);
    const valid = want.filter((id) => addons.some((a) => a.id === id));
    if (valid.length === 0) return;
    appliedQueryAddonsRef.current = true;
    updateData({ selectedAddonIds: valid });
  }, [queryParams.addons, addons, updateData]);

  // Total slot span = sum(durations) + sum(buffers) so slots match hold/booking block. For group booking use max across primary and all participants.
  const slotParams = (() => {
    const offeringsList = offerings as Array<{ id: string; duration_minutes?: number; buffer_minutes?: number }>;
    const addonDurationMinutes = bookingData.selectedAddonIds.reduce((total, addonId) => {
      const addon = addons.find((item) => item.id === addonId);
      return total + Math.max(0, Number(addon?.duration_minutes ?? 0) || 0);
    }, 0);
    const spanForOfferingIds = (ids: string[]) => {
      let total = 0;
      for (let i = 0; i < ids.length; i++) {
        const { duration, buffer } = resolveOfferingDurationBufferForSlot(
          ids[i],
          offeringsList,
          variantsByServiceId
        );
        total += duration + buffer;
      }
      return total;
    };
    const primaryIds = bookingData.selectedServices.map((s) => s.offering_id || (s as any).id).filter(Boolean);
    const primarySpan = primaryIds.length
      ? spanForOfferingIds(primaryIds as string[])
      : bookingData.selectedServices.reduce((s, e) => s + ((e as any).duration_minutes ?? 60), 0) + DEFAULT_SLOT_BUFFER_MINUTES;
    if (!bookingData.isGroupBooking || !bookingData.groupParticipants?.length) {
      const lastId = primaryIds.length ? (primaryIds[primaryIds.length - 1] as string) : null;
      const lastBuf = lastId
        ? resolveOfferingDurationBufferForSlot(lastId, offeringsList, variantsByServiceId).buffer
        : DEFAULT_SLOT_BUFFER_MINUTES;
      const durationMinutes =
        primaryIds.length ? primarySpan - lastBuf : primarySpan - DEFAULT_SLOT_BUFFER_MINUTES;
      return { durationMinutes: durationMinutes || 60, bufferMinutes: lastBuf, addonDurationMinutes };
    }
    let maxSpan = primarySpan;
    for (const p of bookingData.groupParticipants) {
      const ids = p.service_ids ?? (p as any).serviceIds ?? [];
      if (ids.length) maxSpan = Math.max(maxSpan, spanForOfferingIds(ids));
    }
    return { durationMinutes: maxSpan || 60, bufferMinutes: 0, addonDurationMinutes };
  })();

  const primaryOfferingIds = useMemo(
    () =>
      bookingData.selectedServices
        .map((s) => s.offering_id || (s as { id?: string }).id)
        .filter(Boolean) as string[],
    [bookingData.selectedServices]
  );

  const multiServiceIdsParam =
    primaryOfferingIds.length >= 2
      ? `&service_ids=${encodeURIComponent(primaryOfferingIds.join(","))}`
      : "";

  const excludeHoldParam = holdId
    ? `&excludeHoldId=${encodeURIComponent(holdId)}`
    : "";

  const travelBufferParam =
    bookingData.venueType === "at_home"
      ? `&travel_buffer_minutes=${HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_BUFFER_MINUTES}`
      : "";
  const addonDurationParam =
    slotParams.addonDurationMinutes > 0
      ? `&addon_duration_minutes=${encodeURIComponent(String(slotParams.addonDurationMinutes))}`
      : "";

  useEffect(() => {
    const day = coerceSelectedDate(bookingData.selectedDate);
    if (step !== "schedule" || !day || bookingData.selectedServices.length === 0) return;
    const staffId = bookingData.selectedStaff?.id === "any" ? "any" : bookingData.selectedStaff?.id ?? "any";
    // §Booking-slot-audit 2026-05: send the provider business date so cross-TZ
    // customers don't request the wrong salon day near midnight boundaries.
    const dateStr = formatBusinessDayYYYYMMDD(day, provider.timezone ?? null);
    const { durationMinutes, bufferMinutes } = slotParams;
    const serviceId = bookingData.selectedServices[0].offering_id;
    setLoadingSlots(true);
    const url = `/api/public/providers/${provider.slug}/availability?date=${dateStr}&service_id=${serviceId}&staff_id=${staffId}&duration_minutes=${durationMinutes}&buffer_minutes=${bufferMinutes}&location_id=${bookingData.selectedLocation?.id ?? ""}${multiServiceIdsParam}${excludeHoldParam}${travelBufferParam}${addonDurationParam}`;
    fetcher
      .get<{ data: any[] }>(url, AVAILABILITY_FETCH_OPTS)
      .then((res) => {
        const raw = (res as any)?.data?.slots ?? (res as any)?.data ?? res ?? [];
        const list = Array.isArray(raw) ? raw : [];
        setSlots(
          list.map((s: any) => ({
            start: s.start ?? s.time,
            end: s.end ?? s.start ?? s.time,
            staff_id: s.staff_id,
            is_available: s.is_available !== false,
            available_staff_ids: Array.isArray(s.available_staff_ids) ? s.available_staff_ids : undefined,
          }))
        );
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [
    step,
    bookingData.selectedDate,
    bookingData.selectedServices,
    bookingData.selectedStaff,
    bookingData.selectedLocation,
    provider.slug,
    slotParams.durationMinutes,
    slotParams.bufferMinutes,
    multiServiceIdsParam,
    excludeHoldParam,
    travelBufferParam,
    addonDurationParam,
    variantsByServiceId,
  ]);

  /** When entering the schedule step with no date, pick the earliest day that has a future bookable slot. */
  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = step;
    if (step !== "schedule") return;
    if (bookingData.selectedDate != null) return;
    const enteredSchedule = prev !== "schedule";
    if (!enteredSchedule) return;
    if (bookingData.selectedServices.length === 0) return;
    const serviceId = bookingData.selectedServices[0]?.offering_id;
    if (!serviceId) return;

    let cancelled = false;
    (async () => {
      const staffId = bookingData.selectedStaff?.id === "any" ? "any" : bookingData.selectedStaff?.id ?? "any";
      const { durationMinutes, bufferMinutes } = slotParams;
      const now = new Date();
      const tzForDates = provider.timezone ?? null;
      const dateStr = (d: Date) => formatBusinessDayYYYYMMDD(d, tzForDates);
      for (let offset = 0; offset < Math.min(14, PUBLIC_BOOKING_MAX_ADVANCE_DAYS); offset++) {
        // §Booking-slot-audit 2026-05: walk forward by provider business days.
        const d = startOfBusinessDayLocalDate(tzForDates, offset);
        try {
          const url = `/api/public/providers/${provider.slug}/availability?date=${dateStr(d)}&service_id=${serviceId}&staff_id=${staffId}&duration_minutes=${durationMinutes}&buffer_minutes=${bufferMinutes}&location_id=${bookingData.selectedLocation?.id ?? ""}${multiServiceIdsParam}${excludeHoldParam}${travelBufferParam}${addonDurationParam}`;
          const res = await fetcher.get<{ data: any[] }>(url, AVAILABILITY_FETCH_OPTS);
          if (cancelled) return;
          const raw = (res as any)?.data?.slots ?? (res as any)?.data ?? [];
          const list = Array.isArray(raw) ? raw : [];
          const isToday = offset === 0;
          const hasBookable = list.some((s: any) => {
            if (s.is_available === false) return false;
            const start = s.start ?? s.time;
            if (!start) return false;
            if (isToday) return new Date(start).getTime() > now.getTime();
            return true;
          });
          if (hasBookable) {
            if (cancelled) return;
            setBookingData((prev) => ({ ...prev, selectedDate: d, selectedSlot: null, selectedResourceIds: [] }));
            return;
          }
        } catch {
          // try next day
        }
      }
      if (!cancelled) {
        const fallback = startOfBusinessDayLocalDate(provider.timezone ?? null);
        setBookingData((prev) => ({ ...prev, selectedDate: fallback, selectedSlot: null, selectedResourceIds: [] }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    step,
    bookingData.selectedDate,
    bookingData.selectedServices,
    bookingData.selectedStaff,
    bookingData.selectedLocation,
    provider.slug,
    provider.timezone,
    slotParams,
    multiServiceIdsParam,
    excludeHoldParam,
    travelBufferParam,
    addonDurationParam,
  ]);

  const stepsOrder: BookingStep[] = (() => {
    const base: BookingStep[] = ["venue", "category", "services", "addons"];
    if (showGroupStep) base.push("group");
    if (showStaffStep) base.push("staff");
    base.push("schedule", "resources", "intake", "review");
    return base;
  })();

  const goBack = () => {
    const i = stepsOrder.indexOf(step);
    if (i > 0) setStep(stepsOrder[i - 1]);
  };

  const handleNextAvailable = async () => {
    const tzForDates = provider.timezone ?? null;
    const dateStr = (d: Date) => formatBusinessDayYYYYMMDD(d, tzForDates);
    const staffId = bookingData.selectedStaff?.id === "any" ? "any" : bookingData.selectedStaff?.id ?? "any";
    const { durationMinutes, bufferMinutes } = slotParams;
    const serviceId = bookingData.selectedServices[0]?.offering_id;
    if (!serviceId) return;
    const now = new Date();
    for (let offset = 0; offset < Math.min(14, PUBLIC_BOOKING_MAX_ADVANCE_DAYS); offset++) {
      // §Booking-slot-audit 2026-05: walk by provider business days, not device-local.
      const d = startOfBusinessDayLocalDate(tzForDates, offset);
      const url = `/api/public/providers/${provider.slug}/availability?date=${dateStr(d)}&service_id=${serviceId}&staff_id=${staffId}&duration_minutes=${durationMinutes}&buffer_minutes=${bufferMinutes}&location_id=${bookingData.selectedLocation?.id ?? ""}${multiServiceIdsParam}${excludeHoldParam}${travelBufferParam}${addonDurationParam}`;
      const res = await fetcher.get<{ data: any[] }>(url, AVAILABILITY_FETCH_OPTS).catch(() => ({ data: [] }));
      const raw = (res as any)?.data?.slots ?? (res as any)?.data ?? [];
      const list = Array.isArray(raw) ? raw : [];
      const isToday = offset === 0;
      const available = list.filter((s: any) => {
        if (s.is_available === false) return false;
        const start = s.start ?? s.time;
        if (!start) return false;
        if (isToday) return new Date(start).getTime() > now.getTime();
        return true;
      });
      if (available.length > 0) {
        setBookingData((prev) => ({ ...prev, selectedDate: d, selectedSlot: null, selectedResourceIds: [] }));
        setSlots(
          list.map((s: any) => ({
            start: s.start ?? s.time,
            end: s.end ?? s.start ?? s.time,
            staff_id: s.staff_id,
            is_available: s.is_available !== false,
            available_staff_ids: Array.isArray(s.available_staff_ids) ? s.available_staff_ids : undefined,
          }))
        );
        setStep("schedule");
        return;
      }
    }
    toast.error("No available slots in the next two weeks");
  };

  const handleConfirm = async () => {
    if (bookingData.selectedServices.length === 0) return;
    if (!bookingData.selectedSlot || !bookingData.selectedDate) {
      toast.error("Please choose a date and time to continue.");
      return;
    }
    // Only require explicit acceptance when the policy has material terms to acknowledge.
    // Matches StepReview's gate (cancellationRequiresAck) so the confirm flow stays consistent.
    const requiresPolicyAck = cancellationRequiresAck(
      cancellationPolicy
        ? {
            cancellationWindowHours: cancellationPolicy.hours_before_cutoff,
            graceWindowMinutes: cancellationPolicy.grace_window_minutes,
            lateRefundPercentage:
              cancellationPolicy.late_refund_percentage ??
              cancellationPolicy.refund_percentage ??
              (cancellationPolicy.late_cancellation_type === "full_refund"
                ? 100
                : cancellationPolicy.late_cancellation_type === "partial_refund"
                  ? 50
                  : 0),
            noShowFeeEnabled: cancellationPolicy.no_show_fee_enabled,
            noShowFeeAmount: cancellationPolicy.no_show_fee_amount,
          }
        : null
    );
    if (requiresPolicyAck && bookingData.policyAccepted !== true) {
      toast.error("Please accept the cancellation policy to continue.");
      return;
    }
    const isAnyStaffSelection =
      !bookingData.selectedStaff ||
      bookingData.selectedStaff.id === "any" ||
      String(bookingData.selectedStaff.id).startsWith("provider-");
    // In "any staff" mode keep the hold flexible; the resolver will pick from preferredStaffIds.
    const rawStaffId = isAnyStaffSelection
      ? null
      : bookingData.selectedSlot.staff_id ?? bookingData.selectedStaff?.id ?? null;
    const staffIdForHold =
      !rawStaffId || rawStaffId === "any" || String(rawStaffId).startsWith("provider-") ? null : rawStaffId;
    if (bookingData.venueType === "at_home" && (!bookingData.atHomeAddress.line1?.trim() || !bookingData.atHomeAddress.city?.trim())) {
      toast.error("Please enter your address for at-home booking");
      return;
    }

    const refCode = queryParams.ref?.trim();
    if (user?.id && refCode && !referralAttachSucceededRef.current) {
      try {
        await fetcher.post("/api/me/referrals/attach", { referral_code: refCode });
        referralAttachSucceededRef.current = true;
      } catch {
        // Non-blocking: booking can proceed if attach fails (invalid code, network, etc.).
      }
    }

    setCreatingHold(true);
    try {
      let addressPayload: {
        line1: string;
        city: string;
        country: string;
        line2?: string;
        state?: string;
        postal_code?: string;
        latitude?: number;
        longitude?: number;
      } | null = null;

      if (
        bookingData.venueType === "at_home" &&
        bookingData.atHomeAddress.line1?.trim() &&
        bookingData.atHomeAddress.city?.trim()
      ) {
        addressPayload = {
          line1: bookingData.atHomeAddress.line1.trim(),
          city: bookingData.atHomeAddress.city.trim(),
          country: bookingData.atHomeAddress.country || tenantRegionCode,
          line2: bookingData.atHomeAddress.line2,
          state: bookingData.atHomeAddress.state,
          postal_code: bookingData.atHomeAddress.postal_code,
        };
        const hasCoords =
          typeof bookingData.atHomeAddress.latitude === "number" &&
          typeof bookingData.atHomeAddress.longitude === "number" &&
          Math.abs(bookingData.atHomeAddress.latitude) > 0.0001 &&
          Math.abs(bookingData.atHomeAddress.longitude) > 0.0001;
        if (hasCoords) {
          addressPayload.latitude = bookingData.atHomeAddress.latitude!;
          addressPayload.longitude = bookingData.atHomeAddress.longitude!;
        } else {
          try {
            const query = [bookingData.atHomeAddress.line1.trim(), bookingData.atHomeAddress.city.trim(), bookingData.atHomeAddress.country || tenantRegionCode].filter(Boolean).join(", ");
            const geocodeRes = await fetcher.post<{ data: Array<{ center: [number, number] }> }>("/api/mapbox/geocode", { query, limit: 1 });
            const results = (geocodeRes as any)?.data ?? [];
            if (results.length > 0 && results[0].center) {
              const [lng, lat] = results[0].center;
              addressPayload.latitude = lat;
              addressPayload.longitude = lng;
            }
          } catch {
            // Proceed without coords; travel fee will be 0
          }
        }
      }

      const services = bookingData.selectedServices.map((s) => ({
        offering_id: s.offering_id,
        staff_id: staffIdForHold,
      }));
      const preferredStaffIds =
        isAnyStaffSelection
          ? Array.isArray(bookingData.selectedSlot?.available_staff_ids) &&
            bookingData.selectedSlot.available_staff_ids.length > 0
            ? bookingData.selectedSlot.available_staff_ids
            : bookingData.selectedSlot?.staff_id
              ? [bookingData.selectedSlot.staff_id]
              : undefined
          : undefined;
      const pkgForHold =
        bookingData.selectedPackage?.id?.trim() &&
        cartMatchesCatalogPackage(
          bookingData.selectedServices,
          bookingData.selectedProducts ?? [],
          bookingData.selectedPackage
        )
          ? bookingData.selectedPackage.id.trim()
          : undefined;
      // Wave 2.1 (audit 2026-04 final 100/100): UUIDv4 idempotency key
      // per slot-select so internal retries don't double-create the hold.
      const holdIdemKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === "x" ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });
      const res = await fetcher.post<{ data: { hold_id: string } }>("/api/public/booking-holds", {
        provider_id: provider.id,
        staff_id: staffIdForHold,
        services,
        start_at: bookingData.selectedSlot.start,
        end_at: bookingData.selectedSlot.end,
        location_type: bookingData.venueType,
        location_id: bookingData.venueType === "at_salon" ? bookingData.selectedLocation?.id ?? null : null,
        address: addressPayload,
        resource_ids: bookingData.selectedResourceIds?.length ? bookingData.selectedResourceIds : undefined,
        previous_hold_id: holdId || null,
        guest_fingerprint_hash: getGuestFingerprintHash(),
        preferred_staff_ids: preferredStaffIds,
        ...(bookingData.venueType === "at_home"
          ? { availability_travel_buffer_minutes: HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_BUFFER_MINUTES }
          : {}),
        ...(pkgForHold ? { package_id: pkgForHold } : {}),
      }, { headers: { "Idempotency-Key": holdIdemKey } });
      const env = res as { data?: { hold_id?: string; id?: string; expires_at?: string }; hold_id?: string; expires_at?: string };
      const payload = env.data;
      const id = payload?.hold_id ?? payload?.id ?? env.hold_id;
      const exp = payload?.expires_at ?? env.expires_at;
      if (id) {
        setHoldId(id);
        const expTrim = typeof exp === "string" && exp.trim() ? exp.trim() : null;
        setHoldExpiresAt(expTrim);
        try {
          sessionStorage.setItem("beautonomi_hold_id", id);
          if (expTrim) sessionStorage.setItem("beautonomi_hold_expires_at", expTrim);
          else sessionStorage.removeItem("beautonomi_hold_expires_at");
        } catch {}
        try {
          const tc = await fetch("/api/public/tenant-context", { credentials: "same-origin", cache: "no-store" }).then((r) =>
            r.json().catch(() => null)
          );
          const tid = (tc as { data?: { tenant?: { id?: string } } })?.data?.tenant?.id;
          if (tid) rememberBookingDraftTenant(tid);
          sessionStorage.setItem("beautonomi_booking_client", JSON.stringify(bookingData.client));
          sessionStorage.setItem("beautonomi_booking_addons", JSON.stringify(bookingData.selectedAddonIds));
          if (queryParams.promo?.trim()) {
            sessionStorage.setItem("beautonomi_booking_promotion_code", queryParams.promo.trim());
          }
          if (queryParams.gift_card?.trim()) {
            sessionStorage.setItem("beautonomi_booking_gift_card_code", queryParams.gift_card.trim());
          }
          const fromUrl = parseProductsQueryParam(queryParams.products);
          const fromPackage = toProductCartLines(bookingData.selectedProducts ?? []);
          const mergedCart = mergeExpressProductCartLines(fromUrl, fromPackage);
          if (mergedCart.length > 0) {
            sessionStorage.setItem("beautonomi_booking_product_cart", JSON.stringify(mergedCart));
          } else {
            sessionStorage.removeItem("beautonomi_booking_product_cart");
          }
          const pkg = bookingData.selectedPackage;
          if (pkg?.id?.trim() && cartMatchesCatalogPackage(bookingData.selectedServices, bookingData.selectedProducts ?? [], pkg)) {
            sessionStorage.setItem("beautonomi_booking_package_id", pkg.id.trim());
          } else {
            sessionStorage.removeItem("beautonomi_booking_package_id");
          }
          sessionStorage.setItem("beautonomi_booking_special_requests", bookingData.client.specialRequests || "");
          sessionStorage.setItem("beautonomi_booking_provider_form_responses", JSON.stringify(bookingData.provider_form_responses ?? {}));
          sessionStorage.setItem("beautonomi_booking_custom_field_values", JSON.stringify(bookingData.custom_field_values ?? {}));
          if (bookingData.isGroupBooking && bookingData.groupParticipants?.length) {
            sessionStorage.setItem(
              "beautonomi_booking_group",
              JSON.stringify({
                isGroupBooking: true,
                groupParticipants: bookingData.groupParticipants.map((p) => ({
                  name: p.name,
                  email: p.email ?? null,
                  phone: p.phone ?? null,
                  service_ids: p.service_ids,
                  notes: p.notes ?? null,
                })),
              })
            );
          } else {
            sessionStorage.removeItem("beautonomi_booking_group");
          }
        } catch {}
        if (authBeforeSlots && !user) {
          setPreAuthGateOpen(true);
        } else {
          setGateOpen(true);
        }
      } else {
        toast.error(getUserFacingMessage("SLOT_UNAVAILABLE", null, "Failed to secure slot. Please try another time."));
      }
    } catch (e) {
      const msg = e instanceof FetchError
        ? getUserFacingMessage(extractErrorCode(e), e.message, "Failed to secure slot")
        : "Failed to secure slot. Please try again.";
      toast.error(msg);
    } finally {
      setCreatingHold(false);
    }
  };

  const handleAuthComplete = () => {
    setGateOpen(false);
    setPreAuthGateOpen(false);
    if (holdId) router.push(`/book/continue?hold_id=${holdId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BOOKING_BG }}>
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const summarySteps: BookingStep[] = ["services", "addons", "staff", "schedule", "resources", "intake"];
  const showSummaryPill = summarySteps.includes(step) && bookingData.selectedServices.length > 0;

  const content = (
    <>
      <BookingNav
        currentStep={step}
        onBack={step !== "venue" ? goBack : undefined}
        showStepper={true}
        embed={embed}
        steps={stepsOrder}
        providerName={provider.business_name}
        platformName={PLATFORM_NAME}
        accentColor={BOOKING_ACCENT}
      />

      <main className={embed ? "mx-auto max-w-md px-4 py-6" : "flex-1 overflow-y-auto px-6 py-8 pb-8 min-h-0"}>
        {step === "category" && (
          <StepCategory
            categories={categories}
            selectedCategory={bookingData.selectedCategory}
            onSelectCategory={(category) => updateData({ selectedCategory: category })}
            onNext={() => setStep("services")}
          />
        )}
        {step === "venue" && (
          <StepVenue
            data={bookingData}
            locations={locations.filter((l) => (l.location_type || "salon") === "salon")}
            onChange={updateData}
            onNext={handleVenueNext}
            providerName={provider.business_name}
            providerId={provider.id}
            displayCurrency={bookingData.currency}
            defaultCountryCode={tenantRegionCode}
          />
        )}

        {step === "services" && (
          <StepServices
            data={bookingData}
            offerings={offeringsForStep}
            categoryName={bookingData.selectedCategory?.name}
            hidePackagesSection={prefillFromPackageDeepLink}
            packages={packages}
            variantsByServiceId={variantsByServiceId}
            onSelectPackage={async (pkg) => {
              if (!pkg) {
                packageProductLineIdsRef.current = new Set();
                setBookingData((prev) => ({ ...prev, selectedPackage: null, selectedServices: [], selectedProducts: [] }));
                return;
              }
              const services = (pkg.services ?? (pkg as any).items?.filter((x: any) => x.type === "service" || !x.type) ?? []).map(
                (s: any) => ({
                  offering_id: s.id,
                  title: s.title,
                  duration_minutes: s.duration_minutes ?? 60,
                  price: 0,
                  currency: pkg.currency,
                })
              );
              const totalDuration = services.reduce((a: number, b: BookingServiceEntry) => a + b.duration_minutes, 0);
              let selectedProducts: BookingData["selectedProducts"] = [];
              const hasProductLines = (pkg.items ?? []).some((x: { type?: string }) => x.type === "product");
              if (hasProductLines) {
                try {
                  const pr = await fetcher.get<unknown>(`/api/public/providers/${provider.slug}/products`);
                  const raw = (pr as { data?: unknown })?.data ?? pr ?? [];
                  const list = Array.isArray(raw) ? raw : [];
                  selectedProducts = buildRetailCartRowsFromPublicPackage(pkg, list as PublicProductCatalogRow[], tenantCurrency);
                } catch {
                  /* ignore */
                }
              }
              packageProductLineIdsRef.current = new Set(selectedProducts.map((p) => p.id));
              setBookingData((prev) => ({
                ...prev,
                selectedPackage: pkg,
                selectedServices: services,
                selectedProducts,
                servicesSubtotal: pkg.price,
                totalDurationMinutes: totalDuration,
              }));
            }}
            onSelectService={(entries) => {
              packageProductLineIdsRef.current = new Set();
              setBookingData((prev) => ({
                ...prev,
                selectedPackage: null,
                selectedServices: entries,
                selectedProducts: [],
                servicesSubtotal: entries.reduce((s, e) => s + e.price, 0),
                totalDurationMinutes: entries.reduce((s, e) => s + e.duration_minutes, 0),
              }));
            }}
            onNext={() => setStep("addons")}
            isAtHome={bookingData.venueType === "at_home"}
          />
        )}

        {step === "addons" && (
          <StepAddons
            data={bookingData}
            addons={addons}
            onToggleAddon={(addonId, _price) => {
              setBookingData((prev) => {
                const ids = prev.selectedAddonIds.includes(addonId)
                  ? prev.selectedAddonIds.filter((id) => id !== addonId)
                  : [...prev.selectedAddonIds, addonId];
                const addonsSubtotal = ids.reduce((sum, id) => {
                  const a = addons.find((x) => x.id === id);
                  return sum + (a ? a.price : 0);
                }, 0);
                return { ...prev, selectedAddonIds: ids, addonsSubtotal };
              });
            }}
            onNext={() => (showGroupStep ? setStep("group") : showStaffStep ? setStep("staff") : setStep("schedule"))}
          />
        )}

        {step === "group" && (
          <StepGroupParticipants
            data={bookingData}
            offerings={offeringsForStep}
            maxGroupSize={groupBookingSettings.maxGroupSize}
            onToggleGroup={(isGroup) =>
              setBookingData((prev) => ({
                ...prev,
                isGroupBooking: isGroup,
                groupParticipants: isGroup ? prev.groupParticipants ?? [] : undefined,
              }))
            }
            onUpdateParticipants={(participants) =>
              setBookingData((prev) => ({ ...prev, groupParticipants: participants }))
            }
            onNext={() => (showStaffStep ? setStep("staff") : setStep("schedule"))}
          />
        )}

        {step === "staff" && (
          <StepStaff
            data={bookingData}
            staff={staff}
            onSelectStaff={(s) => updateData({ selectedStaff: s })}
            onNext={() => setStep("schedule")}
          />
        )}

        {step === "schedule" && (
          <StepSchedule
            data={bookingData}
            slots={slots}
            loadingSlots={loadingSlots}
            selectedDate={bookingData.selectedDate}
            onSelectDate={(date) =>
              updateData({ selectedDate: date, selectedSlot: null, selectedResourceIds: [] })
            }
            onSelectSlot={(slot) => updateData({ selectedSlot: slot, selectedResourceIds: [] })}
            onNextAvailable={handleNextAvailable}
            onNext={() => setStep("resources")}
            maxAdvanceDays={365}
            providerId={provider.id}
            serviceId={bookingData.selectedServices[0]?.offering_id ?? null}
            providerTimeZone={provider.timezone ?? null}
            waitlistEnabled={settings.allow_online_waitlist !== false}
          />
        )}

        {step === "resources" && (
          <div className="space-y-6">
            <ResourceSelection
              providerId={provider.slug}
              serviceIds={bookingData.selectedServices.map((s) => s.offering_id)}
              selectedDate={bookingData.selectedDate}
              selectedTimeSlot={bookingData.selectedSlot?.start ?? null}
              selectedResources={bookingData.selectedResourceIds}
              onResourceChange={(ids) => setBookingData((prev) => ({ ...prev, selectedResourceIds: ids }))}
              durationMinutes={bookingData.totalDurationMinutes || 60}
              onNoResources={() => setStep("intake")}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setStep("intake")}
                className="rounded-xl px-6 py-3 font-semibold text-white min-h-[48px] min-w-[120px] touch-manipulation"
                style={{ backgroundColor: BOOKING_ACCENT }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "intake" && (
          <StepIntake
            data={bookingData}
            providerForms={providerForms}
            bookingCustomDefinitions={bookingCustomDefinitions}
            onChange={(client) =>
              setBookingData((prev) => ({ ...prev, client: { ...prev.client, ...client } }))
            }
            onProviderFormResponsesChange={(responses) =>
              setBookingData((prev) => ({ ...prev, provider_form_responses: responses }))
            }
            onCustomFieldValuesChange={(values) =>
              setBookingData((prev) => ({ ...prev, custom_field_values: values }))
            }
            onNext={() => setStep("review")}
          />
        )}

        {step === "review" && (
          <StepReview
            data={bookingData}
            providerName={provider.business_name}
            cancellationPolicy={cancellationPolicy}
            paymentSettings={{
              deposit_required: settings.deposit_required,
              allow_pay_in_person: settings.allow_pay_in_person,
              deposit_amount: settings.deposit_amount,
              deposit_percent: settings.deposit_percent,
            }}
            onPolicyAcceptedChange={(accepted) =>
              setBookingData((prev) => ({ ...prev, policyAccepted: accepted }))
            }
            onConfirm={handleConfirm}
            isCreatingHold={creatingHold}
            onEditServices={() => setStep("services")}
            onEditSchedule={() => setStep("schedule")}
            onEditVenue={() => setStep("venue")}
          />
        )}
      </main>

      {/* Bottom summary bar: takes layout space so it never covers the Continue button */}
      {!embed && (
        <div
          className="flex-shrink-0 flex items-center justify-between gap-4 px-6 py-4 safe-area-pb min-h-[72px]"
          style={{
            background: BOOKING_GLASS_BG,
            backdropFilter: "blur(16px) saturate(180%)",
            WebkitBackdropFilter: "blur(16px) saturate(180%)",
            borderTop: `1px solid ${BOOKING_EDGE}`,
          }}
        >
          <div className="flex items-center gap-2 opacity-50">
            <span
              className="text-[10px] font-black uppercase tracking-widest"
              style={{ color: BOOKING_TEXT_SECONDARY }}
            >
              {PLATFORM_NAME}
            </span>
          </div>
          {showSummaryPill && (
            <button
              type="button"
              onClick={() => setStep("review")}
              className="rounded-2xl px-5 py-3 text-xs font-bold flex items-center gap-2 touch-manipulation min-h-[44px] transition-transform duration-200 active:scale-[0.98]"
              style={{
                backgroundColor: BOOKING_TEXT_PRIMARY,
                color: "#fff",
                boxShadow: BOOKING_SHADOW_CARD,
                border: `1px solid ${BOOKING_EDGE}`,
              }}
            >
              Summary
              <span className="opacity-80">
                {formatCurrency(bookingData.servicesSubtotal + bookingData.addonsSubtotal, bookingData.currency)}
              </span>
              <ChevronRight size={14} className="opacity-70" />
            </button>
          )}
        </div>
      )}

      {embed && stepsOrder.indexOf(step) >= 0 && step !== "review" && (
        <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200/80 bg-white/95 backdrop-blur-md p-4">
          <button
            type="button"
            onClick={() => setStep("review")}
            className="w-full rounded-xl h-12 font-medium text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 touch-manipulation"
          >
            <span>Summary</span>
            <span className="text-sm text-gray-500">
              {formatCurrency(bookingData.servicesSubtotal + bookingData.addonsSubtotal, bookingData.currency)} · {bookingData.selectedServices.length} {bookingData.selectedServices.length === 1 ? "service" : "services"}
            </span>
          </button>
        </footer>
      )}

      <BeautonomiGateModal
        holdId={holdId ?? ""}
        holdExpiresAt={holdExpiresAt}
        open={gateOpen || preAuthGateOpen}
        onAuthComplete={handleAuthComplete}
        onClose={() => {
          setGateOpen(false);
          setPreAuthGateOpen(false);
        }}
        redirectUrl={
          preAuthGateOpen
            ? `${typeof window !== "undefined" ? window.location.origin : ""}/booking?slug=${encodeURIComponent(provider.slug)}&auth_return=calendar`
            : undefined
        }
      />
    </>
  );

  if (embed) {
    return (
      <div className="min-h-screen pb-8" style={{ backgroundColor: BOOKING_BG }}>
        {content}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex justify-center items-start min-[640px]:items-center min-[640px]:py-8 antialiased"
      style={{ backgroundColor: BOOKING_BG }}
    >
      <div
        className="w-full max-w-[430px] min-h-screen min-[640px]:h-[90vh] min-[640px]:min-h-0 min-[640px]:max-h-[90vh] overflow-hidden flex flex-col relative min-[640px]:rounded-[3rem]"
        style={{
          background: BOOKING_GLASS_BG,
          backdropFilter: "blur(16px) saturate(180%)",
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
          boxShadow: BOOKING_SHADOW_MAIN,
          border: `1px solid ${BOOKING_EDGE}`,
          color: "#222222",
        }}
      >
        {content}
      </div>
    </div>
  );
}
