import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useSelectedAddress } from "@/providers/SelectedAddressProvider";
import { api } from "@/lib/api-client";
import { useLocation } from "@/hooks/useLocation";
import { useAddresses, type SavedAddress } from "@/hooks/useAddresses";
import { AddressPicker } from "@/components/AddressPicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";
import { haptic } from "@/lib/haptics";
import { getApiErrorMessage } from "@/lib/api-error";
import { Skeleton } from "@/components/Skeleton";
import type {
  PublicProviderDetail,
  ProviderServicesResponse,
  ProviderService,
  StaffMember,
  ProviderLocation,
  AvailabilitySlot,
} from "@/types/api";

type Step = "service" | "venue" | "staff" | "date" | "time" | "addons";

export interface SelectedServiceItem {
  offeringId: string;
  title: string;
  duration_minutes: number;
  price: number;
  currency: string;
}

const STEP_LABELS: Record<Step, string> = {
  service: "Service",
  venue: "Venue",
  staff: "Staff",
  date: "Date",
  time: "Time",
  addons: "Extras",
};

function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ─── Step Progress Indicator ─── */
function StepIndicator({ steps, current }: { steps: Step[]; current: Step }) {
  const currentIdx = steps.indexOf(current);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingVertical: 12 }}>
      {steps.map((s, i) => {
        const isCompleted = i < currentIdx;
        const isActive = i === currentIdx;
        const isLast = i === steps.length - 1;
        return (
          <View key={s} style={{ flexDirection: "row", alignItems: "center", flex: isLast ? 0 : 1 }}>
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: isCompleted ? Colors.primary : isActive ? Colors.primary : "#E5E7EB",
              alignItems: "center", justifyContent: "center",
            }}>
              {isCompleted ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : (
                <Text style={{ color: isActive ? "#fff" : "#9CA3AF", fontWeight: "700", fontSize: 12 }}>{i + 1}</Text>
              )}
            </View>
            {!isLast && (
              <View style={{
                flex: 1, height: 2, marginHorizontal: 4,
                backgroundColor: isCompleted ? Colors.primary : "#E5E7EB",
              }} />
            )}
          </View>
        );
      })}
    </View>
  );
}

/* ─── Provider Summary Header ─── */
function BookingSummaryHeader({ provider, service, variant, selectedServices }: {
  provider: PublicProviderDetail;
  service: ProviderService | null;
  variant: { title?: string; price: number; duration_minutes: number } | null;
  selectedServices?: SelectedServiceItem[];
}) {
  const items = selectedServices && selectedServices.length > 0 ? selectedServices : null;
  const displayName = items
    ? items.length === 1 ? items[0].title : `${items.length} services`
    : (variant?.title ?? service?.title);
  const displayPrice = items ? items.reduce((s, i) => s + i.price, 0) : (variant?.price ?? service?.price);
  const displayDuration = items ? items.reduce((s, i) => s + i.duration_minutes, 0) : (variant?.duration_minutes ?? service?.duration_minutes);
  const currency = provider.currency ?? items?.[0]?.currency ?? "ZAR";

  return (
    <View style={{
      flexDirection: "row", alignItems: "center",
      backgroundColor: "#F9FAFB", borderRadius: 16, padding: 12, marginBottom: 12,
    }}>
      {provider.thumbnail_url ? (
        <Image source={{ uri: provider.thumbnail_url }} style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12 }} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
          <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 18 }}>{(provider.business_name || "P").charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }} numberOfLines={1}>{provider.business_name}</Text>
        {(displayName || displayDuration != null) && (
          <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }} numberOfLines={1}>
            {displayName} · {displayDuration} min · {currency} {Number(displayPrice ?? 0).toFixed(2)}
          </Text>
        )}
      </View>
    </View>
  );
}

/* ─── Date Cell for Calendar Grid ─── */
function DateCell({ date, isSelected, isToday, onPress }: {
  date: Date;
  isSelected: boolean;
  isToday: boolean;
  onPress: () => void;
}) {
  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, marginHorizontal: 2,
        backgroundColor: isSelected ? Colors.primary : "transparent",
      }}
      accessibilityRole="button"
      accessibilityLabel={`Select ${date.toLocaleDateString()}`}
      accessibilityState={{ selected: isSelected }}
    >
      <Text style={{ fontSize: 10, color: isSelected ? "rgba(255,255,255,0.7)" : "#9CA3AF", fontWeight: "500", marginBottom: 4 }}>
        {dayNames[date.getDay()]}
      </Text>
      <Text style={{
        fontSize: 16, fontWeight: "700",
        color: isSelected ? "#fff" : isToday ? Colors.primary : "#111827",
      }}>
        {date.getDate()}
      </Text>
      <Text style={{ fontSize: 9, color: isSelected ? "rgba(255,255,255,0.7)" : "#9CA3AF", marginTop: 2 }}>
        {date.toLocaleDateString("en-US", { month: "short" })}
      </Text>
    </TouchableOpacity>
  );
}

/* ═══════════════════════════════════════════
   Main Screen
   ═══════════════════════════════════════════ */
