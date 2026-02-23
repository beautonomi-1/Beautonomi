"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { BeautonomiGateModal } from "./BeautonomiGateModal";
import {
  BookingNav,
  StepVenue,
  StepServices,
  StepAddons,
  StepStaff,
  StepSchedule,
  StepIntake,
  StepReview,
} from "./booking-engine";
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
} from "../types/booking-engine";

const BOOKING_BG = "#F2F2F7";

const defaultBookingData: BookingData = {
  venueType: "at_salon",
  selectedLocation: null,
  atHomeAddress: { line1: "", city: "", country: "ZA" },
  selectedPackage: null,
  selectedServices: [],
  selectedAddonIds: [],
  addonsSubtotal: 0,
  selectedStaff: null,
  selectedDate: null,
  selectedSlot: null,
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
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep] = useState<BookingStep>("venue");
  const [bookingData, setBookingData] = useState<BookingData>(() => ({
    ...defaultBookingData,
    venueType: (queryParams.location_type as "at_salon" | "at_home") ?? "at_salon",
  }));

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

  const [slots, setSlots] = useState<Array<{ start: string; end: string; staff_id?: string }>>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [preAuthGateOpen, setPreAuthGateOpen] = useState(false);
  const [creatingHold, setCreatingHold] = useState(false);

  const showStaffStep = settings.staff_selection_mode === "client_chooses";
  const authBeforeSlots = settings.require_auth_step === "before_time_selection";

  const updateData = useCallback((patch: Partial<BookingData>) => {
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

  useEffect(() => {
    setBookingData((prev) => {
      const addonsSubtotal = prev.selectedAddonIds.reduce((sum, id) => {
        const a = addons.find((x) => x.id === id);
        return sum + (a ? a.price : 0);
      }, 0);
      return { ...prev, addonsSubtotal };
    });
  }, [addons, bookingData.selectedAddonIds]);

  useEffect(() => {
    const load = async () => {
      try {
        const [offeringsRes, staffRes, providerRes, settingsRes, packagesRes] = await Promise.all([
          fetcher.get<{ data: ServiceOption[] }>(`/api/public/providers/${provider.slug}/offerings`),
          fetcher.get<{ data: StaffOption[] }>(`/api/public/providers/${provider.slug}/staff`),
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
        if (locs?.length > 0) {
          const primary = locs.find((l: LocationOption) => l.is_primary) ?? locs[0];
          const fromQuery = queryParams.location ? locs.find((l: any) => l.id === queryParams.location || (l as any).slug === queryParams.location) : null;
          setBookingData((prev) => ({
            ...prev,
            selectedLocation: fromQuery ?? primary,
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
      } catch (e) {
        toast.error(e instanceof FetchError ? e.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [provider.slug, queryParams.service, queryParams.staff, queryParams.anyone, queryParams.location]);

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

  useEffect(() => {
    if (step !== "schedule" || !bookingData.selectedDate || bookingData.selectedServices.length === 0) return;
    const staffId = bookingData.selectedStaff?.id === "any" ? "any" : bookingData.selectedStaff?.id ?? "any";
    const dateStr = bookingData.selectedDate.toISOString().split("T")[0];
    const duration = bookingData.totalDurationMinutes || 60;
    const serviceId = bookingData.selectedServices[0].offering_id;
    setLoadingSlots(true);
    fetcher
      .get<{ data: any[] }>(
        `/api/public/providers/${provider.slug}/availability?date=${dateStr}&service_id=${serviceId}&staff_id=${staffId}&duration_minutes=${duration}&location_id=${bookingData.selectedLocation?.id ?? ""}&min_notice_minutes=${settings.min_notice_minutes}&max_advance_days=${settings.max_advance_days}`
      )
      .then((res) => {
        const raw = (res as any)?.data?.slots ?? (res as any)?.data ?? res ?? [];
        const list = Array.isArray(raw) ? raw : [];
        setSlots(
          list
            .filter((s: any) => s.is_available !== false)
            .map((s: any) => ({
              start: s.start ?? s.time,
              end: s.end ?? s.start ?? s.time,
              staff_id: s.staff_id,
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
  ]);

  const stepsOrder: BookingStep[] = showStaffStep
    ? ["venue", "services", "addons", "staff", "schedule", "intake", "review"]
    : ["venue", "services", "addons", "schedule", "intake", "review"];

  const goBack = () => {
    const i = stepsOrder.indexOf(step);
    if (i > 0) setStep(stepsOrder[i - 1]);
  };

  const handleNextAvailable = async () => {
    const dateStr = (d: Date) => d.toISOString().split("T")[0];
    const staffId = bookingData.selectedStaff?.id === "any" ? "any" : bookingData.selectedStaff?.id ?? "any";
    const duration = bookingData.totalDurationMinutes || 60;
    const serviceId = bookingData.selectedServices[0]?.offering_id;
    if (!serviceId) return;
    for (let offset = 0; offset < Math.min(14, settings.max_advance_days); offset++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const res = await fetcher.get<{ data: any[] }>(
        `/api/public/providers/${provider.slug}/availability?date=${dateStr(d)}&service_id=${serviceId}&staff_id=${staffId}&duration_minutes=${duration}&location_id=${bookingData.selectedLocation?.id ?? ""}&min_notice_minutes=${settings.min_notice_minutes}&max_advance_days=${settings.max_advance_days}`
      ).catch(() => ({ data: [] }));
      const raw = (res as any)?.data?.slots ?? (res as any)?.data ?? [];
      const list = Array.isArray(raw) ? raw : [];
      const available = list.filter((s: any) => s.is_available !== false);
      if (available.length > 0) {
        setBookingData((prev) => ({ ...prev, selectedDate: d, selectedSlot: null }));
        setSlots(
          available.map((s: any) => ({
            start: s.start ?? s.time,
            end: s.end ?? s.start ?? s.time,
            staff_id: s.staff_id,
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
    const staffIdForHold = bookingData.selectedSlot.staff_id ?? (bookingData.selectedStaff?.id !== "any" ? bookingData.selectedStaff?.id : null);
    if (!staffIdForHold) {
      toast.error("Please select a specific time slot (staff will be assigned).");
      return;
    }
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
      });
      const id = (res as any)?.data?.hold_id ?? (res as any)?.hold_id;
      if (id) {
        setHoldId(id);
        try {
          sessionStorage.setItem("beautonomi_booking_client", JSON.stringify(bookingData.client));
          sessionStorage.setItem("beautonomi_booking_addons", JSON.stringify(bookingData.selectedAddonIds));
          sessionStorage.setItem("beautonomi_booking_special_requests", bookingData.client.specialRequests || "");
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

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: BOOKING_BG }}>
      <BookingNav
        currentStep={step}
        onBack={step !== "venue" ? goBack : undefined}
        showStepper={true}
        embed={embed}
        steps={stepsOrder}
      />

      <main className={embed ? "mx-auto max-w-md px-4 py-4" : "mx-auto max-w-lg px-4 py-6"}>
        {step === "venue" && (
          <StepVenue
            data={bookingData}
            locations={locations}
            onChange={updateData}
            onNext={() => setStep("services")}
          />
        )}

        {step === "services" && (
          <StepServices
            data={bookingData}
            offerings={offerings}
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
            onNext={() => setStep("intake")}
            maxAdvanceDays={settings.max_advance_days}
          />
        )}

        {step === "intake" && (
          <StepIntake
            data={bookingData}
            onChange={(client) =>
              setBookingData((prev) => ({ ...prev, client: { ...prev.client, ...client } }))
            }
            onNext={() => setStep("review")}
          />
        )}

        {step === "review" && (
          <StepReview
            data={bookingData}
            providerName={provider.business_name}
            onConfirm={handleConfirm}
            isCreatingHold={creatingHold}
          />
        )}
      </main>

      <footer className="mt-8 text-center text-xs text-gray-500 px-4">
        <p>Secure checkout · Cancellation policy applies</p>
      </footer>

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
    </div>
  );
}
