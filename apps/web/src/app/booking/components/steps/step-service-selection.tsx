"use client";

import { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check, Clock, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { BookingState } from "../booking-flow";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { formatCurrency, cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@beautonomi/i18n";
import { catalogHasAnyAtHomePriceAdjustment } from "@beautonomi/utils";
import {
  HouseCallAtHomePricesBanner,
  HouseCallServicePriceLabel,
} from "@/components/booking/HouseCallPricingNotes";
import {
  applyLegacyAtHomeToSelectedLine,
  repriceLegacySelectedServices,
  type LegacySelectedServiceLine,
} from "../../lib/legacy-at-home-pricing";
import ServiceAddons from "./service-addons-inline";
import BookingProducts from "./booking-products";

/** Initial chunk size for long lists; deep links expand until the target row is mounted. */
const SERVICE_PAGE_SIZE = 32;
/** Show service search once a category has at least this many offerings. */
const MANY_SERVICES_IN_CATEGORY = 12;
/** Show category filter when the provider has this many categories. */
const MANY_CATEGORIES = 10;

interface StepServiceSelectionProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  onNext: () => void;
  providerSlug: string;
}

interface Service {
  id: string;
  title: string;
  description?: string;
  duration: number;
  bufferMinutes?: number;
  price: number;
  at_home_price_adjustment?: number;
  currency: string;
  category: string;
  hasAddons: boolean;
  hasVariants?: boolean;
}

function legacyIsAtHome(mode: BookingState["mode"]): boolean {
  return mode === "mobile";
}

function buildLegacyCartLine(
  partial: Omit<LegacySelectedServiceLine, "price" | "base_price" | "at_home_price_adjustment"> & {
    catalogBasePrice: number;
    atHomeAdjustment: number;
    isAtHome: boolean;
  }
): LegacySelectedServiceLine {
  return applyLegacyAtHomeToSelectedLine(
    {
      ...partial,
      price: partial.catalogBasePrice,
    },
    partial.catalogBasePrice,
    partial.atHomeAdjustment,
    partial.isAtHome
  );
}

interface Staff {
  id: string;
  name: string;
  role: string;
  avatar_url?: string;
  rating?: number;
  mobileReady: boolean;
}

export default function StepServiceSelection({
  bookingState,
  updateBookingState,
  onNext: _onNext,
  providerSlug,
}: StepServiceSelectionProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [serviceVariants, setServiceVariants] = useState<Record<string, any[]>>({});
  const [loadingVariants, setLoadingVariants] = useState<Record<string, boolean>>({});
  const [groupBookingSettings, setGroupBookingSettings] = useState<{
    enabled: boolean;
    maxGroupSize: number;
    excludedServices: string[];
  } | null>(null);
  const staffScrollRef = useRef<HTMLDivElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const categoryBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const serviceCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastScrolledFocusBaseIdRef = useRef<string | null>(null);
  const { t } = useTranslation();
  const hasLoadedRef = useRef(false);
  const lastProviderSlugRef = useRef<string | null>(null);
  const lastModeRef = useRef<string | null>(null);

  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [visibleServiceCount, setVisibleServiceCount] = useState(SERVICE_PAGE_SIZE);
  /** Base offering id (parent row) to scroll into view + highlight after deep link */
  const [scrollFocusBaseServiceId, setScrollFocusBaseServiceId] = useState<string | null>(null);

  const requestScrollToBaseService = useCallback((baseId: string | null) => {
    if (baseId) {
      lastScrolledFocusBaseIdRef.current = null;
      setScrollFocusBaseServiceId(baseId);
    }
  }, []);

  useEffect(() => {
    // Only load if providerSlug changed or mode actually changed (not just initialized)
    const providerChanged = providerSlug !== lastProviderSlugRef.current;
    const modeChanged = bookingState.mode !== lastModeRef.current;
    
    if (providerSlug && (providerChanged || (modeChanged && hasLoadedRef.current))) {
      hasLoadedRef.current = true;
      lastProviderSlugRef.current = providerSlug;
      lastModeRef.current = bookingState.mode;
      
      loadServices();
      loadStaff();
      loadGroupBookingSettings();
    } else if (providerSlug && !hasLoadedRef.current) {
      // Initial load
      hasLoadedRef.current = true;
      lastProviderSlugRef.current = providerSlug;
      lastModeRef.current = bookingState.mode;
      
      loadServices();
      loadStaff();
      loadGroupBookingSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerSlug, bookingState.mode]);

  useEffect(() => {
    if (!providerSlug || !hasLoadedRef.current) return;
    void loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingState.selectedLocationId]);

  // Ensure all selected services have staff assigned (auto-assign if missing)
  // Also re-assign staff when mode changes (e.g., mobile requires mobile-ready staff)
  useEffect(() => {
    if (staff.length === 0 || bookingState.selectedServices.length === 0) return;
    
    // Check if any service has staff that's no longer available for current mode
    const servicesNeedingStaff = bookingState.selectedServices.filter((service) => {
      if (!service.staffId || service.staffId.trim() === "") return true;
      // Check if assigned staff is still available for current mode
      const assignedStaff = staff.find((s) => s.id === service.staffId);
      if (!assignedStaff) return true; // Staff no longer exists
      if (bookingState.mode === "mobile" && !assignedStaff.mobileReady) return true; // Not mobile-ready
      return false;
    });
    
    if (servicesNeedingStaff.length > 0) {
      // Auto-assign first available staff; fall back to "any" when provider has no staff
      const defaultStaff = filteredStaff.length > 0 ? filteredStaff[0] : null;
      const defaultStaffId = defaultStaff?.id ?? "any";
      updateBookingState({
        selectedServices: bookingState.selectedServices.map((service) => {
          const needsStaff = !service.staffId || service.staffId.trim() === "";
          const assignedStaff = staff.find((s) => s.id === service.staffId);
          const isInvalidStaff =
            service.staffId !== "any" &&
            (!assignedStaff ||
              (bookingState.mode === "mobile" && assignedStaff && !assignedStaff.mobileReady));

          if (needsStaff || isInvalidStaff) {
            return {
              ...service,
              staffId: defaultStaffId,
              staffName: defaultStaff?.name,
            };
          }
          return service;
        }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff.length, bookingState.selectedServices.length, bookingState.mode]);

  const loadGroupBookingSettings = async () => {
    if (!providerSlug) return;
    
    try {
      const response = await fetcher.get<{
        data: {
          enabled: boolean;
          maxGroupSize: number;
          excludedServices: string[];
        };
      }>(`/api/public/providers/${encodeURIComponent(providerSlug)}/group-booking-settings`);
      setGroupBookingSettings(response.data);
    } catch {
      // If endpoint doesn't exist or fails, group booking is not available
      setGroupBookingSettings({ enabled: false, maxGroupSize: 10, excludedServices: [] });
    }
  };

  // Pre-select from ?serviceId= or ?service= (variant id must resolve after variants load)
  useEffect(() => {
    if (typeof window === "undefined" || services.length === 0) return;

    const urlParams = new URLSearchParams(window.location.search);
    const offeringId = (urlParams.get("serviceId") || urlParams.get("service") || "").trim();
    if (!offeringId || bookingState.selectedServices.some((s) => s.id === offeringId)) return;

    const defaultStaff = filteredStaff.length > 0 ? filteredStaff[0] : null;
    const defaultStaffId = defaultStaff?.id ?? "any";

    const baseRow = services.find((s) => s.id === offeringId);
    if (baseRow) {
      setActiveCategory(baseRow.category);
      requestScrollToBaseService(baseRow.id);
      updateBookingState({
        selectedServices: [
          ...bookingState.selectedServices,
          buildLegacyCartLine({
            id: baseRow.id,
            title: baseRow.title,
            duration: baseRow.duration,
            bufferMinutes: baseRow.bufferMinutes ?? 0,
            currency: baseRow.currency,
            staffId: defaultStaffId,
            staffName: defaultStaff?.name,
            catalogBasePrice: baseRow.price,
            atHomeAdjustment: Number(baseRow.at_home_price_adjustment ?? 0),
            isAtHome: legacyIsAtHome(bookingState.mode),
          }),
        ],
      });
      if (baseRow.hasAddons || defaultStaff) setExpandedService(baseRow.id);
      if (baseRow.hasVariants) loadVariants(baseRow.id);
      return;
    }

    let parentWithVariant: Service | null = null;
    for (const s of services) {
      if (!s.hasVariants) continue;
      const vars = serviceVariants[s.id];
      if (Array.isArray(vars) && vars.some((v: { id?: string }) => v.id === offeringId)) {
        parentWithVariant = s;
        break;
      }
    }

    if (!parentWithVariant) {
      const nextToLoad = services.find(
        (s) => s.hasVariants && serviceVariants[s.id] === undefined && !loadingVariants[s.id]
      );
      if (nextToLoad) loadVariants(nextToLoad.id);
      return;
    }

    const vars = serviceVariants[parentWithVariant.id] ?? [];
    const v = vars.find((x: { id?: string }) => x.id === offeringId);
    if (!v) return;

    setActiveCategory(parentWithVariant.category);
    requestScrollToBaseService(parentWithVariant.id);
    const variantBase = Number(v.price ?? parentWithVariant.price);
    updateBookingState({
      selectedServices: [
        ...bookingState.selectedServices,
        buildLegacyCartLine({
          id: v.id,
          title: v.title || v.variant_name || parentWithVariant.title,
          duration: v.duration ?? v.duration_minutes ?? parentWithVariant.duration,
          bufferMinutes:
            v.bufferMinutes ?? v.buffer_minutes ?? parentWithVariant.bufferMinutes ?? 0,
          currency: v.currency ?? parentWithVariant.currency,
          staffId: defaultStaffId,
          staffName: defaultStaff?.name,
          baseServiceId: parentWithVariant.id,
          catalogBasePrice: variantBase,
          atHomeAdjustment: Number(parentWithVariant.at_home_price_adjustment ?? 0),
          isAtHome: legacyIsAtHome(bookingState.mode),
        }),
      ],
    });
    setExpandedService(parentWithVariant.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, serviceVariants, staff.length, bookingState.selectedServices, requestScrollToBaseService]);

  const loadServices = async () => {
    if (!providerSlug) {
      console.error("[Service Selection] No provider slug provided");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setServiceSearchQuery("");
      setCategorySearchQuery("");
      setVisibleServiceCount(SERVICE_PAGE_SIZE);
      // Since services is now first step, load all services (type=salon shows all services)
      // Default to "salon" which will load all services regardless of venue type
      const mode = bookingState.mode === "mobile" ? "mobile" : "salon";
      
      // Get offering id from URL (same param names as /book/[slug]?service=)
      const urlParams = new URLSearchParams(window.location.search);
      const urlOfferingId = (urlParams.get("serviceId") || urlParams.get("service") || urlParams.get("services") || "").trim();
      const firstOfferingId = urlOfferingId ? urlOfferingId.split(',')[0].trim() : "";

      console.log(`[Service Selection] Loading services for providerSlug: ${providerSlug}, mode: ${mode}, serviceId: ${urlOfferingId || "none"}`);

      let apiUrl = `/api/services?type=${mode}&providerSlug=${encodeURIComponent(providerSlug)}`;
      if (urlOfferingId) {
        apiUrl += `&serviceId=${encodeURIComponent(urlOfferingId)}`;
      }
      
      const response = await fetcher.get<{ data: Service[] }>(apiUrl, {
        timeoutMs: 20000 // 20 seconds timeout for services loading
      });
      
      console.log(`[Service Selection] API Response:`, response);
      const servicesData = response.data || [];
      console.log(`[Service Selection] Loaded ${servicesData.length} services`);
      
      if (servicesData.length === 0) {
        console.error(`[Service Selection] Empty services array for provider: ${providerSlug}`);
        console.error(`[Service Selection] Full API response:`, JSON.stringify(response, null, 2));
      }
      
      if (servicesData.length === 0) {
        console.warn(`[Service Selection] No services found for provider: ${providerSlug}`);
        toast.error("No services available for this provider");
      }
      
      setServices(servicesData);

      // Extract unique categories
      const uniqueCategories = Array.from(
        new Set(servicesData.map((s) => s.category))
      );
      setCategories(uniqueCategories);
      // Deep link (?service= / ?serviceId=): show the tab that contains the linked offering
      const preferredCategory =
        firstOfferingId && servicesData.length > 0
          ? servicesData.find((s) => s.id === firstOfferingId)?.category
          : null;
      if (preferredCategory && uniqueCategories.includes(preferredCategory)) {
        setActiveCategory(preferredCategory);
      } else if (uniqueCategories.length > 0) {
        setActiveCategory(uniqueCategories[0]);
      }

      if (firstOfferingId) {
        const rowForScroll = servicesData.find((s) => s.id === firstOfferingId);
        if (rowForScroll) {
          requestScrollToBaseService(rowForScroll.id);
        }
      }

      // If URL has a service/variant ID, eagerly load variants for ALL services
      // with variants in parallel so pre-selection resolves quickly.
      const urlParams2 = new URLSearchParams(window.location.search);
      const urlOfferingId2 = (urlParams2.get("serviceId") || urlParams2.get("service") || urlParams2.get("services") || "").trim();
      const firstOfferingId2 = urlOfferingId2 ? urlOfferingId2.split(',')[0].trim() : "";
      if (firstOfferingId2 && servicesData.some((s) => s.hasVariants)) {
        servicesData.filter((s) => s.hasVariants).forEach((s) => loadVariants(s.id));
      }
    } catch (error) {
      console.error("[Service Selection] Error loading services:", error);
      toast.error(
        error instanceof FetchError
          ? error.message
          : "Failed to load services"
      );
      setServices([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStaff = async () => {
    try {
      const locId =
        bookingState.mode !== "mobile" ? bookingState.selectedLocationId : undefined;
      const qs = locId ? `?location_id=${encodeURIComponent(locId)}` : "";
      const response = await fetcher.get<{ data: Staff[] }>(
        `/api/public/providers/${providerSlug}/staff${qs}`
      );
      setStaff(response.data || []);
    } catch (error) {
      console.error("Error loading staff:", error);
    }
  };

  // Filter services based on category and group booking exclusions
  const filteredServices = useMemo(() => {
    const base = activeCategory
      ? services.filter((s) => s.category === activeCategory)
      : services;
    return base.filter((s) => {
      if (bookingState.isGroupBooking && groupBookingSettings?.excludedServices.length) {
        return !groupBookingSettings.excludedServices.includes(s.id);
      }
      return true;
    });
  }, [services, activeCategory, bookingState.isGroupBooking, groupBookingSettings]);

  const filteredStaff = bookingState.mode === "mobile"
    ? staff.filter((s) => s.mobileReady)
    : staff;

  const isAtHomeVenue = legacyIsAtHome(bookingState.mode);

  const showHouseCallPricingHints = useMemo(
    () => isAtHomeVenue && catalogHasAnyAtHomePriceAdjustment(services),
    [isAtHomeVenue, services]
  );

  // Re-price cart when venue mode changes (services step is before venue in legacy flow).
  useEffect(() => {
    if (services.length === 0 || bookingState.selectedServices.length === 0) return;
    const catalog = services.map((s) => ({
      id: s.id,
      price: s.price,
      at_home_price_adjustment: s.at_home_price_adjustment,
    }));
    const repriced = repriceLegacySelectedServices(
      bookingState.selectedServices,
      catalog,
      isAtHomeVenue
    );
    const changed = repriced.some(
      (s, i) =>
        s.price !== bookingState.selectedServices[i]?.price ||
        s.at_home_price_adjustment !== bookingState.selectedServices[i]?.at_home_price_adjustment
    );
    if (changed) {
      updateBookingState({ selectedServices: repriced });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingState.mode, services.length]);

  const searchFilteredServices = useMemo(() => {
    const q = serviceSearchQuery.trim().toLowerCase();
    if (!q) return filteredServices;
    return filteredServices.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        Boolean(s.description?.toLowerCase().includes(q)),
    );
  }, [filteredServices, serviceSearchQuery]);

  const displayedCategoryTabs = useMemo(() => {
    const q = categorySearchQuery.trim().toLowerCase();
    let list = categories;
    if (q) {
      list = categories.filter((c) => c.toLowerCase().includes(q));
    }
    if (activeCategory && !list.includes(activeCategory)) {
      list = [activeCategory, ...list];
    }
    return list;
  }, [categories, categorySearchQuery, activeCategory]);

  const pagedServices = useMemo(
    () => searchFilteredServices.slice(0, visibleServiceCount),
    [searchFilteredServices, visibleServiceCount],
  );

  const hasMoreServices = visibleServiceCount < searchFilteredServices.length;
  const showServiceSearch =
    filteredServices.length >= MANY_SERVICES_IN_CATEGORY || services.length >= 28;
  const showCategorySearch = categories.length >= MANY_CATEGORIES;

  useEffect(() => {
    setVisibleServiceCount(SERVICE_PAGE_SIZE);
  }, [serviceSearchQuery]);

  useLayoutEffect(() => {
    if (!activeCategory || categories.length <= 1) return;
    const btn = categoryBtnRefs.current.get(activeCategory);
    btn?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeCategory, categories.length, displayedCategoryTabs.length]);

  useLayoutEffect(() => {
    if (!scrollFocusBaseServiceId) return;
    const baseId = scrollFocusBaseServiceId;
    const idx = searchFilteredServices.findIndex((s) => s.id === baseId);
    if (idx === -1) return;
    if (idx >= visibleServiceCount) {
      setVisibleServiceCount((prev) =>
        Math.min(searchFilteredServices.length, Math.max(prev, idx + 8)),
      );
      return;
    }
    const el = serviceCardRefs.current.get(baseId);
    if (!el) return;
    if (lastScrolledFocusBaseIdRef.current === baseId) return;
    lastScrolledFocusBaseIdRef.current = baseId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = window.setTimeout(() => {
      setScrollFocusBaseServiceId(null);
      lastScrolledFocusBaseIdRef.current = null;
    }, 2200);
    return () => window.clearTimeout(t);
  }, [scrollFocusBaseServiceId, searchFilteredServices, visibleServiceCount, pagedServices.length]);

  const handleServiceToggle = (service: Service) => {
    // A service is "selected" if it appears directly (base) OR as a chosen variant (baseServiceId)
    const isSelected = bookingState.selectedServices.some(
      (s) => s.id === service.id || s.baseServiceId === service.id
    );

    if (isSelected) {
      updateBookingState({
        selectedServices: bookingState.selectedServices.filter(
          (s) => s.id !== service.id && s.baseServiceId !== service.id
        ),
      });
      setExpandedService(null);
    } else {
      // Auto-select first available staff member; fall back to "any" so canProceed() passes
      const defaultStaff = filteredStaff.length > 0 ? filteredStaff[0] : null;
      const staffId = defaultStaff?.id ?? "any";
      const staffName = defaultStaff?.name;

      updateBookingState({
        selectedServices: [
          ...bookingState.selectedServices,
          buildLegacyCartLine({
            id: service.id,
            title: service.title,
            duration: service.duration,
            bufferMinutes: service.bufferMinutes ?? 0,
            currency: service.currency,
            staffId,
            staffName,
            catalogBasePrice: service.price,
            atHomeAdjustment: Number(service.at_home_price_adjustment ?? 0),
            isAtHome: legacyIsAtHome(bookingState.mode),
          }),
        ],
      });
      setExpandedService(service.id);

      // Load variants if service has them
      if (service.hasVariants) {
        loadVariants(service.id);
      }
    }
  };

  const loadVariants = async (serviceId: string) => {
    if (serviceVariants[serviceId] || loadingVariants[serviceId]) {
      return; // Already loaded or loading
    }

    try {
      setLoadingVariants((prev) => ({ ...prev, [serviceId]: true }));
      const response = await fetcher.get<{ data: { variants: any[] } }>(
        `/api/public/providers/${encodeURIComponent(providerSlug)}/services/${serviceId}/variants`
      );
      
      const list = response.data?.variants;
      setServiceVariants((prev) => ({
        ...prev,
        [serviceId]: Array.isArray(list) ? list : [],
      }));
    } catch (error) {
      console.error(`[Service Selection] Error loading variants for ${serviceId}:`, error);
    } finally {
      setLoadingVariants((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const handleVariantSelect = (serviceId: string, variant: any, parentService: Service) => {
    const currentService = bookingState.selectedServices.find(
      (s) => s.id === serviceId || s.baseServiceId === serviceId
    );
    const isBaseOption = variant.id === serviceId;
    const catalogBasePrice = Number(variant.price ?? parentService.price);
    const partial: Omit<LegacySelectedServiceLine, "price" | "base_price" | "at_home_price_adjustment"> = {
      id: variant.id,
      title: variant.title || variant.variant_name || parentService.title,
      duration: variant.duration ?? parentService.duration,
      bufferMinutes:
        variant.bufferMinutes ?? variant.buffer_minutes ?? currentService?.bufferMinutes ?? 0,
      currency: variant.currency ?? parentService.currency,
      ...(isBaseOption ? {} : { baseServiceId: serviceId }),
      staffId: currentService?.staffId,
      staffName: currentService?.staffName,
    };
    updateBookingState({
      selectedServices: bookingState.selectedServices.map((s) =>
        s.id === serviceId || s.baseServiceId === serviceId
          ? buildLegacyCartLine({
              ...partial,
              catalogBasePrice,
              atHomeAdjustment: Number(parentService.at_home_price_adjustment ?? 0),
              isAtHome: legacyIsAtHome(bookingState.mode),
            })
          : s
      ),
    });
  };

  const handleStaffSelect = (serviceId: string, staffMember: Staff | null) => {
    // Entry may be base (id === serviceId) or variant (baseServiceId === serviceId)
    updateBookingState({
      selectedServices: bookingState.selectedServices.map((s) =>
        s.id === serviceId || s.baseServiceId === serviceId
          ? {
              ...s,
              staffId: staffMember?.id,
              staffName: staffMember?.name,
            }
          : s
      ),
    });
  };

  const scrollStaff = (direction: "left" | "right") => {
    if (staffScrollRef.current) {
      const scrollAmount = direction === "left" ? -200 : 200;
      staffScrollRef.current.scrollBy({
        left: scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          {t("booking.selectService")}
        </h2>
        <p className="text-gray-600">
          {t("booking.addService")}
        </p>
      </div>

      {showHouseCallPricingHints ? <HouseCallAtHomePricesBanner t={t} /> : null}

      {/* Group Booking Toggle */}
      {groupBookingSettings?.enabled && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <label className="flex items-center gap-3 cursor-pointer touch-target">
            <input
              type="checkbox"
              checked={bookingState.isGroupBooking || false}
              onChange={(e) => {
                updateBookingState({ isGroupBooking: e.target.checked });
                if (!e.target.checked) {
                  // Clear group participants when disabling
                  updateBookingState({ groupParticipants: undefined });
                }
              }}
              className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <div className="flex-1">
              <p className="font-medium text-gray-900">Book for multiple people</p>
              <p className="text-sm text-gray-600">
                Add up to {groupBookingSettings.maxGroupSize} participants to this booking
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Category Tabs + optional filter for large menus */}
      {categories.length > 1 && (
        <div className="space-y-2">
          {showCategorySearch && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
              <Input
                type="search"
                value={categorySearchQuery}
                onChange={(e) => setCategorySearchQuery(e.target.value)}
                placeholder={t("booking.filterCategoriesPlaceholder")}
                className="pl-9 h-10 placeholder:text-gray-400 border border-gray-200 bg-white"
                autoComplete="off"
                aria-label={t("booking.filterCategoriesPlaceholder")}
              />
            </div>
          )}
          <div
            ref={categoryScrollRef}
            className="flex gap-2 overflow-x-auto scrollbar-hide pb-2"
            role="tablist"
            aria-label={t("booking.selectService")}
          >
            {displayedCategoryTabs.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={activeCategory === category}
                ref={(el) => {
                  if (el) categoryBtnRefs.current.set(category, el);
                  else categoryBtnRefs.current.delete(category);
                }}
                onClick={() => {
                  setActiveCategory(category);
                  setVisibleServiceCount(SERVICE_PAGE_SIZE);
                  setServiceSearchQuery("");
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap touch-target transition-colors ${
                  activeCategory === category
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      )}

      {showServiceSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
          <Input
            type="search"
            value={serviceSearchQuery}
            onChange={(e) => setServiceSearchQuery(e.target.value)}
            placeholder={t("booking.searchServicesPlaceholder")}
            className="pl-9 h-10 placeholder:text-gray-400 border border-gray-200 bg-white"
            autoComplete="off"
            aria-label={t("booking.searchServicesPlaceholder")}
          />
        </div>
      )}

      {searchFilteredServices.length > 0 &&
        pagedServices.length < searchFilteredServices.length && (
        <p className="text-xs text-gray-500">
          {t("booking.servicesPaginationSummary", {
            shown: pagedServices.length,
            total: searchFilteredServices.length,
          })}
        </p>
      )}

      {/* Services List */}
      <div className="space-y-3">
        {pagedServices.map((service) => {
          // isSelected is true when the base service OR one of its variants is chosen
          const isSelected = bookingState.selectedServices.some(
            (s) => s.id === service.id || s.baseServiceId === service.id
          );
          // selectedService points to whichever entry represents this service (base or variant)
          const selectedService = bookingState.selectedServices.find(
            (s) => s.id === service.id || s.baseServiceId === service.id
          );
          const _isExpanded = expandedService === service.id;

          return (
            <motion.div
              key={service.id}
              layout={pagedServices.length < 40}
              ref={(el) => {
                if (el) serviceCardRefs.current.set(service.id, el);
                else serviceCardRefs.current.delete(service.id);
              }}
              className={cn(
                "border-2 rounded-xl overflow-hidden transition-all",
                isSelected ? "border-primary bg-pink-50" : "border-gray-200 bg-white",
                scrollFocusBaseServiceId === service.id &&
                  "ring-2 ring-primary ring-offset-2 ring-offset-white",
              )}
            >
              {/* Service Card */}
              <button
                onClick={() => handleServiceToggle(service)}
                className="w-full p-4 text-left touch-target"
                aria-label={`${isSelected ? "Deselect" : "Select"} ${service.title}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {service.title}
                    </h3>
                    {service.description && (
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                        {service.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {service.duration} min
                      </span>
                      <HouseCallServicePriceLabel
                        basePrice={service.price}
                        atHomePriceAdjustment={service.at_home_price_adjustment}
                        isAtHome={isAtHomeVenue}
                        currency={service.currency}
                        durationMinutes={service.duration}
                        t={t}
                        className="font-semibold text-gray-900"
                      />
                    </div>
                  </div>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected
                        ? "bg-primary text-white"
                        : "border-2 border-gray-300"
                    }`}
                  >
                    {isSelected ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Plus className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Content: Variants, Staff Selection & Addons */}
              <AnimatePresence initial={false}>
              {isSelected && (
                <motion.div
                  key="expanded"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="border-t border-gray-200 bg-white">
                  <div className="p-4 space-y-4">
                    {/* Variants Loading */}
                    {service.hasVariants && loadingVariants[service.id] && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading options...</span>
                      </div>
                    )}

                    {/* Variants Selection */}
                    {service.hasVariants && !loadingVariants[service.id] && serviceVariants[service.id] && serviceVariants[service.id].length > 0 && (
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-3 block">
                          Choose Option
                        </Label>
                        <div className="space-y-2">
                          {/* Base service option */}
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleVariantSelect(service.id, {
                              id: service.id,
                              title: service.title,
                              duration: service.duration,
                              price: service.price,
                              currency: service.currency,
                            }, service)}
                            className={`w-full p-3 rounded-lg border-2 text-left transition-all touch-target ${
                              !selectedService?.baseServiceId || selectedService?.id === service.id
                                ? "border-primary bg-pink-50"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium text-gray-900">{service.title}</span>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {service.duration} min
                                  </span>
                                  <HouseCallServicePriceLabel
                                    basePrice={service.price}
                                    atHomePriceAdjustment={service.at_home_price_adjustment}
                                    isAtHome={isAtHomeVenue}
                                    currency={service.currency}
                                    durationMinutes={service.duration}
                                    t={t}
                                    className="font-semibold text-gray-900"
                                  />
                                </div>
                              </div>
                              {(!selectedService?.baseServiceId || selectedService?.id === service.id) && (
                                <Check className="w-5 h-5 text-primary" />
                              )}
                            </div>
                          </motion.button>
                          
                          {/* Variant options */}
                          {serviceVariants[service.id].map((variant: any) => (
                            <motion.button
                              key={variant.id}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => handleVariantSelect(service.id, variant, service)}
                              className={`w-full p-3 rounded-lg border-2 text-left transition-all touch-target ${
                                selectedService?.id === variant.id
                                  ? "border-primary bg-pink-50"
                                  : "border-gray-200 bg-white hover:border-gray-300"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-medium text-gray-900">
                                    {variant.variant_name || variant.title}
                                  </span>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {variant.duration} min
                                    </span>
                                    <HouseCallServicePriceLabel
                                      basePrice={variant.price}
                                      atHomePriceAdjustment={service.at_home_price_adjustment}
                                      isAtHome={isAtHomeVenue}
                                      currency={variant.currency ?? service.currency}
                                      durationMinutes={variant.duration}
                                      t={t}
                                      className="font-semibold text-gray-900"
                                    />
                                  </div>
                                </div>
                                {selectedService?.id === variant.id && (
                                  <Check className="w-5 h-5 text-primary" />
                                )}
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Staff Selection */}
                    {filteredStaff.length > 0 ? (
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-3 block">
                          Select Professional <span className="text-primary">*</span>
                        </Label>
                        <p className="text-xs text-gray-500 mb-3">
                          Choose a professional to ensure your booking appears on their calendar
                        </p>
                        {!selectedService?.staffId && (
                          <p className="text-xs text-primary mb-2 font-medium">
                            Please select a professional to continue
                          </p>
                        )}
                        <div className="relative">
                          <div
                            ref={staffScrollRef}
                            className="flex gap-3 overflow-x-auto scrollbar-hide pb-2"
                            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                          >
                            {/* Staff Members */}
                            {filteredStaff.map((staffMember) => (
                              <button
                                key={staffMember.id}
                                onClick={() => handleStaffSelect(service.id, staffMember)}
                                className={`flex-shrink-0 w-20 flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors touch-target ${
                                  selectedService?.staffId === staffMember.id
                                    ? "border-primary bg-pink-50"
                                    : "border-gray-200 bg-white"
                                }`}
                              >
                                {staffMember.avatar_url ? (
                                  <img
                                    src={staffMember.avatar_url}
                                    alt={staffMember.name}
                                    className="w-12 h-12 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                                    <span className="text-sm font-semibold text-gray-600">
                                      {staffMember.name.charAt(0)}
                                    </span>
                                  </div>
                                )}
                                <span className="text-xs font-medium text-center line-clamp-2">
                                  {staffMember.name}
                                </span>
                              </button>
                            ))}
                          </div>
                          {filteredStaff.length > 3 && (
                            <>
                              <button
                                onClick={() => scrollStaff("left")}
                                className="absolute left-0 top-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-md touch-target"
                                aria-label="Scroll left"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => scrollStaff("right")}
                                className="absolute right-0 top-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-md touch-target"
                                aria-label="Scroll right"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-xs text-gray-600">
                          Any available professional will be assigned for this appointment.
                        </p>
                      </div>
                    )}

                    {/* Add-ons */}
                    {service.hasAddons && (
                      <ServiceAddons
                        serviceId={service.id}
                        providerSlug={providerSlug}
                        selectedAddons={bookingState.selectedAddons}
                        onAddonsChange={(addons) => {
                          updateBookingState({ selectedAddons: addons });
                        }}
                      />
                    )}
                  </div>
                  </div>
                </motion.div>
              )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {hasMoreServices && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="w-full max-w-sm touch-target"
            onClick={() =>
              setVisibleServiceCount((c) =>
                Math.min(c + SERVICE_PAGE_SIZE, searchFilteredServices.length),
              )
            }
          >
            {t("booking.loadMoreServices")}
          </Button>
        </div>
      )}

      {searchFilteredServices.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>{t("common.noResults")}</p>
        </div>
      )}

      {/* Products Section */}
      {bookingState.selectedServices.length > 0 && (
        <div className="mt-8 border-t border-gray-200 pt-6">
          <BookingProducts
            bookingState={bookingState}
            updateBookingState={updateBookingState}
            providerSlug={providerSlug}
          />
        </div>
      )}
    </div>
  );
}