export default function BookScreen() {
  useScreenTracking("Book");
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(500, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};
  const { slug, service_id, duration_minutes, reschedule_booking_id, campaign_id, provider_id, step: stepParam } = useLocalSearchParams<{
    slug: string;
    service_id?: string;
    duration_minutes?: string;
    reschedule_booking_id?: string;
    campaign_id?: string;
    provider_id?: string;
    step?: string;
  }>();
  const { user } = useAuth();
  const { coords } = useLocation();
  const { selectedAddress: primaryAddress } = useSelectedAddress();
  const { addresses: savedAddresses } = useAddresses(!!user);

  const validSteps: Step[] = ["service", "venue", "staff", "date", "time", "addons"];
  const initialStep: Step = stepParam && validSteps.includes(stepParam as Step) ? (stepParam as Step) : "service";

  const [provider, setProvider] = useState<PublicProviderDetail | null>(null);
  const [servicesData, setServicesData] = useState<ProviderServicesResponse | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>(initialStep);
  const [selectedService, setSelectedService] = useState<ProviderService | null>(null);
  const [selectedServices, setSelectedServices] = useState<SelectedServiceItem[]>([]);
  const [locationType, setLocationType] = useState<"at_salon" | "at_home">("at_salon");
  const [selectedLocation, setSelectedLocation] = useState<ProviderLocation | null>(null);
  const [atHomeAddress, setAtHomeAddress] = useState({ line1: "", city: "", country: "ZA" });
  const [atHomeCoords, setAtHomeCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressPickerVisible, setAddressPickerVisible] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<{
    id: string; title?: string; duration_minutes: number; price: number;
  } | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [creatingHold, setCreatingHold] = useState(false);
  const [addonsList, setAddonsList] = useState<{ id: string; title?: string; name?: string; price: number; duration_minutes?: number; currency?: string; is_recommended?: boolean }[]>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [waitlistJoining, setWaitlistJoining] = useState(false);

  // Week navigation for date picker
  const [weekOffset, setWeekOffset] = useState(0);

  const visibleSteps = useMemo(() => {
    const steps: Step[] = ["service", "venue"];
    if (staff.length > 0) steps.push("staff");
    steps.push("date", "time", "addons");
    return steps;
  }, [staff.length]);

  const loadProviderAndServices = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const [provRes, svcRes, staffRes] = await Promise.all([
        api.get<PublicProviderDetail>(`/api/public/providers/${encodeURIComponent(slug)}`),
        api.get<ProviderServicesResponse>(`/api/public/providers/${encodeURIComponent(slug)}/services`),
        api.get<StaffMember[] | { data: StaffMember[] }>(`/api/public/providers/${encodeURIComponent(slug)}/staff`),
      ]);

      if (provRes.error || !provRes.data) {
        setError(provRes.error?.message || "Provider not found");
      } else {
        setProvider(provRes.data);
        const locs = provRes.data.locations || [];
        if (locs.length === 1) setSelectedLocation(locs[0]);
      }

      if (!svcRes.error && svcRes.data) {
        setServicesData(svcRes.data);
        if (service_id) {
          const flat: ProviderService[] = (svcRes.data.categories || []).flatMap((c) => c.services);
          const svc = flat.find((s) => s.id === service_id || s.variants?.some((v) => v.id === service_id));
          if (svc) {
            setSelectedService(svc);
            const v = svc.variants?.find((vr) => vr.id === service_id) ?? svc.variants?.[0];
            const offeringId = v?.id ?? svc.id;
            const dur = v?.duration_minutes ?? svc.duration_minutes ?? 60;
            const price = v?.price ?? svc.price ?? 0;
            const currency = svc.currency ?? "ZAR";
            setSelectedServices([{ offeringId, title: v?.title ?? svc.title ?? "", duration_minutes: dur, price, currency }]);
            if (v) setSelectedVariant(v);
          }
        }
      }

      const staffRaw = staffRes.data;
      const staffList: StaffMember[] = Array.isArray(staffRaw) ? staffRaw : (staffRaw as { data: StaffMember[] })?.data || [];
      setStaff(staffList);
      if (staffList.length === 1) setSelectedStaff(staffList[0]);
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, [slug, service_id]);

  useEffect(() => { loadProviderAndServices(); }, [loadProviderAndServices]);

  const effectiveDuration = selectedServices.length > 0
    ? selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0)
    : selectedVariant
      ? selectedVariant.duration_minutes
      : selectedService
        ? selectedService.variants?.[0]?.duration_minutes ?? selectedService.duration_minutes
        : parseInt(duration_minutes || "60", 10);
  const effectiveOfferingId = selectedServices.length > 0
    ? selectedServices[0].offeringId
    : selectedVariant
      ? selectedVariant.id
      : selectedService
        ? selectedService.variants?.[0]?.id || selectedService.id
        : service_id;

  const loadSlots = useCallback(async () => {
    if (!slug || !effectiveOfferingId || !selectedDate || !selectedStaff) return;
    setLoadingSlots(true);
    try {
      const dateStr = selectedDate.toISOString().split("T")[0];
      const params = new URLSearchParams({
        date: dateStr,
        service_id: effectiveOfferingId,
        staff_id: selectedStaff.id,
        duration_minutes: String(effectiveDuration),
      });
      if (locationType === "at_salon" && selectedLocation?.id) {
        params.set("location_id", selectedLocation.id);
      }
      const res = await api.get<{ slots?: AvailabilitySlot[]; data?: AvailabilitySlot[] }>(
        `/api/public/providers/${encodeURIComponent(slug)}/availability?${params}`
      );
      const data = (res.data ?? {}) as { slots?: AvailabilitySlot[]; data?: AvailabilitySlot[] };
      setSlots(data.slots ?? data.data ?? []);
      setSelectedSlot(null);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [slug, effectiveOfferingId, effectiveDuration, selectedDate, selectedStaff, locationType, selectedLocation]);

  const joinWaitlist = useCallback(async () => {
    if (!provider?.id || !selectedDate) return;
    const displayName =
      user?.user_metadata?.full_name ||
      [user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter(Boolean).join(" ") ||
      user?.email?.split("@")[0] ||
      "";
    if (!displayName.trim()) {
      Alert.alert("Name required", "Please add your name in Profile to join the waitlist.");
      return;
    }
    setWaitlistJoining(true);
    try {
      const preferredDate = selectedDate.toISOString().split("T")[0];
      const body: Record<string, string> = {
        provider_id: provider.id,
        customer_name: displayName.trim(),
        preferred_date: preferredDate,
        preferred_time_start: "09:00",
        preferred_time_end: "17:00",
      };
      if (user?.email) body.customer_email = user.email;
      if (user?.user_metadata?.phone || (user as { phone?: string })?.phone) body.customer_phone = (user?.user_metadata?.phone || (user as { phone?: string })?.phone) as string;
      if (effectiveOfferingId && /^[0-9a-f-]{36}$/i.test(effectiveOfferingId)) body.service_id = effectiveOfferingId;
      if (selectedStaff?.id && /^[0-9a-f-]{36}$/i.test(selectedStaff.id)) body.staff_id = selectedStaff.id;
      const res = await api.post<{ entry?: { id: string } }>("/api/public/waitlist", body);
      if (res.error) {
        const msg = (res.error as { message?: string })?.message || "Could not join waitlist.";
        const code = (res.error as { code?: string })?.code;
        if (code === "FEATURE_DISABLED" || code === "NOT_FOUND") {
          Alert.alert("Not available", "This provider doesn't offer waitlist.");
        } else if (code === "WAITLIST_FULL") {
          Alert.alert("Waitlist full", "The waitlist is currently full. Please try again later.");
        } else {
          Alert.alert("Error", msg);
        }
      } else {
        haptic.light();
        Alert.alert(
          "You're on the list",
          "We'll notify you when a slot opens for this date.",
          [
            { text: "OK" },
            { text: "View my waitlist", onPress: () => router.push("/(app)/account-settings/waitlist") },
          ]
        );
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not join waitlist.");
    } finally {
      setWaitlistJoining(false);
    }
  }, [provider?.id, selectedDate, user, effectiveOfferingId, selectedStaff?.id]);

  useEffect(() => {
    if (step === "time" && selectedDate && selectedStaff) loadSlots();
  }, [step, selectedDate, selectedStaff, loadSlots]);

  // Fetch addons for the selected service when on addons step (so user can add extras before checkout)
  useEffect(() => {
    if (step !== "addons" || !slug || !effectiveOfferingId) {
      setAddonsList([]);
      return;
    }
    api
      .get<{ data?: { all_addons?: { id: string; title?: string; name?: string; price: number; duration_minutes?: number; currency?: string; is_recommended?: boolean }[] }; all_addons?: unknown[] }>(
        `/api/public/providers/${encodeURIComponent(slug)}/services/${effectiveOfferingId}/addons`
      )
      .then((res) => {
        const data = (res.data ?? res) as any;
        const raw = data?.data?.all_addons ?? data?.all_addons ?? [];
        const list = Array.isArray(raw) ? raw : [];
        setAddonsList(list);
      })
      .catch(() => setAddonsList([]));
  }, [step, slug, effectiveOfferingId]);

  const createHold = useCallback(async () => {
    const servicesForHold = selectedServices.length > 0
      ? selectedServices
      : selectedService
        ? [{ offeringId: effectiveOfferingId, title: selectedVariant?.title ?? selectedService.title ?? "", duration_minutes: effectiveDuration, price: selectedVariant?.price ?? selectedService.price ?? 0, currency: selectedService.currency ?? "ZAR" }]
        : [];
    if (!provider || servicesForHold.length === 0 || !selectedStaff || !selectedSlot) return;
    setCreatingHold(true);
    try {
      const latLng = atHomeCoords ?? (coords ? { latitude: coords.latitude, longitude: coords.longitude } : null);
      const address = locationType === "at_home"
        ? { line1: atHomeAddress.line1, city: atHomeAddress.city, country: atHomeAddress.country, latitude: latLng?.latitude, longitude: latLng?.longitude }
        : undefined;

      const startAt = typeof selectedSlot.start === "string" && selectedSlot.start.includes("Z")
        ? selectedSlot.start
        : new Date(selectedSlot.start).toISOString();
      const endAt = typeof selectedSlot.end === "string" && selectedSlot.end.includes("Z")
        ? selectedSlot.end
        : new Date(selectedSlot.end).toISOString();

      const res = await api.post<{ hold_id?: string; id?: string }>("/api/public/booking-holds", {
        provider_id: provider.id,
        staff_id: selectedStaff.id,
        services: servicesForHold.map((s) => ({ offering_id: s.offeringId, staff_id: selectedStaff.id })),
        start_at: startAt,
        end_at: endAt,
        location_type: locationType,
        location_id: locationType === "at_salon" ? selectedLocation?.id : null,
        address,
      });

      const holdData = (res.data ?? {}) as { hold_id?: string; id?: string };
      const holdId = holdData.hold_id ?? holdData.id;
      if (res.error || !holdId) {
        setError(getApiErrorMessage(res.error, "Failed to reserve slot"));
        return;
      }

      haptic.success();
      const params: Record<string, string> = {
        hold_id: holdId,
        slug: provider.slug,
        service_name: servicesForHold.length === 1 ? servicesForHold[0].title : `${servicesForHold.length} services`,
        provider_name: provider.business_name,
        provider_thumbnail: provider.thumbnail_url ?? "",
      };
      if (reschedule_booking_id) params.reschedule_booking_id = reschedule_booking_id;
      if (campaign_id) params.campaign_id = campaign_id;
      if (provider_id) params.provider_id = provider_id;
      await AsyncStorage.setItem("beautonomi_booking_addons", JSON.stringify(selectedAddonIds));
      router.replace({ pathname: "/(app)/book-checkout", params });
    } catch (e) {
      setError(getApiErrorMessage(e as Error, "Failed to create booking"));
    } finally {
      setCreatingHold(false);
    }
  }, [provider, selectedService, selectedServices, selectedStaff, selectedSlot, locationType, atHomeAddress, atHomeCoords, coords, effectiveOfferingId, effectiveDuration, selectedLocation, selectedVariant, reschedule_booking_id, campaign_id, provider_id, selectedAddonIds]);

  const goBack = useCallback(() => {
    haptic.light();
    if (step === "venue") setStep("service");
    else if (step === "staff") setStep("venue");
    else if (step === "date") setStep(staff.length ? "staff" : "venue");
    else if (step === "time") setStep("date");
    else if (step === "addons") setStep("time");
    else router.back();
  }, [step, staff.length]);

  /* ═══ Loading skeleton ═══ */
  if (loading && !provider) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          {/* Custom header skeleton */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 52, paddingHorizontal: contentPadding, paddingBottom: 12, backgroundColor: "#fff" }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#F3F4F6", marginRight: 12 }} />
            <Skeleton width="40%" height={18} />
          </View>
          <View style={{ paddingHorizontal: contentPadding }}>
            {/* Step indicator skeleton */}
            <View style={{ flexDirection: "row", paddingVertical: 12 }}>
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} width={28} height={28} borderRadius={14} style={i < 4 ? { marginRight: 8 } : undefined} />)}
            </View>
            {/* Provider summary skeleton */}
            <View style={{ flexDirection: "row", backgroundColor: "#F9FAFB", borderRadius: 16, padding: 12 }}>
              <Skeleton width={44} height={44} borderRadius={22} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Skeleton width="60%" height={16} />
                <Skeleton width="80%" height={12} style={{ marginTop: 6 }} />
              </View>
            </View>
            {/* Service list skeleton */}
            <Skeleton width="30%" height={20} style={{ marginTop: 12 }} />
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: "#F3F4F6" }}>
                <Skeleton width="70%" height={16} />
                <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
              </View>
            ))}
          </View>
        </View>
      </>
    );
  }

  /* ═══ Error state ═══ */
  if (error && !provider) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: "#fff", padding: contentPadding, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
          <Text style={{ color: "#6B7280", marginTop: 12, textAlign: "center", fontSize: 15 }}>{error}</Text>
          <TouchableOpacity
            onPress={loadProviderAndServices}
            style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 20 }}
            accessibilityRole="button"
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (!provider || !servicesData) return null;

  const allServices = servicesData.categories.flatMap((c) => c.services);
  const today = new Date();
  const weekStart = addDays(today, weekOffset * 7);
  const weekDays = [...Array(7)].map((_, i) => addDays(weekStart, i)).filter((d) => d >= today || isSameDay(d, today));

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: "#fff" }} accessibilityLabel="Book appointment" accessibilityRole="none">
        {/* ═══ Custom Header ═══ */}
        <View style={{
          flexDirection: "row", alignItems: "center", paddingTop: 52, paddingHorizontal: contentPadding, paddingBottom: 8,
          backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#F3F4F6",
        }}>
          <TouchableOpacity
            onPress={goBack}
            style={{
              width: 38, height: 38, borderRadius: 19, backgroundColor: "#F3F4F6",
              alignItems: "center", justifyContent: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: "#111827", marginLeft: 12 }}>Book Appointment</Text>
          <Text style={{ fontSize: 12, color: "#9CA3AF", fontWeight: "500" }}>
            {STEP_LABELS[step]}
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: contentPadding, paddingBottom: 220, ...constraint }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            accessibilityLabel="Booking steps and options"
            accessibilityRole="none"
          >
            {/* Step Indicator */}
            <StepIndicator steps={visibleSteps} current={step} />

            {/* Provider Summary */}
            <BookingSummaryHeader provider={provider} service={selectedService} variant={selectedVariant} selectedServices={selectedServices.length > 0 ? selectedServices : undefined} />

            {/* Error banner */}
            {error && (
              <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <Text style={{ color: "#B91C1C", fontSize: 13 }}>{error}</Text>
              </View>
            )}

            {/* ── Step: Service ── */}
            {step === "service" && (
              <View>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 }}>Select service(s)</Text>
                {selectedServices.length > 0 && (
                  <View style={{ marginBottom: 16, padding: 12, backgroundColor: "#F0FDF4", borderRadius: 12, borderWidth: 1, borderColor: "#BBF7D0" }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#166534", marginBottom: 8 }}>Your selection ({selectedServices.length})</Text>
                    {selectedServices.map((item, idx) => (
                      <View key={`${item.offeringId}-${idx}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: idx < selectedServices.length - 1 ? 1 : 0, borderColor: "rgba(0,0,0,0.06)" }}>
                        <Text style={{ fontSize: 14, color: "#111827", flex: 1 }} numberOfLines={1}>{item.title} · {item.duration_minutes} min · {item.currency} {item.price.toFixed(2)}</Text>
                        <TouchableOpacity onPress={() => { haptic.light(); setSelectedServices((prev) => prev.filter((_, i) => i !== idx)); }} hitSlop={8} accessibilityLabel="Remove service">
                          <Ionicons name="close-circle" size={22} color="#B91C1C" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                {allServices.map((svc) => {
                  const hasVariants = svc.variants && svc.variants.length > 1;
                  const currency = svc.currency ?? "ZAR";
                  return (
                    <View key={svc.id} style={{ marginBottom: 4 }}>
                      <Pressable
                        onPress={() => {
                          if (!hasVariants) {
                            haptic.light();
                            setSelectedService(svc);
                            setSelectedVariant(null);
                            const offeringId = svc.variants?.[0]?.id ?? svc.id;
                            const dur = svc.variants?.[0]?.duration_minutes ?? svc.duration_minutes ?? 60;
                            const price = svc.variants?.[0]?.price ?? svc.price ?? 0;
                            setSelectedServices((prev) => [...prev, { offeringId, title: svc.title ?? "", duration_minutes: dur, price, currency }]);
                          }
                        }}
                        style={{
                          flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                          paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, marginBottom: 2,
                          backgroundColor: "#fff",
                          borderWidth: 1, borderColor: "#F3F4F6",
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${svc.title}, ${svc.duration_minutes} minutes`}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: "600", color: "#111827", fontSize: 15 }}>{svc.title}</Text>
                          <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                            {hasVariants ? "Multiple options — tap to choose" : `${svc.duration_minutes} min · ${currency} ${svc.price.toFixed(2)}`}
                          </Text>
                        </View>
                        {!hasVariants && <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />}
                        {hasVariants && <Ionicons name="chevron-down" size={18} color="#9CA3AF" />}
                      </Pressable>
                      {hasVariants && (
                        <View style={{ paddingLeft: 12, marginBottom: 8 }}>
                          {svc.variants!.map((v, vi) => (
                            <Pressable
                              key={v.id}
                              onPress={() => {
                                haptic.light();
                                setSelectedService(svc);
                                setSelectedVariant(v);
                                setSelectedServices((prev) => [...prev, { offeringId: v.id, title: v.title ?? svc.title ?? "", duration_minutes: v.duration_minutes, price: v.price, currency }]);
                              }}
                              style={{
                                flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                                borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
                                backgroundColor: "#F9FAFB",
                                borderColor: "#E5E7EB",
                                marginTop: vi === 0 ? 0 : 6,
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={`Add ${v.title ?? svc.title} ${v.duration_minutes} minutes`}
                            >
                              <View>
                                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{v.title ?? `${v.duration_minutes} min`}</Text>
                                <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{v.duration_minutes} min</Text>
                              </View>
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.primary, marginRight: 6 }}>{currency} {v.price.toFixed(2)}</Text>
                                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                              </View>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* ── Step: Venue ── */}
            {step === "venue" && (selectedService || selectedServices.length > 0) && (
              <View>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 }}>Where would you like your service?</Text>
                {provider.supports_salon && (provider.locations?.length ? (
                  (provider.locations.length === 1 ? (
                    <Pressable
                      onPress={() => {
                        haptic.light();
                        setLocationType("at_salon");
                        setSelectedLocation(provider.locations![0]);
                        setStep(staff.length ? "staff" : "date");
                      }}
                      style={{
                        flexDirection: "row", alignItems: "center",
                        padding: contentPadding, borderRadius: 16, marginBottom: 10,
                        borderWidth: 1.5, borderColor: locationType === "at_salon" ? Colors.primary : "#E5E7EB",
                        backgroundColor: locationType === "at_salon" ? Colors.primaryLight : "#fff",
                      }}
                      accessibilityRole="button" accessibilityLabel="At salon"
                    >
                      <View style={{
                        width: 48, height: 48, borderRadius: 12, backgroundColor: "#EDE9FE",
                        alignItems: "center", justifyContent: "center", marginRight: 14,
                      }}>
                        <Ionicons name="business-outline" size={24} color="#7C3AED" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "600", color: "#111827", fontSize: 15 }}>At Salon</Text>
                        <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{provider.locations[0].name}</Text>
                      </View>
                      {locationType === "at_salon" && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                    </Pressable>
                  ) : (
                    provider.locations.map((loc) => {
                      const isSelected = locationType === "at_salon" && selectedLocation?.id === loc.id;
                      return (
                        <Pressable
                          key={loc.id}
                          onPress={() => {
                            haptic.light();
                            setLocationType("at_salon");
                            setSelectedLocation(loc);
                            setStep(staff.length ? "staff" : "date");
                          }}
                          style={{
                            flexDirection: "row", alignItems: "center",
                            padding: contentPadding, borderRadius: 16, marginBottom: 10,
                            borderWidth: 1.5, borderColor: isSelected ? Colors.primary : "#E5E7EB",
                            backgroundColor: isSelected ? Colors.primaryLight : "#fff",
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`At salon ${loc.name}`}
                        >
                          <View style={{
                            width: 48, height: 48, borderRadius: 12, backgroundColor: "#EDE9FE",
                            alignItems: "center", justifyContent: "center", marginRight: 14,
                          }}>
                            <Ionicons name="business-outline" size={24} color="#7C3AED" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: "600", color: "#111827", fontSize: 15 }}>{loc.name}</Text>
                            {loc.address_line1 && (
                              <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }} numberOfLines={1}>{loc.address_line1}</Text>
                            )}
                          </View>
                          {isSelected && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                        </Pressable>
                      );
                    })
                  ))
                ) : (
                  <Pressable
                    onPress={() => {
                      haptic.light();
                      setLocationType("at_salon");
                      setSelectedLocation(null);
                      setStep(staff.length ? "staff" : "date");
                    }}
                    style={{
                      flexDirection: "row", alignItems: "center",
                      padding: contentPadding, borderRadius: 16, marginBottom: 10,
                      borderWidth: 1.5, borderColor: locationType === "at_salon" ? Colors.primary : "#E5E7EB",
                      backgroundColor: locationType === "at_salon" ? Colors.primaryLight : "#fff",
                    }}
                    accessibilityRole="button" accessibilityLabel="At salon"
                  >
                    <View style={{
                      width: 48, height: 48, borderRadius: 12, backgroundColor: "#EDE9FE",
                      alignItems: "center", justifyContent: "center", marginRight: 14,
                    }}>
                      <Ionicons name="business-outline" size={24} color="#7C3AED" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "600", color: "#111827", fontSize: 15 }}>At Salon</Text>
                    </View>
                    {locationType === "at_salon" && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                  </Pressable>
                ))}
                {provider.supports_house_calls && selectedService?.supports_at_home && (
                  <Pressable
                    onPress={() => {
                      haptic.light();
                      setLocationType("at_home");
                      if (primaryAddress) {
                        setAtHomeAddress({
                          line1: primaryAddress.displayName || primaryAddress.label || "",
                          city: "",
                          country: "ZA",
                        });
                        setAtHomeCoords({ latitude: primaryAddress.latitude, longitude: primaryAddress.longitude });
                      } else {
                        setAtHomeCoords(coords ? { latitude: coords.latitude, longitude: coords.longitude } : null);
                      }
                    }}
                    style={{
                      flexDirection: "row", alignItems: "center",
                      padding: contentPadding, borderRadius: 16, marginBottom: 10,
                      borderWidth: 1.5, borderColor: locationType === "at_home" ? Colors.primary : "#E5E7EB",
                      backgroundColor: locationType === "at_home" ? Colors.primaryLight : "#fff",
                    }}
                    accessibilityRole="button" accessibilityLabel="At my location"
                  >
                    <View style={{
                      width: 48, height: 48, borderRadius: 12, backgroundColor: "#ECFDF5",
                      alignItems: "center", justifyContent: "center", marginRight: 14,
                    }}>
                      <Ionicons name="home-outline" size={24} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "600", color: "#111827", fontSize: 15 }}>At My Location</Text>
                      <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>We&apos;ll come to you</Text>
                    </View>
                    {locationType === "at_home" && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                  </Pressable>
                )}
                {locationType === "at_home" && (
                  <View style={{ marginTop: 8 }}>
                    {user && savedAddresses.length > 0 && (
                      <View style={{ marginBottom: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: "#6B7280", marginBottom: 8 }}>Saved addresses</Text>
                        {savedAddresses.map((addr: SavedAddress) => {
                          const isSelected = atHomeAddress.line1 === addr.address_line1 && atHomeAddress.city === addr.city;
                          return (
                            <Pressable
                              key={addr.id}
                              onPress={() => {
                                haptic.light();
                                setAtHomeAddress({
                                  line1: addr.address_line1,
                                  city: addr.city,
                                  country: addr.country || "ZA",
                                });
                                setAtHomeCoords(
                                  addr.latitude != null && addr.longitude != null
                                    ? { latitude: addr.latitude, longitude: addr.longitude }
                                    : null
                                );
                              }}
                              style={{
                                flexDirection: "row", alignItems: "center",
                                paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6,
                                borderRadius: 12, borderWidth: 1.5,
                                borderColor: isSelected ? Colors.primary : "#E5E7EB",
                                backgroundColor: isSelected ? Colors.primaryLight : "#F9FAFB",
                              }}
                            >
                              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                                <Ionicons name={addr.is_default ? "star" : "home-outline"} size={18} color={isSelected ? Colors.primary : "#6B7280"} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{addr.label}</Text>
                                <Text style={{ fontSize: 12, color: "#6B7280" }} numberOfLines={1}>{addr.address_line1}, {addr.city}</Text>
                              </View>
                              {isSelected && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                            </Pressable>
                          );
                        })}
                        <TouchableOpacity
                          onPress={() => { haptic.light(); setAddressPickerVisible(true); }}
                          style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10 }}
                        >
                          <Ionicons name="search-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.primary }}>Enter different address</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {(!user || savedAddresses.length === 0) && (
                      <TouchableOpacity
                        onPress={() => { haptic.light(); setAddressPickerVisible(true); }}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, marginBottom: 4, marginTop: 10 }}
                      >
                        <Ionicons name="location-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.primary }}>Search address</Text>
                      </TouchableOpacity>
                    )}
                    <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 10 }}>Or enter manually</Text>
                    <TextInput
                      placeholder="Street address"
                      value={atHomeAddress.line1}
                      onChangeText={(t) => { setAtHomeAddress((a) => ({ ...a, line1: t })); if (!atHomeCoords && coords) setAtHomeCoords({ latitude: coords.latitude, longitude: coords.longitude }); }}
                      style={{
                        borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: contentPadding, paddingVertical: 14,
                        fontSize: 15, color: "#111827", backgroundColor: "#F9FAFB", marginTop: 10,
                      }}
                      placeholderTextColor="#9CA3AF"
                      accessibilityLabel="Street address"
                    />
                    <TextInput
                      placeholder="City"
                      value={atHomeAddress.city}
                      onChangeText={(t) => setAtHomeAddress((a) => ({ ...a, city: t }))}
                      style={{
                        borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: contentPadding, paddingVertical: 14,
                        fontSize: 15, color: "#111827", backgroundColor: "#F9FAFB", marginTop: 10,
                      }}
                      placeholderTextColor="#9CA3AF"
                      accessibilityLabel="City"
                    />
                    <TouchableOpacity
                      onPress={() => { haptic.medium(); setStep(staff.length ? "staff" : "date"); }}
                      disabled={!atHomeAddress.line1.trim() || !atHomeAddress.city.trim()}
                      style={{
                        backgroundColor: (!atHomeAddress.line1.trim() || !atHomeAddress.city.trim()) ? "#D1D5DB" : Colors.primary,
                        borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 10,
                      }}
                      accessibilityRole="button" accessibilityLabel="Continue"
                    >
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Continue</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── Step: Staff ── */}
            {step === "staff" && staff.length > 0 && (
              <View>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 }}>Choose your professional</Text>
                {staff.map((s) => {
                  const isSelected = selectedStaff?.id === s.id;
                  const initial = (s.name || "S").charAt(0).toUpperCase();
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        haptic.light();
                        setSelectedStaff(s);
                        setStep("date");
                      }}
                      style={{
                        flexDirection: "row", alignItems: "center",
                        padding: 14, borderRadius: 16, marginBottom: 8,
                        borderWidth: 1.5, borderColor: isSelected ? Colors.primary : "#F3F4F6",
                        backgroundColor: isSelected ? Colors.primaryLight : "#fff",
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${s.name}`}
                    >
                      {s.avatar_url ? (
                        <Image source={{ uri: s.avatar_url }} style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }} contentFit="cover" cachePolicy="memory-disk" />
                      ) : (
                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                          <Text style={{ color: "#6B7280", fontWeight: "700", fontSize: 18 }}>{initial}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827" }}>{s.name}</Text>
                        {s.role && <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{s.role}</Text>}
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* ── Step: Date (no staff available fallback) ── */}
            {step === "date" && staff.length === 0 && (
              <View style={{ backgroundColor: "#FFFBEB", borderRadius: 16, padding: contentPadding, alignItems: "center" }}>
                <Ionicons name="alert-circle-outline" size={32} color="#F59E0B" />
                <Text style={{ color: "#92400E", marginTop: 8, textAlign: "center", fontSize: 14, lineHeight: 20 }}>
                  Online booking for this provider requires staff selection. Book via the website instead.
                </Text>
                <TouchableOpacity
                  onPress={() => Linking.openURL(`${APP_URL}/book/${slug}`)}
                  style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 14 }}
                  accessibilityRole="button" accessibilityLabel="Book in browser"
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Book in Browser</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Step: Date (week-at-a-glance calendar) ── */}
            {step === "date" && staff.length > 0 && (
              <View>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 }}>Pick a date</Text>
                <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
                  {weekStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </Text>

                {/* Week navigation */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={() => { if (weekOffset > 0) setWeekOffset(weekOffset - 1); }}
                    disabled={weekOffset === 0}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: weekOffset === 0 ? "#F3F4F6" : "#E5E7EB", alignItems: "center", justifyContent: "center" }}
                    accessibilityLabel="Previous week"
                  >
                    <Ionicons name="chevron-back" size={18} color={weekOffset === 0 ? "#D1D5DB" : "#111827"} />
                  </TouchableOpacity>

                  <View style={{ flex: 1, flexDirection: "row", marginHorizontal: 4 }}>
                    {weekDays.map((d) => (
                      <DateCell
                        key={d.toISOString()}
                        date={d}
                        isSelected={selectedDate ? isSameDay(d, selectedDate) : false}
                        isToday={isSameDay(d, today)}
                        onPress={() => {
                          haptic.light();
                          setSelectedDate(d);
                          setStep("time");
                        }}
                      />
                    ))}
                  </View>

                  <TouchableOpacity
                    onPress={() => { if (weekOffset < 4) setWeekOffset(weekOffset + 1); }}
                    disabled={weekOffset >= 4}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: weekOffset >= 4 ? "#F3F4F6" : "#E5E7EB", alignItems: "center", justifyContent: "center" }}
                    accessibilityLabel="Next week"
                  >
                    <Ionicons name="chevron-forward" size={18} color={weekOffset >= 4 ? "#D1D5DB" : "#111827"} />
                  </TouchableOpacity>
                </View>

                {/* Quick jump: "Next week" chip */}
                <View style={{ flexDirection: "row", marginTop: 12 }}>
                  {["Today", "Tomorrow", "Next week"].map((label, i) => {
                    const targetDate = i === 0 ? today : i === 1 ? addDays(today, 1) : addDays(today, 7);
                    return (
                      <TouchableOpacity
                        key={label}
                        onPress={() => {
                          haptic.light();
                          setSelectedDate(targetDate);
                          if (i === 2) setWeekOffset(1);
                          else setWeekOffset(0);
                          setStep("time");
                        }}
                        style={{
                          backgroundColor: "#F3F4F6", borderRadius: 999,
                          paddingHorizontal: 14, paddingVertical: 8,
                          marginRight: i < 2 ? 8 : 0,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "500", color: "#374151" }}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Step: Time ── */}
            {step === "time" && selectedDate && (
              <View>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 }}>Pick a time</Text>
                <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
                  {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </Text>

                {loadingSlots ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <Skeleton key={i} width={80} height={44} borderRadius={12} style={{ marginRight: 8, marginBottom: 8 }} />
                    ))}
                  </View>
                ) : slots.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 24 }}>
                    <Ionicons name="time-outline" size={36} color="#D1D5DB" />
                    <Text style={{ color: "#6B7280", marginTop: 8, fontSize: 14, textAlign: "center" }}>
                      No available times for this date. The date or time may be fully booked or outside opening hours.
                    </Text>
                    <TouchableOpacity
                      onPress={() => setStep("date")}
                      style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: contentPadding, paddingVertical: 10, marginTop: 12 }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600" }}>Try Another Date</Text>
                    </TouchableOpacity>
                    {provider?.id && (
                      <TouchableOpacity
                        onPress={() => (user ? joinWaitlist() : router.push("/(auth)/login"))}
                        disabled={waitlistJoining}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          marginTop: 12,
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          borderRadius: 10,
                          borderWidth: 1.5,
                          borderColor: Colors.primary,
                          backgroundColor: "transparent",
                        }}
                      >
                        {waitlistJoining ? (
                          <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 8 }} />
                        ) : (
                          <Ionicons name="hourglass-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                        )}
                        <Text style={{ color: Colors.primary, fontWeight: "600", fontSize: 14 }}>
                          {user ? (waitlistJoining ? "Joining…" : "Join waitlist") : "Sign in to join waitlist"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  (() => {
                    const getPeriod = (iso: string) => {
                      const h = new Date(iso).getHours();
                      if (h < 12) return "Morning";
                      if (h < 17) return "Afternoon";
                      return "Evening";
                    };
                    const byPeriod = { Morning: [] as AvailabilitySlot[], Afternoon: [] as AvailabilitySlot[], Evening: [] as AvailabilitySlot[] };
                    slots.forEach((s) => {
                      const p = getPeriod(s.start);
                      byPeriod[p].push(s);
                    });
                    const order: ("Morning" | "Afternoon" | "Evening")[] = ["Morning", "Afternoon", "Evening"];
                    return (
                      <View>
                        {order.map((period) => {
                          const list = byPeriod[period];
                          if (list.length === 0) return null;
                          return (
                            <View key={period} style={{ marginBottom: 16 }}>
                              <Text style={{ fontSize: 12, fontWeight: "600", color: "#6B7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                {period}
                              </Text>
                              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                                {list.map((slot, i) => {
                                  const timeStr = new Date(slot.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
                                  const isSelected = selectedSlot?.start === slot.start;
                                  return (
                                    <TouchableOpacity
                                      key={i}
                                      onPress={() => { haptic.light(); setSelectedSlot(slot); }}
                                      style={{
                                        paddingHorizontal: contentPadding,
                                        paddingVertical: 12,
                                        borderRadius: 12,
                                        borderWidth: 1.5,
                                        backgroundColor: isSelected ? Colors.primary : "#fff",
                                        borderColor: isSelected ? Colors.primary : "#E5E7EB",
                                        marginRight: 8,
                                        marginBottom: 8,
                                      }}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Select time ${timeStr}`}
                                      accessibilityState={{ selected: isSelected }}
                                    >
                                      <Text style={{ fontWeight: "600", fontSize: 14, color: isSelected ? "#fff" : "#111827" }}>
                                        {timeStr}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()
                )}
              </View>
            )}
          </ScrollView>

          {/* ═══ Step: Add-ons (optional extras before checkout) ═══ */}
          {step === "addons" && (
            <View style={{ marginTop: 8, marginBottom: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 }}>Add extras (optional)</Text>
              <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>
                Optional add-ons to enhance your visit
              </Text>
              {addonsList.length === 0 ? (
                <View style={{ paddingVertical: 16, paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#F9FAFB", marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, color: "#6B7280" }}>No add-ons available for this service.</Text>
                </View>
              ) : (
                addonsList.map((addon) => {
                  const isSelected = selectedAddonIds.includes(addon.id);
                  const label = addon.title ?? addon.name ?? "Add-on";
                  const price = Number(addon.price) || 0;
                  const currency = provider?.currency ?? "ZAR";
                  return (
                    <Pressable
                      key={addon.id}
                      onPress={() => {
                        haptic.selection();
                        setSelectedAddonIds((prev) =>
                          prev.includes(addon.id) ? prev.filter((id) => id !== addon.id) : [...prev, addon.id]
                        );
                      }}
                      style={{
                        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                        padding: 14, borderRadius: 12, marginBottom: 8,
                        borderWidth: 1.5, borderColor: isSelected ? Colors.primary : "#E5E7EB",
                        backgroundColor: isSelected ? Colors.primaryLight : "#fff",
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${label} ${currency} ${price.toFixed(2)}`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827" }}>{label}</Text>
                        <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                          {addon.duration_minutes ? `+${addon.duration_minutes} min • ` : ""}
                          {currency} {price.toFixed(2)}
                        </Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
                    </Pressable>
                  );
                })
              )}
            </View>
          )}

          {/* ═══ Sticky Bottom CTA ═══ */}
          {step === "service" && (
            <View style={{
              paddingHorizontal: contentPadding, paddingVertical: 12, paddingBottom: 28,
              borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
            }}>
              <TouchableOpacity
                onPress={() => { haptic.medium(); setStep("venue"); }}
                disabled={selectedServices.length === 0}
                style={{
                  backgroundColor: selectedServices.length > 0 ? Colors.primary : "#D1D5DB",
                  borderRadius: 14, paddingVertical: 16,
                  alignItems: "center", flexDirection: "row", justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Next"
                accessibilityState={{ disabled: selectedServices.length === 0 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Next</Text>
                <Ionicons name="chevron-forward" size={20} color="#fff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          )}
          {step === "venue" && (selectedService || selectedServices.length > 0) && (
            <View style={{
              paddingHorizontal: contentPadding, paddingVertical: 12, paddingBottom: 28,
              borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
            }}>
              {(() => {
                const venueValid = locationType === "at_salon"
                  ? (selectedLocation != null || (provider?.locations?.length ?? 0) === 0)
                  : (atHomeAddress.line1.length > 0 || atHomeCoords != null);
                return (
                  <TouchableOpacity
                    onPress={() => { haptic.medium(); setStep(staff.length > 0 ? "staff" : "date"); }}
                    disabled={!venueValid}
                    style={{
                      backgroundColor: venueValid ? Colors.primary : "#D1D5DB",
                      borderRadius: 14, paddingVertical: 16,
                      alignItems: "center", flexDirection: "row", justifyContent: "center",
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Next"
                    accessibilityState={{ disabled: !venueValid }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Next</Text>
                    <Ionicons name="chevron-forward" size={20} color="#fff" style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                );
              })()}
            </View>
          )}
          {step === "staff" && staff.length > 0 && (
            <View style={{
              paddingHorizontal: contentPadding, paddingVertical: 12, paddingBottom: 28,
              borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
            }}>
              <TouchableOpacity
                onPress={() => { haptic.medium(); setStep("date"); }}
                disabled={!selectedStaff}
                style={{
                  backgroundColor: selectedStaff ? Colors.primary : "#D1D5DB",
                  borderRadius: 14, paddingVertical: 16,
                  alignItems: "center", flexDirection: "row", justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Next"
                accessibilityState={{ disabled: !selectedStaff }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Next</Text>
                <Ionicons name="chevron-forward" size={20} color="#fff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          )}
          {step === "date" && (staff.length === 0 || selectedStaff) && (
            <View style={{
              paddingHorizontal: contentPadding, paddingVertical: 12, paddingBottom: 28,
              borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
            }}>
              <TouchableOpacity
                onPress={() => { haptic.medium(); setStep("time"); }}
                disabled={!selectedDate}
                style={{
                  backgroundColor: selectedDate ? Colors.primary : "#D1D5DB",
                  borderRadius: 14, paddingVertical: 16,
                  alignItems: "center", flexDirection: "row", justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Next"
                accessibilityState={{ disabled: !selectedDate }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Next</Text>
                <Ionicons name="chevron-forward" size={20} color="#fff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          )}
          {step === "time" && selectedSlot && (
            <View style={{
              paddingHorizontal: contentPadding, paddingVertical: 12, paddingBottom: 28,
              borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
            }}>
              <TouchableOpacity
                onPress={() => { haptic.medium(); setStep("addons"); }}
                style={{
                  backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
                  alignItems: "center", flexDirection: "row", justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Next: Add extras"
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Next: Add extras</Text>
                <Ionicons name="chevron-forward" size={20} color="#fff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          )}
          {step === "addons" && (
            <View style={{
              paddingHorizontal: contentPadding, paddingVertical: 12, paddingBottom: 28,
              borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
            }}>
              <TouchableOpacity
                onPress={() => { haptic.medium(); createHold(); }}
                disabled={creatingHold}
                style={{
                  backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
                  alignItems: "center", flexDirection: "row", justifyContent: "center",
                  opacity: creatingHold ? 0.7 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel={user ? "Continue to payment" : "Sign in to continue"}
                accessibilityState={{ disabled: creatingHold }}
              >
                {creatingHold ? (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff", marginRight: 8 }} />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Reserving...</Text>
                  </View>
                ) : (
                  <>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                      {user ? "Continue to Payment" : "Sign in to Continue"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
      <AddressPicker
        visible={addressPickerVisible}
        onClose={() => setAddressPickerVisible(false)}
        onSelect={(addr) => {
          if (addr.structured) {
            setAtHomeAddress({
              line1: addr.structured.address_line1,
              city: addr.structured.city,
              country: addr.structured.country || "ZA",
            });
          } else {
            const display = addr.displayName || addr.label || "";
            const parts = display.split(",").map((s) => s.trim()).filter(Boolean);
            setAtHomeAddress({
              line1: parts[0] || display || "",
              city: parts[1] || parts[0] || "",
              country: "ZA",
            });
          }
          setAtHomeCoords({ latitude: addr.latitude, longitude: addr.longitude });
          setAddressPickerVisible(false);
        }}
        onUseCurrentLocation={() => {
          if (coords) {
            setAtHomeCoords({ latitude: coords.latitude, longitude: coords.longitude });
            setAtHomeAddress((a) => ({ ...a, line1: a.line1 || "Current location", city: a.city || "" }));
          }
          setAddressPickerVisible(false);
        }}
      />
    </>
  );
}
