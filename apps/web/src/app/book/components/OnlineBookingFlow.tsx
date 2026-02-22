"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { BeautonomiGateModal } from "./BeautonomiGateModal";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { ChevronLeft, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

interface OnlineBookingFlowProps {
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

interface Service {
  id: string;
  title: string;
  duration_minutes: number;
  price: number;
  currency: string;
}

interface Staff {
  id: string;
  name: string;
  role: string;
}

interface Location {
  id: string;
  name: string;
  address_line1: string;
  city: string;
  country: string;
  is_primary: boolean;
}

interface AtHomeAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  country: string;
  postal_code?: string;
}

type Step = "services" | "venue" | "staff" | "calendar" | "slots";

const defaultSettings: OnlineBookingSettings = {
  staff_selection_mode: "client_chooses",
  require_auth_step: "checkout",
  min_notice_minutes: 60,
  max_advance_days: 90,
};

export default function OnlineBookingFlow({
  provider,
  queryParams = {},
  embed = false,
}: OnlineBookingFlowProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("services");
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [locationType, setLocationType] = useState<"at_salon" | "at_home">(
    queryParams.location_type ?? "at_salon"
  );
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [atHomeAddress, setAtHomeAddress] = useState<AtHomeAddress>({
    line1: "",
    city: "",
    country: "ZA",
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<{ time: string; start: string; end: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [creatingHold, setCreatingHold] = useState(false);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [preAuthGateOpen, setPreAuthGateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<OnlineBookingSettings>(defaultSettings);

  const goToCalendarOrAuth = () => {
    if (authBeforeSlots && !user) {
      // Persist state for restore after OAuth redirect
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(
            "beautonomi_preauth_state",
            JSON.stringify({
              selectedService,
              selectedStaff,
              selectedLocation,
              locationType,
              atHomeAddress,
            })
          );
        }
      } catch {
        // ignore
      }
      setPreAuthGateOpen(true);
    } else {
      setStep("calendar");
    }
  };

  const showStaffStep =
    settings.staff_selection_mode === "client_chooses";
  const _defaultToAnyone = settings.staff_selection_mode === "anyone_default";
  const authBeforeSlots = settings.require_auth_step === "before_time_selection";

  useEffect(() => {
    Promise.all([
      fetcher.get<{ data: { offerings?: Service[] } }>(
        `/api/public/providers/${provider.slug}/offerings`
      ),
      fetcher.get<{ data: { staff?: Staff[] } }>(
        `/api/public/providers/${provider.slug}/staff`
      ),
      fetcher
        .get<{ data: { id: string; slug: string; locations?: Location[] } }>(
          `/api/public/providers/${provider.slug}`
        )
        .catch(() => ({ data: { locations: [] } })),
      fetcher
        .get<{ data: OnlineBookingSettings }>(
          `/api/public/providers/${provider.slug}/online-booking-settings`
        )
        .catch(() => ({ data: defaultSettings })),
    ])
      .then(([svcRes, staffRes, provRes, settingsRes]) => {
        const offerings = (svcRes.data as any)?.offerings ?? (svcRes.data as any) ?? [];
        const servicesList = Array.isArray(offerings) ? offerings : [];
        setServices(servicesList);
        const staffList = (staffRes.data as any)?.staff ?? (staffRes.data as any) ?? [];
        setStaff(Array.isArray(staffList) ? staffList : []);
        const locs = (provRes.data as any)?.locations ?? [];
        setLocations(Array.isArray(locs) ? locs : []);
        if (locs?.length > 0) {
          setSelectedLocation((prev) => {
            if (prev) return prev;
            if (queryParams.location) {
              const match = (locs as Location[]).find(
                (l) => l.id === queryParams.location || (l as any).slug === queryParams.location
              );
              if (match) return match;
            }
            return locs.find((l: Location) => l.is_primary) ?? locs[0];
          });
        }
        const s = (settingsRes as any)?.data ?? defaultSettings;
        setSettings(s);

        if (queryParams.service) {
          const match = servicesList.find(
            (svc: Service) => svc.id === queryParams.service || (svc as any).slug === queryParams.service
          );
          if (match) setSelectedService(match);
        }
        if (
          queryParams.anyone ||
          (s as OnlineBookingSettings).staff_selection_mode === "anyone_default" ||
          (s as OnlineBookingSettings).staff_selection_mode === "hidden_auto_assign"
        ) {
          setSelectedStaff({ id: "any", name: "Anyone available", role: "" });
        } else if (queryParams.staff) {
          const staffMatch = (Array.isArray(staffList) ? staffList : []).find(
            (st: Staff) => st.id === queryParams.staff || (st as any).slug === queryParams.staff
          );
          if (staffMatch) setSelectedStaff(staffMatch);
        }
      })
      .catch((e) => {
        toast.error(e instanceof FetchError ? e.message : "Failed to load");
      })
      .finally(() => setIsLoading(false));
  }, [provider.slug, queryParams.service, queryParams.staff, queryParams.anyone, queryParams.location]);

  useEffect(() => {
    if (queryParams.auth_return === "slots" && queryParams.date && user && selectedService && selectedStaff) {
      const d = new Date(queryParams.date);
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        setStep("slots");
      }
    }
  }, [queryParams.auth_return, queryParams.date, user, selectedService, selectedStaff]);

  useEffect(() => {
    if (queryParams.auth_return === "calendar" && user) {
      // Restore state from sessionStorage (lost during OAuth redirect)
      try {
        const saved = typeof sessionStorage !== "undefined" && sessionStorage.getItem("beautonomi_preauth_state");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.selectedService && services.some((s) => s.id === parsed.selectedService.id)) {
            setSelectedService(parsed.selectedService);
          }
          if (parsed.selectedStaff) {
            setSelectedStaff(
              parsed.selectedStaff.id === "any"
                ? { id: "any", name: "Anyone available", role: "" }
                : staff.find((s) => s.id === parsed.selectedStaff.id) ?? parsed.selectedStaff
            );
          }
          if (parsed.selectedLocation && locations.some((l: Location) => l.id === parsed.selectedLocation?.id)) {
            setSelectedLocation(parsed.selectedLocation);
          }
          if (parsed.locationType) setLocationType(parsed.locationType);
          if (parsed.atHomeAddress && Object.keys(parsed.atHomeAddress).length > 0) {
            setAtHomeAddress((prev) => ({ ...prev, ...parsed.atHomeAddress }));
          }
          sessionStorage.removeItem("beautonomi_preauth_state");
        }
      } catch {
        // ignore restore errors
      }
      setStep("calendar");
    }
  }, [queryParams.auth_return, user, services, staff, locations]);

  useEffect(() => {
    if (step !== "slots" || !selectedDate || !selectedService || !selectedStaff) return;
    setLoadingSlots(true);
    const dateStr = selectedDate.toISOString().split("T")[0];
    const staffParam = selectedStaff.id === "any" ? "any" : selectedStaff.id;
    fetcher
      .get<{ data: { slots?: any[] } }>(
        `/api/public/providers/${provider.slug}/availability?date=${dateStr}&service_id=${selectedService.id}&staff_id=${staffParam}&duration_minutes=${selectedService.duration_minutes}&location_id=${selectedLocation?.id ?? ""}&min_notice_minutes=${settings.min_notice_minutes}&max_advance_days=${settings.max_advance_days}`
      )
      .then((res) => {
        const s = (res.data as any)?.slots ?? res.data ?? [];
        setSlots(Array.isArray(s) ? s : []);
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [step, selectedDate, selectedService, selectedStaff, selectedLocation, provider.slug, settings.min_notice_minutes, settings.max_advance_days]);

  const handleSecureSlot = async (
    slotStart: string,
    slotEnd: string,
    slotStaffId?: string
  ) => {
    if (!selectedService || !selectedStaff) return;
    if (locationType === "at_home" && (!atHomeAddress.line1?.trim() || !atHomeAddress.city?.trim())) {
      toast.error("Please enter your address for at-home booking");
      return;
    }
    const staffIdForHold =
      slotStaffId ?? (selectedStaff.id !== "any" ? selectedStaff.id : null);
    if (!staffIdForHold) {
      toast.error("Unable to secure this slot. Please select a specific staff member.");
      return;
    }
    setCreatingHold(true);
    try {
      const res = await fetcher.post<{ data: { hold_id: string; expires_at: string } }>(
        "/api/public/booking-holds",
        {
          provider_id: provider.id,
          staff_id: staffIdForHold,
          services: [{ offering_id: selectedService.id, staff_id: staffIdForHold }],
          start_at: slotStart,
          end_at: slotEnd,
          location_type: locationType,
          location_id: locationType === "at_salon" ? selectedLocation?.id : null,
          address:
            locationType === "at_home" &&
            atHomeAddress.line1.trim() &&
            atHomeAddress.city.trim()
              ? {
                  line1: atHomeAddress.line1.trim(),
                  city: atHomeAddress.city.trim(),
                  country: atHomeAddress.country.trim() || "ZA",
                  line2: atHomeAddress.line2,
                  state: atHomeAddress.state,
                  postal_code: atHomeAddress.postal_code,
                }
              : null,
        }
      );
      const id = (res.data as any)?.hold_id ?? res.data?.hold_id;
      if (id) {
        setHoldId(id);
        setGateOpen(true);
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
    if (holdId) {
      router.push(`/book/continue?hold_id=${holdId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${embed ? "p-2" : ""}`}>
      <div className={`mx-auto space-y-6 ${embed ? "max-w-md p-3" : "max-w-lg p-6"}`}>
        <h1 className={embed ? "text-lg font-semibold" : "text-2xl font-semibold"}>
          Book with {provider.business_name}
        </h1>

        {step === "services" && (
          <div className="space-y-4">
            <h2 className="font-medium">Select a service</h2>
            {services.length === 0 ? (
              <p className="text-muted-foreground">No services available</p>
            ) : (
              <div className="space-y-2">
                {services.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedService(s);
                      setStep("venue");
                    }}
                    className="w-full text-left p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="font-medium">{s.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {s.duration_minutes} min · {formatCurrency(s.price, s.currency)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "venue" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("services")}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <h2 className="font-medium">Where?</h2>
            <div className="flex gap-3">
              <Button
                variant={locationType === "at_salon" ? "default" : "outline"}
                onClick={() => setLocationType("at_salon")}
              >
                At salon
              </Button>
              <Button
                variant={locationType === "at_home" ? "default" : "outline"}
                onClick={() => setLocationType("at_home")}
              >
                At my location
              </Button>
            </div>
            {locationType === "at_salon" && locations.length > 1 && (
              <div className="space-y-2">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => setSelectedLocation(loc)}
                    className={`w-full text-left p-3 rounded border ${
                      selectedLocation?.id === loc.id ? "border-primary" : ""
                    }`}
                  >
                    {loc.name} · {loc.address_line1}, {loc.city}
                  </button>
                ))}
              </div>
            )}
            {locationType === "at_salon" && locations.length === 0 && (
              <p className="text-sm text-amber-600">
                This provider has no locations. Please choose &quot;At my location&quot; or select another provider.
              </p>
            )}
            {locationType === "at_home" && (
              <div className="space-y-3">
                <Label>Address (required for at-home bookings)</Label>
                <Input
                  placeholder="Street address"
                  value={atHomeAddress.line1}
                  onChange={(e) =>
                    setAtHomeAddress((a) => ({ ...a, line1: e.target.value }))
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="City"
                    value={atHomeAddress.city}
                    onChange={(e) =>
                      setAtHomeAddress((a) => ({ ...a, city: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="Country"
                    value={atHomeAddress.country}
                    onChange={(e) =>
                      setAtHomeAddress((a) => ({ ...a, country: e.target.value }))
                    }
                  />
                </div>
              </div>
            )}
            <Button
              onClick={() => {
                if (!showStaffStep) {
                  setSelectedStaff((prev) =>
                    prev?.id === "any" ? prev : { id: "any", name: "Anyone available", role: "" }
                  );
                  goToCalendarOrAuth();
                } else {
                  setStep("staff");
                }
              }}
              disabled={
                (locationType === "at_salon" && locations.length === 0) ||
                (locationType === "at_home" && (!atHomeAddress.line1.trim() || !atHomeAddress.city.trim()))
              }
            >
              Next
            </Button>
          </div>
        )}

        {step === "staff" && showStaffStep && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("venue")}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <h2 className="font-medium">Who?</h2>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setSelectedStaff({ id: "any", name: "Anyone available", role: "" });
                  goToCalendarOrAuth();
                }}
                className={`w-full text-left p-4 rounded-lg border hover:bg-muted/50 transition-colors ${
                  selectedStaff?.id === "any" ? "border-primary" : ""
                }`}
              >
                Anyone available
              </button>
              {staff.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedStaff(s);
                    goToCalendarOrAuth();
                  }}
                  className={`w-full text-left p-4 rounded-lg border hover:bg-muted/50 transition-colors ${
                    selectedStaff?.id === s.id ? "border-primary" : ""
                  }`}
                >
                  {s.name} · {s.role}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "calendar" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep(showStaffStep ? "staff" : "venue")}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <h2 className="font-medium">Pick a date</h2>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: Math.min(settings.max_advance_days, 90) }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() + i);
                const isSelected =
                  selectedDate?.toDateString() === d.toDateString();
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(d)}
                    className={`p-2 rounded text-sm ${
                      isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <Button
              onClick={() => setStep("slots")}
              disabled={!selectedDate}
            >
              Next
            </Button>
          </div>
        )}

        {step === "slots" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("calendar")}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <h2 className="font-medium">Pick a time</h2>
            {loadingSlots ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : slots.length === 0 ? (
              <p className="text-muted-foreground">No slots available for this date</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots
                  .filter((slot) => (slot as any).is_available !== false)
                  .map((slot, i) => {
                    const start = (slot as any).start ?? (slot as any).time ?? slot;
                    const end = (slot as any).end ?? start;
                    const slotStaffId = (slot as any).staff_id;
                    const displayTime =
                      typeof start === "string"
                        ? new Date(start).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : String(start);
                    return (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleSecureSlot(start, end, slotStaffId)
                        }
                        disabled={creatingHold}
                      >
                      {creatingHold ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        displayTime
                      )}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

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
            ? `${typeof window !== "undefined" ? window.location.origin : ""}/book/${provider.slug}?auth_return=calendar&location_type=${locationType}${selectedService ? `&service=${selectedService.id}` : ""}${selectedStaff ? (selectedStaff.id === "any" ? "&anyone=true" : `&staff=${selectedStaff.id}`) : ""}${selectedLocation ? `&location=${selectedLocation.id}` : ""}`
            : undefined
        }
      />
    </div>
  );
}
