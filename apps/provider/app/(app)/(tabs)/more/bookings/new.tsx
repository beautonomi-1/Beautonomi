import { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { format, addDays, isSameDay, parseISO, startOfDay } from "date-fns";
import { useApiPost, useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { formatDuration, formatCurrency } from "@/lib/format";
import { api } from "@/lib/api-client";
import { twStyle } from "@/lib/twStyle";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { StaticMapImage } from "@/components/ui/StaticMapImage";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { useDefaultPhoneDial } from "@/hooks/useDefaultPhoneDial";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Service {
  id: string;
  title: string;
  duration_minutes: number;
  price: number;
  currency: string;
  add_ons?: AddOn[];
}

interface AddOn {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface StaffMember {
  id: string;
  name: string;
  avatar_url?: string | null;
  role?: string;
}

interface ApiClient {
  id: string;
  customer_id: string;
  customer?: {
    id: string;
    full_name?: string;
    email?: string;
    phone?: string;
    avatar_url?: string | null;
  };
}

interface Client {
  id: string;
  customer_id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url?: string | null;
}

interface SelectedService {
  serviceId: string;
  staffId?: string;
  addOnIds: string[];
}

type DiscountType = "percentage" | "fixed";
type PaymentMethod = "cash" | "card" | "online";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TIME_SLOTS = (() => {
  const slots: string[] = [];
  for (let h = 6; h <= 21; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  slots.push("22:00");
  return slots;
})();

const DATE_RANGE_DAYS = 30;
const PAYMENT_METHODS: { label: string; value: PaymentMethod; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Cash", value: "cash", icon: "cash-outline" },
  { label: "Card", value: "card", icon: "card-outline" },
  { label: "Online", value: "online", icon: "globe-outline" },
];

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={twStyle("mb-1.5 text-sm font-semibold text-gray-700")}>
      {label}
      {required && <Text style={twStyle("text-red-500")}> *</Text>}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface PaymentSettings {
  taxRatePercent?: number;
  taxInclusive?: boolean;
}

export default function NewBookingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; time?: string; defaultStatus?: string; clientId?: string; client_id?: string }>();
  const { isTablet } = useResponsive();
  const { selectedLocationId } = useProvider();
  const tenantCurrency = getTenantDefaultCurrency();
  const { width: windowWidth } = useWindowDimensions();
  const { bundle } = useConfigBundle();
  const defaultPhoneDial = useDefaultPhoneDial();
  const mapboxCountryIso =
    bundle?.meta?.active_market_country?.trim().length === 2
      ? bundle.meta.active_market_country.trim().toUpperCase()
      : "ZA";

  // --- API data ---
  const { data: services, loading: servicesLoading } = useApi<Service[]>("/api/provider/services");
  const teamUrl = selectedLocationId
    ? `/api/provider/team?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/team";
  const { data: staffList } = useApi<StaffMember[]>(teamUrl);
  const { data: paymentSettings } = useApi<PaymentSettings>("/api/provider/settings/payments");
  const { data: referralSourcesRaw } = useApi<{ id: string; name: string; is_active?: boolean }[]>("/api/provider/referral-sources");
  const referralSources = useMemo(
    () => (Array.isArray(referralSourcesRaw) ? referralSourcesRaw.filter((s) => s.is_active !== false) : []),
    [referralSourcesRaw]
  );
  const { execute: createBooking, loading: creating } = useApiPost<any, any>("/api/provider/bookings");

  // --- Client search ---
  const [clientSearch, setClientSearch] = useState("");
  const [clientMode, setClientMode] = useState<"search" | "new">("search");
  const { data: rawSearchedClients, loading: clientsLoading } = useApi<ApiClient[]>(
    `/api/provider/clients?search=${encodeURIComponent(clientSearch)}`,
    { enabled: clientSearch.trim().length >= 2 }
  );
  const searchedClients = useMemo<Client[] | null>(() => {
    if (!rawSearchedClients) return null;
    return rawSearchedClients.map((c) => ({
      id: c.id,
      customer_id: c.customer_id,
      full_name: c.customer?.full_name || "Unknown",
      email: c.customer?.email || "",
      phone: c.customer?.phone || "",
      avatar_url: c.customer?.avatar_url ?? null,
    }));
  }, [rawSearchedClients]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newClientFirst, setNewClientFirst] = useState("");
  const [newClientLast, setNewClientLast] = useState("");
  const [newClientPhoneE164, setNewClientPhoneE164] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");

  // --- Date / Time ---
  const today = useMemo(() => startOfDay(new Date()), []);
  const dateOptions = useMemo(
    () => Array.from({ length: DATE_RANGE_DAYS }, (_, i) => addDays(today, i)),
    [today]
  );
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (params.date) {
      try { return parseISO(params.date); } catch { /* fallback */ }
    }
    return today;
  });
  const [selectedTime, setSelectedTime] = useState<string>(() => params.time ?? "");
  const [showTimePicker, setShowTimePicker] = useState(false);

  // --- Services ---
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [staffPickerService, setStaffPickerService] = useState<string | null>(null);
  const [addOnPickerService, setAddOnPickerService] = useState<string | null>(null);

  // Pre-select client from navigation params
  const preselectedClientId = params.clientId || params.client_id;
  const { data: rawPreselectedClients } = useApi<ApiClient[]>(
    `/api/provider/clients?search=`,
    { enabled: !!preselectedClientId && !selectedClient }
  );
  useEffect(() => {
    if (preselectedClientId && rawPreselectedClients && !selectedClient) {
      const raw = rawPreselectedClients.find(
        (c) => c.customer_id === preselectedClientId || c.id === preselectedClientId
      );
      if (raw) {
        setSelectedClient({
          id: raw.id,
          customer_id: raw.customer_id,
          full_name: raw.customer?.full_name || "Unknown",
          email: raw.customer?.email || "",
          phone: raw.customer?.phone || "",
          avatar_url: raw.customer?.avatar_url ?? null,
        });
      }
    }
  }, [preselectedClientId, rawPreselectedClients, selectedClient]);

  // --- Other ---
  const [locationType, setLocationType] = useState<"at_salon" | "at_home">("at_salon");
  const [addressSearchValue, setAddressSearchValue] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressStateProv, setAddressStateProv] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [addressLatitude, setAddressLatitude] = useState<number | null>(null);
  const [addressLongitude, setAddressLongitude] = useState<number | null>(null);
  const [travelFee, setTravelFee] = useState("");
  const [tipAmount, setTipAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [referralSourceId, setReferralSourceId] = useState<string>("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [, setCheckingAvailability] = useState(false);

  // Summary (must be before slotParams which uses summary.totalMinutes)
  const summary = useMemo(() => {
    let subtotal = 0;
    let totalMinutes = 0;
    const items: { name: string; price: number; duration: number; staffName?: string }[] = [];
    selectedServices.forEach((sel) => {
      const svc = services?.find((s) => s.id === sel.serviceId);
      if (!svc) return;
      subtotal += svc.price;
      totalMinutes += svc.duration_minutes;
      const staffName = staffList?.find((s) => s.id === sel.staffId)?.name;
      items.push({ name: svc.title, price: svc.price, duration: svc.duration_minutes, staffName });
      sel.addOnIds.forEach((aoId) => {
        const ao = svc.add_ons?.find((a) => a.id === aoId);
        if (!ao) return;
        subtotal += ao.price;
        totalMinutes += ao.duration_minutes;
        items.push({ name: `  + ${ao.name}`, price: ao.price, duration: ao.duration_minutes });
      });
    });
    const discountAmt = discountValue
      ? discountType === "percentage"
        ? (subtotal * parseFloat(discountValue || "0")) / 100
        : parseFloat(discountValue || "0")
      : 0;
    const afterDiscount = Math.max(subtotal - discountAmt, 0);
    const taxRatePercent = paymentSettings?.taxRatePercent ?? 15;
    const taxRate = taxRatePercent / 100;
    const taxInclusive = paymentSettings?.taxInclusive ?? true;
    const tax = taxInclusive
      ? afterDiscount - afterDiscount / (1 + taxRate)
      : afterDiscount * taxRate;
    const travelFeeNum = Number(travelFee) || 0;
    const tipNum = Number(tipAmount) || 0;
    const total = (taxInclusive ? afterDiscount : afterDiscount + tax) + travelFeeNum + tipNum;
    return { items, subtotal, discountAmt, afterDiscount, tax, total, totalMinutes, taxRate, taxRatePercent, taxInclusive, travelFeeNum, tipNum };
  }, [selectedServices, services, staffList, discountValue, discountType, paymentSettings, travelFee, tipAmount]);

  // Available time slots for selected date (considering bookings + time blocks)
  const slotParams = useMemo(() => {
    const d = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
    const dur = summary.totalMinutes || 60;
    const staffIds = selectedServices.map((s) => s.staffId).filter((id): id is string => !!id);
    return { date: d, duration_minutes: dur, staff_ids: staffIds.join(","), location_id: selectedLocationId ?? "" };
  }, [selectedDate, summary.totalMinutes, selectedServices, selectedLocationId]);
  const { data: availableSlotsData } = useApi<{ slots: string[]; date: string }>(
    `/api/provider/bookings/available-slots?date=${slotParams.date}&duration_minutes=${slotParams.duration_minutes}${slotParams.staff_ids ? `&staff_ids=${encodeURIComponent(slotParams.staff_ids)}` : ""}${slotParams.location_id ? `&location_id=${encodeURIComponent(slotParams.location_id)}` : ""}`,
    { enabled: !!slotParams.date }
  );
  const timeSlotsToShow = useMemo(
    () => (availableSlotsData?.slots?.length ? availableSlotsData.slots : TIME_SLOTS),
    [availableSlotsData?.slots]
  );

  // --- Helpers ---
  function toggleService(serviceId: string) {
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.serviceId === serviceId);
      if (exists) return prev.filter((s) => s.serviceId !== serviceId);
      return [...prev, { serviceId, addOnIds: [] }];
    });
  }

  function setStaffForService(serviceId: string, staffId: string) {
    setSelectedServices((prev) =>
      prev.map((s) => (s.serviceId === serviceId ? { ...s, staffId } : s))
    );
    setStaffPickerService(null);
  }

  function toggleAddOn(serviceId: string, addOnId: string) {
    setSelectedServices((prev) =>
      prev.map((s) => {
        if (s.serviceId !== serviceId) return s;
        const has = s.addOnIds.includes(addOnId);
        return {
          ...s,
          addOnIds: has ? s.addOnIds.filter((a) => a !== addOnId) : [...s.addOnIds, addOnId],
        };
      })
    );
  }

  // --- Validation ---
  function validate(): string | null {
    if (clientMode === "search" && !selectedClient) return "Please select a client";
    if (clientMode === "new" && !newClientFirst.trim()) return "Please enter client first name";
    if (clientMode === "new") {
      const phoneErr = validateE164Phone(newClientPhoneE164);
      if (phoneErr) return phoneErr;
    }
    if (!selectedDate) return "Please select a date";
    if (!selectedTime) return "Please select a time";
    if (selectedServices.length === 0) return "Please select at least one service";
    if (locationType === "at_home") {
      if (!addressLine1.trim()) return "Search and select the client's address";
      if (addressLatitude == null || addressLongitude == null) {
        return "Choose an address from the search suggestions so the map pin and travel distance are accurate.";
      }
    }
    return null;
  }

  async function checkAvailability(): Promise<boolean> {
    if (!selectedDate || !selectedTime || selectedServices.length === 0) return true;

    setCheckingAvailability(true);
    setConflictWarning(null);

    try {
      const scheduledAt = `${format(selectedDate, "yyyy-MM-dd")}T${selectedTime}:00`;
      const staffIds = selectedServices
        .map((s) => s.staffId)
        .filter((id): id is string => !!id);

      const params = new URLSearchParams({
        scheduled_at: scheduledAt,
        duration_minutes: String(summary.totalMinutes),
      });
      if (staffIds.length > 0) params.set("staff_ids", staffIds.join(","));
      if (selectedLocationId) params.set("location_id", selectedLocationId);

      const res = await api.get<{ available?: boolean; conflicts?: string[] }>(
        `/api/provider/bookings/check-availability?${params}`,
      );

      if (res.data && res.data.available === false) {
        const conflicts = res.data.conflicts ?? ["There is a scheduling conflict at this time."];
        setConflictWarning(conflicts.join("\n"));
        return false;
      }
      return true;
    } catch {
      // If the endpoint doesn't exist, proceed anyway (server-side will validate)
      return true;
    } finally {
      setCheckingAvailability(false);
    }
  }

  async function handleReview() {
    const err = validate();
    if (err) {
      Alert.alert("Missing information", err);
      return;
    }

    const available = await checkAvailability();
    if (!available) {
      Alert.alert(
        "Scheduling Conflict",
        conflictWarning ?? "There is a conflict at this time. Do you want to proceed anyway?",
        [
          { text: "Change Time", style: "cancel" },
          { text: "Proceed Anyway", onPress: () => setShowConfirmation(true) },
        ],
      );
      return;
    }
    setShowConfirmation(true);
  }

  async function handleCreate() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const clientPayload =
      clientMode === "search" && selectedClient
        ? { customer_id: selectedClient.customer_id }
        : {
            customer_name: `${newClientFirst.trim()} ${newClientLast.trim()}`.trim(),
            customer_phone: newClientPhoneE164.trim() || undefined,
            customer_email: newClientEmail.trim() || undefined,
          };

    const scheduledAt = `${format(selectedDate, "yyyy-MM-dd")}T${selectedTime}:00`;

    const payload: Record<string, unknown> = {
      ...clientPayload,
      scheduled_at: scheduledAt,
      services: selectedServices.map((s) => {
        const svc = services?.find((sv) => sv.id === s.serviceId);
        return {
          service_id: s.serviceId,
          staff_id: s.staffId || undefined,
          add_on_ids: s.addOnIds.length > 0 ? s.addOnIds : undefined,
          price: svc?.price || 0,
          duration_minutes: svc?.duration_minutes || 60,
          currency: svc?.currency || getTenantDefaultCurrency(),
        };
      }),
      location_type: locationType,
      location_id: locationType === "at_salon" ? selectedLocationId : undefined,
      special_requests: notes.trim() || undefined,
      subtotal: summary.subtotal,
      discount_amount: summary.discountAmt || 0,
      discount_reason: discountValue
        ? `${discountType === "percentage" ? discountValue + "%" : "R" + discountValue} discount`
        : undefined,
      tax_amount: summary.tax,
      tax_rate: summary.taxRatePercent,
      total_amount: summary.total,
      currency: getTenantDefaultCurrency(),
      status: params.defaultStatus || undefined,
      referral_source_id: referralSourceId.trim() || undefined,
    };
    if (summary.tipNum > 0) payload.tip_amount = summary.tipNum;
    if (locationType === "at_home") {
      if (summary.travelFeeNum > 0) payload.travel_fee = summary.travelFeeNum;
      if (addressLine1.trim()) payload.address_line1 = addressLine1.trim();
      if (addressLine2.trim()) payload.address_line2 = addressLine2.trim();
      if (addressCity.trim()) payload.address_city = addressCity.trim();
      if (addressStateProv.trim()) payload.address_state = addressStateProv.trim();
      if (addressPostalCode.trim()) payload.address_postal_code = addressPostalCode.trim();
      if (addressCountry.trim()) payload.address_country = addressCountry.trim();
      if (addressLatitude != null && addressLongitude != null) {
        payload.address_latitude = addressLatitude;
        payload.address_longitude = addressLongitude;
      }
    }

    const { error } = await createBooking(payload);
    if (error) {
      // Detect subscription limit errors and offer an upgrade path
      const isLimitError =
        typeof error === "string" &&
        (error.toLowerCase().includes("booking limit") ||
          error.toLowerCase().includes("upgrade your plan") ||
          error.toLowerCase().includes("limit_reached"));
      if (isLimitError) {
        Alert.alert(
          "Booking limit reached",
          error,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "View subscription",
              onPress: () =>
                router.push("/(app)/(tabs)/more/subscription" as any),
            },
          ]
        );
      } else {
        Alert.alert("Error", error);
      }
      return;
    }
    Alert.alert("Success", "Booking created successfully");
    router.back();
  }

  /* ---------------------------------------------------------------- */
  /*  JSX                                                             */
  /* ---------------------------------------------------------------- */

  return (
    <KeyboardAvoidingView
      style={twStyle("flex-1 bg-white")}
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
    >
      <ScreenContainer>
        <ScreenHeader title="New Booking" showBack />

        {showConfirmation ? (
          <ConfirmationView
            summary={summary}
            currency={tenantCurrency}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            clientName={
              selectedClient?.full_name ??
              `${newClientFirst} ${newClientLast}`.trim()
            }
            locationType={locationType}
            serviceAddressSummary={
              locationType === "at_home" && addressLine1.trim()
                ? [addressLine1, addressLine2, addressCity, addressStateProv, addressPostalCode, addressCountry]
                    .filter((s) => typeof s === "string" && s.trim())
                    .join(", ")
                : undefined
            }
            paymentMethod={paymentMethod}
            creating={creating}
            onConfirm={handleCreate}
            onBack={() => setShowConfirmation(false)}
          />
        ) : (
          <View style={twStyle(isTablet ? "flex-row" : "")}>
            <View style={[twStyle(isTablet ? "flex-1" : ""), isTablet ? { marginRight: 24 } : undefined]}>
              {/* -------- CLIENT -------- */}
              <SectionLabel label="Client" required />
              <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
                <View style={twStyle("mb-3 flex-row")}>
                  <TouchableOpacity
                    style={[twStyle(`flex-1 items-center rounded-lg py-2 ${
                      clientMode === "search" ? "bg-gray-900" : "bg-gray-100"
                    }`), { marginRight: 8 }]}
                    onPress={() => setClientMode("search")}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: clientMode === "search" }}
                  >
                    <Text
                      style={twStyle(`text-sm font-medium ${
                        clientMode === "search" ? "text-white" : "text-gray-600"
                      }`)}
                    >
                      Existing Client
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={twStyle(`flex-1 items-center rounded-lg py-2 ${
                      clientMode === "new" ? "bg-gray-900" : "bg-gray-100"
                    }`)}
                    onPress={() => setClientMode("new")}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: clientMode === "new" }}
                  >
                    <Text
                      style={twStyle(`text-sm font-medium ${
                        clientMode === "new" ? "text-white" : "text-gray-600"
                      }`)}
                    >
                      New Client
                    </Text>
                  </TouchableOpacity>
                </View>

                {clientMode === "search" ? (
                  <View>
                    {selectedClient ? (
                      <View style={twStyle("flex-row items-center rounded-xl border border-indigo-200 bg-indigo-50 p-3")}>
                        <Avatar name={selectedClient.full_name} imageUrl={selectedClient.avatar_url} size="sm" />
                        <View style={twStyle("ml-2 flex-1")}>
                          <Text style={twStyle("text-sm font-medium text-gray-900")}>
                            {selectedClient.full_name}
                          </Text>
                          <Text style={twStyle("text-xs text-gray-500")}>{selectedClient.phone || selectedClient.email}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setSelectedClient(null)}
                          accessibilityLabel="Remove selected client"
                        >
                          <Ionicons name="close-circle" size={20} color="#6366f1" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <>
                        <View style={twStyle("flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5")}>
                          <Ionicons name="search-outline" size={16} color="#9ca3af" />
                          <TextInput
                            style={twStyle("ml-2 flex-1 text-base text-gray-900")}
                            placeholder="Search by name or phone..."
                            placeholderTextColor="#9ca3af"
                            value={clientSearch}
                            onChangeText={setClientSearch}
                            autoCapitalize="words"
                            accessibilityLabel="Search clients"
                          />
                        </View>
                        {clientsLoading && (
                          <ActivityIndicator size="small" color="#111" style={twStyle("mt-2")} />
                        )}
                        {searchedClients && searchedClients.length > 0 && (
                          <View style={twStyle("mt-2 max-h-40 rounded-xl border border-gray-100 bg-white")}>
                            <ScrollView nestedScrollEnabled>
                              {searchedClients.map((c) => (
                                <TouchableOpacity
                                  key={c.id}
                                  style={twStyle("flex-row items-center border-b border-gray-50 px-3 py-2.5")}
                                  onPress={() => {
                                    setSelectedClient(c);
                                    setClientSearch("");
                                  }}
                                  accessibilityLabel={`Select ${c.full_name}`}
                                >
                                  <Avatar name={c.full_name} size="sm" />
                                  <View style={twStyle("ml-2 flex-1")}>
                                    <Text style={twStyle("text-sm font-medium text-gray-900")}>{c.full_name}</Text>
                                    <Text style={twStyle("text-xs text-gray-500")}>
                                      {c.phone || c.email}
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                        {clientSearch.length >= 2 &&
                          !clientsLoading &&
                          searchedClients?.length === 0 && (
                            <Text style={twStyle("mt-2 text-center text-xs text-gray-400")}>
                              No clients found. Switch to &quot;New Client&quot; to create one.
                            </Text>
                          )}
                      </>
                    )}
                  </View>
                ) : (
                  <View>
                    <View style={twStyle("flex-row")}>
                      <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                        <Text style={twStyle("mb-1 text-xs text-gray-500")}>First Name *</Text>
                        <TextInput
                          style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                          placeholder="First name"
                          placeholderTextColor="#9ca3af"
                          value={newClientFirst}
                          onChangeText={setNewClientFirst}
                          accessibilityLabel="Client first name"
                        />
                      </View>
                      <View style={twStyle("flex-1")}>
                        <Text style={twStyle("mb-1 text-xs text-gray-500")}>Last Name</Text>
                        <TextInput
                          style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                          placeholder="Last name"
                          placeholderTextColor="#9ca3af"
                          value={newClientLast}
                          onChangeText={setNewClientLast}
                          accessibilityLabel="Client last name"
                        />
                      </View>
                    </View>
                    <View style={{ marginTop: 12 }}>
                      <E164PhoneField
                        label="Phone"
                        valueE164={newClientPhoneE164}
                        onChangeE164={setNewClientPhoneE164}
                        defaultCountryDial={defaultPhoneDial}
                        muted
                        accessibilityLabel="New client phone"
                      />
                    </View>
                    <View style={{ marginTop: 12 }}>
                      <Text style={twStyle("mb-1 text-xs text-gray-500")}>Email</Text>
                      <TextInput
                        style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                        placeholder="email@example.com"
                        placeholderTextColor="#9ca3af"
                        value={newClientEmail}
                        onChangeText={setNewClientEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        accessibilityLabel="Client email"
                      />
                    </View>
                  </View>
                )}
              </View>

              {/* -------- DATE -------- */}
              <SectionLabel label="Date" required />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={twStyle("mb-4")}
                contentContainerStyle={{ paddingVertical: 4 }}
              >
                {dateOptions.map((d) => {
                  const isActive = isSameDay(d, selectedDate);
                  const isToday = isSameDay(d, today);
                  return (
                    <TouchableOpacity
                      key={d.toISOString()}
                      style={[twStyle(`items-center rounded-xl px-3 py-2.5 ${
                        isActive ? "bg-gray-900" : "border border-gray-200 bg-white"
                      }`), { minWidth: 54, marginRight: 8 }]}
                      onPress={() => setSelectedDate(d)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isActive }}
                      accessibilityLabel={format(d, "EEEE, MMMM d")}
                    >
                      <Text
                        style={twStyle(`text-[10px] ${isActive ? "text-gray-300" : "text-gray-500"}`)}
                      >
                        {isToday ? "Today" : format(d, "EEE")}
                      </Text>
                      <Text
                        style={twStyle(`text-base font-bold ${
                          isActive ? "text-white" : "text-gray-900"
                        }`)}
                      >
                        {format(d, "d")}
                      </Text>
                      <Text
                        style={twStyle(`text-[10px] ${isActive ? "text-gray-300" : "text-gray-500"}`)}
                      >
                        {format(d, "MMM")}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* -------- TIME -------- */}
              <SectionLabel label="Time" required />
              <TouchableOpacity
                style={twStyle("mb-4 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setShowTimePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={selectedTime ? `Selected time ${selectedTime}` : "Select time"}
              >
                <View style={twStyle("flex-row items-center")}>
                  <Ionicons name="time-outline" size={18} color="#6b7280" />
                  <Text style={twStyle(`ml-2 text-base ${selectedTime ? "font-medium text-gray-900" : "text-gray-400"}`)}>
                    {selectedTime || "Select time slot"}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={18} color="#9ca3af" />
              </TouchableOpacity>

              {/* -------- LOCATION -------- */}
              <SectionLabel label="Location" />
              <View style={twStyle("mb-4 flex-row")}>
                {(
                  [
                    { val: "at_salon", label: "At Salon", icon: "business-outline" },
                    { val: "at_home", label: "At Home", icon: "home-outline" },
                  ] as const
                ).map((loc) => (
                  <TouchableOpacity
                    key={loc.val}
                    style={[twStyle(`flex-1 flex-row items-center justify-center rounded-xl border py-3 ${
                      locationType === loc.val
                        ? "border-gray-900 bg-gray-900"
                        : "border-gray-200 bg-white"
                    }`), loc.val === "at_salon" ? { marginRight: 12 } : undefined]}
                    onPress={() => setLocationType(loc.val)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: locationType === loc.val }}
                  >
                    <Ionicons
                      name={loc.icon as any}
                      size={16}
                      color={locationType === loc.val ? "#fff" : "#6b7280"}
                    />
                    <Text
                      style={twStyle(`ml-2 font-medium ${
                        locationType === loc.val ? "text-white" : "text-gray-700"
                      }`)}
                    >
                      {loc.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {locationType === "at_home" && (
                <View style={twStyle("mb-4")}>
                  <SectionLabel label="Client address" required />
                  <Text style={twStyle("mb-2 text-xs text-gray-500")}>
                    Search with Mapbox, then pick a result so the pin and travel distance are correct.
                  </Text>
                  <AddressAutocomplete
                    label="Search address"
                    value={addressSearchValue}
                    countryCode={mapboxCountryIso}
                    placeholder="Start typing street or place…"
                    onSelect={(parsed) => {
                      setAddressSearchValue(parsed.full_address);
                      setAddressLine1(parsed.address_line1);
                      setAddressCity(parsed.city);
                      setAddressStateProv(parsed.state);
                      setAddressPostalCode(parsed.postal_code);
                      setAddressCountry(parsed.country);
                      setAddressLatitude(parsed.latitude);
                      setAddressLongitude(parsed.longitude);
                    }}
                    onBlur={(q) => {
                      if (!addressLine1.trim() && q) setAddressLine1(q);
                    }}
                  />
                  {addressLatitude != null && addressLongitude != null && (
                    <View style={{ marginTop: 12, alignItems: "center" }}>
                      <StaticMapImage
                        latitude={addressLatitude}
                        longitude={addressLongitude}
                        width={Math.min(windowWidth - 48, 400)}
                        height={160}
                        zoom={15}
                      />
                      <Text style={twStyle("mt-1.5 text-center text-xs text-gray-500")}>Selected map location</Text>
                    </View>
                  )}
                  <Text style={twStyle("mb-1 mt-3 text-xs font-medium text-gray-600")}>Street line (from search — editable)</Text>
                  <TextInput
                    style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                    placeholder="Street and number"
                    placeholderTextColor="#9ca3af"
                    value={addressLine1}
                    onChangeText={setAddressLine1}
                  />
                  <Text style={twStyle("mb-1 mt-3 text-xs font-medium text-gray-600")}>Unit / apartment (optional)</Text>
                  <TextInput
                    style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                    placeholder="e.g. Unit 4B"
                    placeholderTextColor="#9ca3af"
                    value={addressLine2}
                    onChangeText={setAddressLine2}
                  />
                  <View style={[twStyle("flex-row"), { marginTop: 12 }]}>
                    <TextInput
                      style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"), { marginRight: 8 }]}
                      placeholder="City"
                      placeholderTextColor="#9ca3af"
                      value={addressCity}
                      onChangeText={setAddressCity}
                    />
                    <TextInput
                      style={twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                      placeholder="Province / state"
                      placeholderTextColor="#9ca3af"
                      value={addressStateProv}
                      onChangeText={setAddressStateProv}
                    />
                  </View>
                  <View style={[twStyle("flex-row"), { marginTop: 12 }]}>
                    <TextInput
                      style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"), { marginRight: 8 }]}
                      placeholder="Postal code"
                      placeholderTextColor="#9ca3af"
                      value={addressPostalCode}
                      onChangeText={setAddressPostalCode}
                    />
                    <TextInput
                      style={twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                      placeholder="Country"
                      placeholderTextColor="#9ca3af"
                      value={addressCountry}
                      onChangeText={setAddressCountry}
                    />
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <Text style={twStyle("mb-1 text-xs text-gray-500")}>Travel fee ({tenantCurrency}, optional)</Text>
                    <TextInput
                      style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                      placeholder="0"
                      placeholderTextColor="#9ca3af"
                      value={travelFee}
                      onChangeText={setTravelFee}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              {/* -------- TIP -------- */}
              <SectionLabel label={`Tip (optional, ${tenantCurrency})`} />
              <TextInput
                style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                placeholder="0"
                placeholderTextColor="#9ca3af"
                value={tipAmount}
                onChangeText={setTipAmount}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={twStyle(isTablet ? "flex-1" : "")}>
              {/* -------- SERVICES -------- */}
              <SectionLabel label="Services" required />
              {servicesLoading ? (
                <LoadingState fullScreen={false} message="Loading services..." />
              ) : (
                <View style={twStyle("mb-4")}>
                  {services?.map((service, svcIdx) => {
                    const sel = selectedServices.find((s) => s.serviceId === service.id);
                    const isSelected = !!sel;
                    const staffName = staffList?.find((s) => s.id === sel?.staffId)?.name;

                    return (
                      <View key={service.id} style={svcIdx > 0 ? { marginTop: 8 } : undefined}>
                        <TouchableOpacity
                          style={twStyle(`flex-row items-center justify-between rounded-xl border p-4 ${
                            isSelected
                              ? "border-indigo-500 bg-indigo-50"
                              : "border-gray-100 bg-white"
                          }`)}
                          onPress={() => toggleService(service.id)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSelected }}
                          accessibilityLabel={`${service.title}, ${service.duration_minutes} minutes, ${formatCurrency(service.price, service.currency)}`}
                        >
                          <View style={twStyle("flex-1")}>
                            <Text
                              style={twStyle(`text-sm font-medium ${
                                isSelected ? "text-indigo-900" : "text-gray-900"
                              }`)}
                            >
                              {service.title}
                            </Text>
                            <Text style={twStyle("text-xs text-gray-500")}>
                              {formatDuration(service.duration_minutes)}
                            </Text>
                          </View>
                          <View style={twStyle("flex-row items-center")}>
                            <Text
                              style={twStyle(`mr-3 text-sm font-semibold ${
                                isSelected ? "text-indigo-700" : "text-gray-900"
                              }`)}
                            >
                              {formatCurrency(service.price, service.currency)}
                            </Text>
                            <View
                              style={twStyle(`h-5 w-5 items-center justify-center rounded-md ${
                                isSelected ? "bg-indigo-600" : "border border-gray-300"
                              }`)}
                            >
                              {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                            </View>
                          </View>
                        </TouchableOpacity>

                        {/* Staff + Add-ons for selected service */}
                        {isSelected && (
                          <View style={twStyle("ml-4 mt-1 mb-1 flex-row")}>
                            {/* Staff picker button */}
                            <TouchableOpacity
                              style={[twStyle("flex-row items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5"), { marginRight: 8 }]}
                              onPress={() => setStaffPickerService(service.id)}
                              accessibilityLabel={`Assign staff for ${service.title}`}
                            >
                              <Ionicons name="person-outline" size={14} color="#6b7280" />
                              <Text style={twStyle("ml-1 text-xs text-gray-600")}>
                                {staffName ?? "Assign Staff"}
                              </Text>
                            </TouchableOpacity>

                            {/* Add-on picker button */}
                            {service.add_ons && service.add_ons.length > 0 && (
                              <TouchableOpacity
                                style={twStyle("flex-row items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5")}
                                onPress={() => setAddOnPickerService(service.id)}
                                accessibilityLabel={`Add-ons for ${service.title}`}
                              >
                                <Ionicons name="add-circle-outline" size={14} color="#6b7280" />
                                <Text style={twStyle("ml-1 text-xs text-gray-600")}>
                                  Add-ons ({sel?.addOnIds.length ?? 0})
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* -------- DISCOUNT -------- */}
              <SectionLabel label="Discount" />
              <View style={twStyle("mb-4 flex-row items-center")}>
                <View style={[twStyle("flex-1 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-3"), { marginRight: 8 }]}>
                  <TextInput
                    style={twStyle("flex-1 py-3 text-base text-gray-900")}
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                    value={discountValue}
                    onChangeText={setDiscountValue}
                    keyboardType="numeric"
                    accessibilityLabel="Discount value"
                  />
                </View>
                <TouchableOpacity
                  style={[twStyle(`rounded-lg px-3 py-3 ${
                    discountType === "percentage" ? "bg-gray-900" : "border border-gray-200 bg-white"
                  }`), { marginRight: 8 }]}
                  onPress={() => setDiscountType("percentage")}
                  accessibilityLabel="Percentage discount"
                >
                  <Text
                    style={twStyle(`text-sm font-semibold ${
                      discountType === "percentage" ? "text-white" : "text-gray-600"
                    }`)}
                  >
                    %
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={twStyle(`rounded-lg px-3 py-3 ${
                    discountType === "fixed" ? "bg-gray-900" : "border border-gray-200 bg-white"
                  }`)}
                  onPress={() => setDiscountType("fixed")}
                  accessibilityLabel="Fixed amount discount"
                >
                  <Text
                    style={twStyle(`text-sm font-semibold ${
                      discountType === "fixed" ? "text-white" : "text-gray-600"
                    }`)}
                  >
                    R
                  </Text>
                </TouchableOpacity>
              </View>

              {/* -------- PAYMENT METHOD -------- */}
              <SectionLabel label="Payment Method" />
              <View style={twStyle("mb-4 flex-row")}>
                {PAYMENT_METHODS.map((pm, idx) => (
                  <TouchableOpacity
                    key={pm.value}
                    style={[twStyle(`flex-1 flex-row items-center justify-center rounded-xl border py-3 ${
                      paymentMethod === pm.value
                        ? "border-gray-900 bg-gray-900"
                        : "border-gray-200 bg-white"
                    }`), idx < PAYMENT_METHODS.length - 1 ? { marginRight: 8 } : undefined]}
                    onPress={() => setPaymentMethod(pm.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: paymentMethod === pm.value }}
                  >
                    <Ionicons
                      name={pm.icon}
                      size={16}
                      color={paymentMethod === pm.value ? "#fff" : "#6b7280"}
                    />
                    <Text
                      style={twStyle(`ml-1.5 text-sm font-medium ${
                        paymentMethod === pm.value ? "text-white" : "text-gray-700"
                      }`)}
                    >
                      {pm.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* -------- REFERRAL SOURCE -------- */}
              {referralSources.length > 0 && (
                <>
                  <SectionLabel label="Where did this client come from?" />
                  <View style={twStyle("mb-4")}>
                    <ChipCombobox
                      singleSelect
                      value={referralSourceId || null}
                      onChange={(v) => setReferralSourceId(v ?? "")}
                      staticSuggestions={[
                        { value: "", label: "— None / Not specified —" },
                        ...referralSources.map((s) => ({ value: s.id, label: s.name })),
                      ]}
                      allowFreeForm={false}
                      placeholder="Select referral source"
                      accessibilityLabel="Referral source"
                    />
                  </View>
                </>
              )}

              {/* -------- NOTES -------- */}
              <SectionLabel label="Special Requests" />
              <TextInput
                style={twStyle("mb-4 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                placeholder="Any special requests or notes..."
                placeholderTextColor="#9ca3af"
                value={notes}
                onChangeText={setNotes}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Special requests"
              />
            </View>
          </View>
        )}

        {/* -------- SUMMARY -------- */}
        {!showConfirmation && selectedServices.length > 0 && (
          <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-700")}>Summary</Text>
            {summary.items.map((item, i) => (
              <View key={i} style={twStyle("flex-row justify-between py-0.5")}>
                <Text style={twStyle("flex-1 text-sm text-gray-600")} numberOfLines={1}>
                  {item.name}
                  {item.staffName ? ` (${item.staffName})` : ""}
                </Text>
                <Text style={twStyle("text-sm text-gray-600")}>{formatCurrency(item.price, tenantCurrency)}</Text>
              </View>
            ))}
            <View style={twStyle("my-2 h-px bg-gray-200")} />
            <View style={twStyle("flex-row justify-between")}>
              <Text style={twStyle("text-sm text-gray-500")}>Subtotal</Text>
              <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(summary.subtotal, tenantCurrency)}</Text>
            </View>
            {summary.discountAmt > 0 && (
              <View style={twStyle("flex-row justify-between")}>
                <Text style={twStyle("text-sm text-green-600")}>Discount</Text>
                <Text style={twStyle("text-sm text-green-600")}>{formatCurrency(-summary.discountAmt, tenantCurrency)}</Text>
              </View>
            )}
            <View style={twStyle("flex-row justify-between")}>
              <Text style={twStyle("text-sm text-gray-500")}>VAT (15%)</Text>
              <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(summary.tax, tenantCurrency)}</Text>
            </View>
            {summary.travelFeeNum > 0 && (
              <View style={twStyle("flex-row justify-between")}>
                <Text style={twStyle("text-sm text-gray-500")}>Travel fee</Text>
                <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(summary.travelFeeNum, tenantCurrency)}</Text>
              </View>
            )}
            {summary.tipNum > 0 && (
              <View style={twStyle("flex-row justify-between")}>
                <Text style={twStyle("text-sm text-gray-500")}>Tip</Text>
                <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(summary.tipNum, tenantCurrency)}</Text>
              </View>
            )}
            <View style={twStyle("mt-1 flex-row justify-between")}>
              <Text style={twStyle("text-base font-bold text-gray-900")}>Total</Text>
              <Text style={twStyle("text-base font-bold text-gray-900")}>{formatCurrency(summary.total, tenantCurrency)}</Text>
            </View>
            <Text style={twStyle("mt-1 text-xs text-gray-400")}>
              {formatDuration(summary.totalMinutes)} total duration
            </Text>
          </View>
        )}

        {!showConfirmation && (
          <ActionButton
            label="Review Booking"
            onPress={handleReview}
            disabled={selectedServices.length === 0}
            fullWidth
          />
        )}

        <View style={twStyle("h-8")} />

        {/* -------- TIME PICKER SHEET -------- */}
        <BottomSheet
          visible={showTimePicker}
          onClose={() => setShowTimePicker(false)}
          title="Select Time"
          snapHeight="half"
        >
          <View style={twStyle("flex-row flex-wrap")}>
            {timeSlotsToShow.map((slot) => {
              const isActive = selectedTime === slot;
              return (
                <TouchableOpacity
                  key={slot}
                  style={[twStyle(`rounded-lg px-3 py-2 ${
                    isActive ? "bg-gray-900" : "border border-gray-200 bg-white"
                  }`), { marginRight: 8, marginBottom: 8 }]}
                  onPress={() => {
                    setSelectedTime(slot);
                    setShowTimePicker(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
                >
                  <Text
                    style={twStyle(`text-sm font-medium ${
                      isActive ? "text-white" : "text-gray-700"
                    }`)}
                  >
                    {slot}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </BottomSheet>

        {/* -------- STAFF PICKER SHEET -------- */}
        <BottomSheet
          visible={!!staffPickerService}
          onClose={() => setStaffPickerService(null)}
          title="Assign Staff"
        >
          <View>
            {staffList?.map((s, idx) => (
              <TouchableOpacity
                key={s.id}
                style={[twStyle("flex-row items-center rounded-xl border border-gray-100 bg-white p-3"), idx > 0 ? { marginTop: 8 } : undefined]}
                onPress={() => setStaffForService(staffPickerService!, s.id)}
                accessibilityLabel={`Assign ${s.name}`}
              >
                <Avatar name={s.name} imageUrl={s.avatar_url} size="sm" />
                <View style={twStyle("ml-3 flex-1")}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>{s.name}</Text>
                  {s.role && <Text style={twStyle("text-xs text-gray-500")}>{s.role}</Text>}
                </View>
              </TouchableOpacity>
            ))}
            {(!staffList || staffList.length === 0) && (
              <Text style={twStyle("py-4 text-center text-sm text-gray-400")}>No staff members found</Text>
            )}
          </View>
        </BottomSheet>

        {/* -------- ADD-ON PICKER SHEET -------- */}
        <BottomSheet
          visible={!!addOnPickerService}
          onClose={() => setAddOnPickerService(null)}
          title="Select Add-ons"
        >
          <View>
            {(() => {
              const svc = services?.find((s) => s.id === addOnPickerService);
              const sel = selectedServices.find((s) => s.serviceId === addOnPickerService);
              if (!svc?.add_ons) return <Text style={twStyle("text-sm text-gray-400")}>No add-ons available</Text>;
              return svc.add_ons.map((ao, idx) => {
                const isChecked = sel?.addOnIds.includes(ao.id) ?? false;
                return (
                  <TouchableOpacity
                    key={ao.id}
                    style={[twStyle(`flex-row items-center justify-between rounded-xl border p-3 ${
                      isChecked ? "border-indigo-400 bg-indigo-50" : "border-gray-100 bg-white"
                    }`), idx > 0 ? { marginTop: 8 } : undefined]}
                    onPress={() => toggleAddOn(addOnPickerService!, ao.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                  >
                    <View style={twStyle("flex-1")}>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>{ao.name}</Text>
                      <Text style={twStyle("text-xs text-gray-500")}>
                        {formatDuration(ao.duration_minutes)}
                      </Text>
                    </View>
                    <View style={twStyle("flex-row items-center")}>
                      <Text style={twStyle("mr-2 text-sm font-semibold text-gray-800")}>
                        {formatCurrency(ao.price, tenantCurrency)}
                      </Text>
                      <View
                        style={twStyle(`h-5 w-5 items-center justify-center rounded-md ${
                          isChecked ? "bg-indigo-600" : "border border-gray-300"
                        }`)}
                      >
                        {isChecked && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              });
            })()}
          </View>
        </BottomSheet>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirmation step                                                  */
/* ------------------------------------------------------------------ */

function ConfirmationView({
  summary,
  currency,
  selectedDate,
  selectedTime,
  clientName,
  locationType,
  serviceAddressSummary,
  paymentMethod,
  creating,
  onConfirm,
  onBack,
}: {
  summary: {
    items: { name: string; price: number; duration: number; staffName?: string }[];
    subtotal: number;
    discountAmt: number;
    tax: number;
    total: number;
    totalMinutes: number;
    travelFeeNum?: number;
    tipNum?: number;
  };
  currency: string;
  selectedDate: Date;
  selectedTime: string;
  clientName: string;
  locationType: string;
  serviceAddressSummary?: string;
  paymentMethod: string;
  creating: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <View accessibilityLabel="Booking confirmation">
      <View style={twStyle("mb-4 items-center")}>
        <View style={twStyle("mb-2 h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100")}>
          <Ionicons name="checkmark-circle-outline" size={30} color="#6366f1" />
        </View>
        <Text style={twStyle("text-lg font-bold text-gray-900")}>Confirm Booking</Text>
        <Text style={twStyle("text-sm text-gray-500")}>Review the details below</Text>
      </View>

      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <ConfirmRow label="Client" value={clientName} />
        <ConfirmRow label="Date" value={format(selectedDate, "EEE, MMM d, yyyy")} />
        <ConfirmRow label="Time" value={selectedTime} />
        <ConfirmRow label="Location" value={locationType === "at_home" ? "At Home" : "At Salon"} />
        {serviceAddressSummary ? (
          <View style={twStyle("border-b border-gray-50 py-2")}>
            <Text style={twStyle("text-sm text-gray-500")}>Service address</Text>
            <Text style={twStyle("mt-1 text-sm font-medium text-gray-900")}>{serviceAddressSummary}</Text>
          </View>
        ) : null}
        <ConfirmRow label="Payment" value={paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)} />
        <ConfirmRow label="Duration" value={formatDuration(summary.totalMinutes)} />
      </View>

      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4")}>
        {summary.items.map((item, i) => (
          <View key={i} style={twStyle("flex-row justify-between py-0.5")}>
            <Text style={twStyle("flex-1 text-sm text-gray-600")} numberOfLines={1}>
              {item.name}{item.staffName ? ` (${item.staffName})` : ""}
            </Text>
            <Text style={twStyle("text-sm text-gray-600")}>{formatCurrency(item.price, currency)}</Text>
          </View>
        ))}
        <View style={twStyle("my-2 h-px bg-gray-200")} />
        <View style={twStyle("flex-row justify-between")}>
          <Text style={twStyle("text-sm text-gray-500")}>Subtotal</Text>
          <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(summary.subtotal, currency)}</Text>
        </View>
        {summary.discountAmt > 0 && (
          <View style={twStyle("flex-row justify-between")}>
            <Text style={twStyle("text-sm text-green-600")}>Discount</Text>
            <Text style={twStyle("text-sm text-green-600")}>{formatCurrency(-summary.discountAmt, currency)}</Text>
          </View>
        )}
        <View style={twStyle("flex-row justify-between")}>
          <Text style={twStyle("text-sm text-gray-500")}>VAT (15%)</Text>
          <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(summary.tax, currency)}</Text>
        </View>
        {(summary.travelFeeNum ?? 0) > 0 && (
          <View style={twStyle("flex-row justify-between")}>
            <Text style={twStyle("text-sm text-gray-500")}>Travel fee</Text>
            <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(summary.travelFeeNum ?? 0, currency)}</Text>
          </View>
        )}
        {(summary.tipNum ?? 0) > 0 && (
          <View style={twStyle("flex-row justify-between")}>
            <Text style={twStyle("text-sm text-gray-500")}>Tip</Text>
            <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(summary.tipNum ?? 0, currency)}</Text>
          </View>
        )}
        <View style={twStyle("mt-2 flex-row justify-between")}>
          <Text style={twStyle("text-lg font-bold text-gray-900")}>Total</Text>
          <Text style={twStyle("text-lg font-bold text-gray-900")}>{formatCurrency(summary.total, currency)}</Text>
        </View>
      </View>

      <ActionButton label="Confirm & Create Booking" onPress={onConfirm} loading={creating} fullWidth />
      <TouchableOpacity style={twStyle("mt-3 items-center py-2")} onPress={onBack}>
        <Text style={twStyle("text-sm font-medium text-gray-600")}>Back to Edit</Text>
      </TouchableOpacity>
    </View>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={twStyle("flex-row justify-between border-b border-gray-50 py-2")}>
      <Text style={twStyle("text-sm text-gray-500")}>{label}</Text>
      <Text style={twStyle("text-sm font-medium text-gray-900")}>{value}</Text>
    </View>
  );
}
