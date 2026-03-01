"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Loader2, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { BeautonomiGateModal } from "./BeautonomiGateModal";
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
  GroupParticipant,
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

const defaultBookingData: BookingData = {
  venueType: "at_salon",
  selectedLocation: null,
  atHomeAddress: { line1: "", city: "", country: "ZA" },
  selectedCategory: null,
  selectedPackage: null,
  selectedServices: [],
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
  currency: "ZAR",
  servicesSubtotal: 0,
  totalDurationMinutes: 0,
};

interface Provider {
  id: string;
  slug: string;
  business_name: string;
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
  policy_text?: string;
  hours_before_cutoff?: number;
  late_cancellation_type?: "no_refund" | "partial_refund" | "full_refund";
}

interface OnlineBookingFlowNewProps {
  provider: Provider;
  queryParams?: {
    service?: string;
    staff?: string;
    location?: string;
    location_type?: "at_home" | "at_salon";
    anyone?: boolean;
    date?: string;
    auth_return?: string;
  };
  embed?: boolean;
}

export default function OnlineBookingFlowNew({
  provider,
  queryParams = {},
  embed = false,
}: OnlineBookingFlowNewProps) {
  // #region agent log (only when NEXT_PUBLIC_DEBUG_INGEST_URL is set)
  const debugIngestUrl = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_DEBUG_INGEST_URL : undefined;
  if (debugIngestUrl) {
    fetch(debugIngestUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9fda2d" }, body: JSON.stringify({ sessionId: "9fda2d", location: "OnlineBookingFlowNew.tsx:component-entry", message: "render start", data: { slug: provider?.slug }, timestamp: Date.now(), hypothesisId: "H1" }) }).catch(() => {});
  }
  // #endregion
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep] = useState<BookingStep>("venue");
  const [bookingData, setBookingData] = useState<BookingData>(() => ({
    ...defaultBookingData,
    venueType: (queryParams.location_type as "at_salon" | "at_home") ?? "at_salon",
  }));

  // #region agent log
  if (debugIngestUrl) {
    fetch(debugIngestUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9fda2d" }, body: JSON.stringify({ sessionId: "9fda2d", location: "OnlineBookingFlowNew.tsx:before-useCallback", message: "about to define updateData", data: {}, timestamp: Date.now(), hypothesisId: "H2" }) }).catch(() => {});
  }
  // #endregion
  const updateDataRef = useRef<(patch: Partial<BookingData>) => void>(() => {});
  const updateDataImpl = useCallback((patch: Partial<BookingData>) => {
    setBookingData((prev) => {
      const next = { ...prev, ...patch };
      const servicesSubtotal = next.selectedServices.reduce((s, e) => s + e.price, 0);
      return {
        ...next,
        servicesSubtotal: next.selectedPackage ? (next.selectedPackage.price ?? servicesSubtotal) : servicesSubtotal,
        totalDurationMinutes: next.selectedServices.reduce((s, e) => s + e.duration_minutes, 0),
        currency: next.selectedServices[0]?.currency ?? next.currency ?? "ZAR",
      };
    });
  }, []);
  updateDataRef.current = updateDataImpl;
  const updateData = useCallback((patch: Partial<BookingData>) => updateDataRef.current(patch), []);

  // #region agent log
  if (debugIngestUrl) {
    fetch(debugIngestUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9fda2d" }, body: JSON.stringify({ sessionId: "9fda2d", location: "OnlineBookingFlowNew.tsx:after-updateData", message: "updateData defined", data: {}, timestamp: Date.now(), hypothesisId: "H3" }) }).catch(() => {});
  }
  // #endregion
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [offerings, setOfferings] = useState<ServiceOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [addons, setAddons] = useState<AddonOption[]>([]);
  const [variantsByServiceId, setVariantsByServiceId] = useState<Record<string, ServiceVariant[]>>({});
  const [settings, setSettings] = useState<OnlineBookingSettings>({
    staff_selection_mode: "client_chooses",
    require_auth_step: "checkout",
    min_notice_minutes: 60,
    max_advance_days: 90,
  });

  const [slots, setSlots] = useState<Array<{ start: string; end: string; staff_id?: string; is_available?: boolean }>>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [holdId, setHoldId] = useState<string | null>(null);
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

  // Auto-select single category when only one exists
  useEffect(() => {
    // #region agent log
    if (debugIngestUrl) {
      fetch(debugIngestUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9fda2d" }, body: JSON.stringify({ sessionId: "9fda2d", location: "OnlineBookingFlowNew.tsx:effect-category", message: "effect runs", data: { step, categoriesLen: categories?.length, runId: "post-fix" }, timestamp: Date.now(), hypothesisId: "H4" }) }).catch(() => {});
    }
    // #endregion
    if (step === "category" && categories.length === 1 && !bookingData.selectedCategory) {
      updateDataRef.current({ selectedCategory: categories[0] });
    }
  }, [step, categories, bookingData.selectedCategory]);

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

        const locs = (providerRes as any)?.data?.locations ?? [];
        setLocations(Array.isArray(locs) ? locs : []);
        const salonLocs = Array.isArray(locs) ? locs.filter((l: any) => (l.location_type || "salon") === "salon") : [];
        if (salonLocs.length > 0) {
          const primary = salonLocs.find((l: LocationOption) => l.is_primary) ?? salonLocs[0];
          const fromQuery = queryParams.location ? salonLocs.find((l: any) => l.id === queryParams.location || (l as any).slug === queryParams.location) : null;
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

        const variantPromises = baseServices.map((svc: any) =>
          fetcher.get(`/api/public/providers/${provider.slug}/services/${svc.id}/variants`).catch(() => ({ data: { variants: [] } }))
        );
        const variantResults = await Promise.all(variantPromises);
        const map: Record<string, ServiceVariant[]> = {};
        baseServices.forEach((svc: any, i: number) => {
          const res = variantResults[i] as any;
          const variants = res?.data?.variants ?? res?.variants ?? [];
          if (variants.length > 0) map[svc.id] = variants;
        });
        setVariantsByServiceId(map);

        if (queryParams.service) {
          const match = list.find((s: any) => s.id === queryParams.service || (s as any).slug === queryParams.service);
          if (match) {
            setBookingData((prev) => ({
              ...prev,
              selectedServices: [
                {
                  offering_id: match.id,
                  title: match.title,
                  duration_minutes: match.duration_minutes,
                  price: match.price,
                  currency: match.currency ?? "ZAR",
                },
              ],
            }));
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
  }, [provider.slug, provider.id, queryParams.service, queryParams.staff, queryParams.anyone, queryParams.location]);

  // Load cancellation policy when we have provider and venue (for review step)
  useEffect(() => {
    if (!provider.id || step !== "review") return;
    const locationType = bookingData.venueType === "at_home" ? "at_home" : "at_salon";
    fetcher
      .get<{ data?: CancellationPolicy[] }>(`/api/public/cancellation-policy?provider_id=${provider.id}&location_type=${locationType}`)
      .then((res) => {
        const data = (res as { data?: CancellationPolicy[] })?.data;
        if (data && data.length > 0) setCancellationPolicy(data[0]);
        else
          setCancellationPolicy({
            policy_text: "Cancellations must be made at least 24 hours before your appointment. Cancellations made within 24 hours may be subject to a cancellation fee.",
            hours_before_cutoff: 24,
            late_cancellation_type: "no_refund",
          });
      })
      .catch(() =>
        setCancellationPolicy({
          policy_text: "Cancellations must be made at least 24 hours before your appointment.",
          hours_before_cutoff: 24,
          late_cancellation_type: "no_refund",
        })
      );
  }, [provider.id, bookingData.venueType, step]);

  const primaryServiceId = bookingData.selectedServices[0]?.offering_id;
  useEffect(() => {
    if (!primaryServiceId) {
      setAddons([]);
      return;
    }
    fetcher
      .get<{ data: { all_addons?: AddonOption[] }; all_addons?: AddonOption[] }>(
        `/api/public/providers/${provider.slug}/services/${primaryServiceId}/addons`
      )
      .then((res) => {
        const data = res as any;
        const list = data?.data?.all_addons ?? data?.all_addons ?? data?.data ?? [];
        setAddons(Array.isArray(list) ? list : []);
      })
      .catch(() => setAddons([]));
  }, [provider.slug, primaryServiceId]);

  // Total slot span = sum(durations) + sum(buffers) so slots match hold/booking block. For group booking use max across primary and all participants.
  const slotParams = (() => {
    const offeringsList = offerings as Array<{ id: string; duration_minutes?: number; buffer_minutes?: number }>;
    const spanForOfferingIds = (ids: string[]) => {
      let total = 0;
      for (let i = 0; i < ids.length; i++) {
        const off = offeringsList.find((o) => o.id === ids[i]);
        const dur = off?.duration_minutes ?? 60;
        const buf = off?.buffer_minutes ?? 15;
        total += dur + buf;
      }
      return total;
    };
    const primaryIds = bookingData.selectedServices.map((s) => s.offering_id || (s as any).id).filter(Boolean);
    const primarySpan = primaryIds.length
      ? spanForOfferingIds(primaryIds)
      : bookingData.selectedServices.reduce((s, e) => s + ((e as any).duration_minutes ?? 60), 0) + 15;
    if (!bookingData.isGroupBooking || !bookingData.groupParticipants?.length) {
      const durationMinutes = primaryIds.length
        ? primarySpan - ((offeringsList.find((o) => o.id === primaryIds[primaryIds.length - 1])?.buffer_minutes ?? 15))
        : primarySpan - 15;
      const bufferMinutesLast = primaryIds.length
        ? (offeringsList.find((o) => o.id === primaryIds[primaryIds.length - 1])?.buffer_minutes ?? 15)
        : 15;
      return { durationMinutes: durationMinutes || 60, bufferMinutes: bufferMinutesLast };
    }
    let maxSpan = primarySpan;
    for (const p of bookingData.groupParticipants) {
      const ids = p.service_ids ?? (p as any).serviceIds ?? [];
      if (ids.length) maxSpan = Math.max(maxSpan, spanForOfferingIds(ids));
    }
    return { durationMinutes: maxSpan || 60, bufferMinutes: 0 };
  })();

  useEffect(() => {
    if (step !== "schedule" || !bookingData.selectedDate || bookingData.selectedServices.length === 0) return;
    const staffId = bookingData.selectedStaff?.id === "any" ? "any" : bookingData.selectedStaff?.id ?? "any";
    const dateStr = bookingData.selectedDate.toISOString().split("T")[0];
    const { durationMinutes, bufferMinutes } = slotParams;
    const serviceId = bookingData.selectedServices[0].offering_id;
    setLoadingSlots(true);
    const url = `/api/public/providers/${provider.slug}/availability?date=${dateStr}&service_id=${serviceId}&staff_id=${staffId}&duration_minutes=${durationMinutes}&buffer_minutes=${bufferMinutes}&location_id=${bookingData.selectedLocation?.id ?? ""}&min_notice_minutes=${settings.min_notice_minutes}&max_advance_days=${settings.max_advance_days}`;
    fetcher
      .get<{ data: any[] }>(url)
      .then((res) => {
        const raw = (res as any)?.data?.slots ?? (res as any)?.data ?? res ?? [];
        const list = Array.isArray(raw) ? raw : [];
        setSlots(
          list.map((s: any) => ({
            start: s.start ?? s.time,
            end: s.end ?? s.start ?? s.time,
            staff_id: s.staff_id,
            is_available: s.is_available !== false,
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
    settings.min_notice_minutes,
    settings.max_advance_days,
    slotParams.durationMinutes,
    slotParams.bufferMinutes,
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
    const dateStr = (d: Date) => d.toISOString().split("T")[0];
    const staffId = bookingData.selectedStaff?.id === "any" ? "any" : bookingData.selectedStaff?.id ?? "any";
    const { durationMinutes, bufferMinutes } = slotParams;
    const serviceId = bookingData.selectedServices[0]?.offering_id;
    if (!serviceId) return;
    for (let offset = 0; offset < Math.min(14, settings.max_advance_days); offset++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const url = `/api/public/providers/${provider.slug}/availability?date=${dateStr(d)}&service_id=${serviceId}&staff_id=${staffId}&duration_minutes=${durationMinutes}&buffer_minutes=${bufferMinutes}&location_id=${bookingData.selectedLocation?.id ?? ""}&min_notice_minutes=${settings.min_notice_minutes}&max_advance_days=${settings.max_advance_days}`;
      const res = await fetcher.get<{ data: any[] }>(url).catch(() => ({ data: [] }));
      const raw = (res as any)?.data?.slots ?? (res as any)?.data ?? [];
      const list = Array.isArray(raw) ? raw : [];
      const available = list.filter((s: any) => s.is_available !== false);
      if (available.length > 0) {
        setBookingData((prev) => ({ ...prev, selectedDate: d, selectedSlot: null }));
        setSlots(
          list.map((s: any) => ({
            start: s.start ?? s.time,
            end: s.end ?? s.start ?? s.time,
            staff_id: s.staff_id,
            is_available: s.is_available !== false,
          }))
        );
        setStep("schedule");
        return;
      }
    }
    toast.error("No available slots in the next two weeks");
  };

  const handleConfirm = async () => {
    if (bookingData.selectedServices.length === 0 || !bookingData.selectedSlot) return;
    if (bookingData.policyAccepted !== true) {
      toast.error("Please accept the cancellation policy to continue.");
      return;
    }
    // "any" or synthetic "provider-*" => send null so backend assigns staff
    const rawStaffId = bookingData.selectedSlot.staff_id ?? (bookingData.selectedStaff?.id !== "any" ? bookingData.selectedStaff?.id : null);
    const staffIdForHold =
      !rawStaffId || rawStaffId === "any" || String(rawStaffId).startsWith("provider-") ? null : rawStaffId;
    if (bookingData.venueType === "at_home" && (!bookingData.atHomeAddress.line1?.trim() || !bookingData.atHomeAddress.city?.trim())) {
      toast.error("Please enter your address for at-home booking");
      return;
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
          country: bookingData.atHomeAddress.country || "ZA",
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
            const query = [bookingData.atHomeAddress.line1.trim(), bookingData.atHomeAddress.city.trim(), bookingData.atHomeAddress.country || "ZA"].filter(Boolean).join(", ");
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
      });
      const id = (res as any)?.data?.hold_id ?? (res as any)?.hold_id;
      if (id) {
        setHoldId(id);
        try {
          sessionStorage.setItem("beautonomi_booking_client", JSON.stringify(bookingData.client));
          sessionStorage.setItem("beautonomi_booking_addons", JSON.stringify(bookingData.selectedAddonIds));
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
        toast.error("Failed to secure slot");
      }
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to secure slot");
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
            onNext={() => setStep("category")}
            providerName={provider.business_name}
          />
        )}

        {step === "services" && (
          <StepServices
            data={bookingData}
            offerings={offeringsForStep}
            categoryName={bookingData.selectedCategory?.name}
            packages={packages}
            variantsByServiceId={variantsByServiceId}
            onSelectPackage={(pkg) => {
              if (!pkg) {
                setBookingData((prev) => ({ ...prev, selectedPackage: null, selectedServices: [] }));
                return;
              }
              const services = (pkg.services ?? (pkg as any).items?.filter((x: any) => x.type === "service") ?? []).map(
                (s: any) => ({
                  offering_id: s.id,
                  title: s.title,
                  duration_minutes: s.duration_minutes ?? 60,
                  price: 0,
                  currency: pkg.currency,
                })
              );
              const totalDuration = services.reduce((a: number, b: BookingServiceEntry) => a + b.duration_minutes, 0);
              setBookingData((prev) => ({
                ...prev,
                selectedPackage: pkg,
                selectedServices: services,
                servicesSubtotal: pkg.price,
                totalDurationMinutes: totalDuration,
              }));
            }}
            onSelectService={(entries) => {
              setBookingData((prev) => ({
                ...prev,
                selectedPackage: null,
                selectedServices: entries,
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
            onSelectDate={(date) => updateData({ selectedDate: date, selectedSlot: null })}
            onSelectSlot={(slot) => updateData({ selectedSlot: slot })}
            onNextAvailable={handleNextAvailable}
            onNext={() => setStep("resources")}
            maxAdvanceDays={settings.max_advance_days}
            providerId={provider.id}
            serviceId={bookingData.selectedServices[0]?.offering_id ?? null}
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
        open={gateOpen || preAuthGateOpen}
        onAuthComplete={handleAuthComplete}
        onClose={() => {
          setGateOpen(false);
          setPreAuthGateOpen(false);
        }}
        redirectUrl={
          preAuthGateOpen
            ? `${typeof window !== "undefined" ? window.location.origin : ""}/book/${provider.slug}?auth_return=calendar`
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
