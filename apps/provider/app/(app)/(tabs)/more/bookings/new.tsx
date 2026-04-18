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
import { buildZonedIsoForWallClock } from "@/lib/tz";
import { api } from "@/lib/api-client";
import { twStyle } from "@/lib/twStyle";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { StaticMapImage } from "@/components/ui/StaticMapImage";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { useDefaultPhoneDial } from "@/hooks/useDefaultPhoneDial";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { calculateBookingTotals } from "@beautonomi/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Service {
  id: string;
  title: string;
  duration_minutes: number;
  price: number;
  currency: string;
  service_type?: string;
  variant_name?: string | null;
  parent_service_id?: string | null;
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
  customization?: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  currency: string;
  variants?: { id: string; name: string; price: number }[];
}

interface SelectedProduct {
  productId: string;
  productName: string;
  productVariantId?: string;
  productVariantName?: string;
  quantity: number;
  unitPrice: number;
}

interface PackageItem {
  id: string;
  offering_id?: string;
  product_id?: string;
  quantity: number;
  offering?: { id: string; title?: string; name?: string; duration_minutes?: number; price?: number };
  product?: { id: string; name?: string; retail_price?: number };
}

interface Package {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  is_active: boolean;
  items: PackageItem[];
}

type DiscountType = "percentage" | "fixed";
type PaymentMethod = "cash" | "card" | "online";

/**
 * §Release-audit 2026-04: accept the provider's IANA timezone and delegate to
 * the shared helper so the new-booking flow matches the calendar drag path.
 * The optional `zone` preserves the pre-fix behaviour when the provider
 * record hasn't been backfilled with a timezone yet.
 */
function buildScheduledAtWithTz(
  date: Date,
  timeStr: string,
  zone?: string | null,
): string {
  return buildZonedIsoForWallClock(format(date, "yyyy-MM-dd"), timeStr, zone ?? null);
}

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

const DATE_RANGE_DAYS = 90;
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
  const params = useLocalSearchParams<{ date?: string; time?: string; status?: string; defaultStatus?: string; clientId?: string; client_id?: string; walk_in?: string; staff_id?: string; location_id?: string }>();
  const { isTablet } = useResponsive();
  const { selectedLocationId: providerLocationId, provider: providerProfile } = useProvider();
  const providerTimezone = providerProfile?.timezone ?? null;
  // §Provider-launch (audit 2026-04): honour an explicit `location_id` query
  // param (carried from the calendar's location filter) over the provider
  // context's remembered location so the new-booking fetches scope to the
  // location the user was looking at.
  const paramLocationId =
    typeof params.location_id === "string" && params.location_id.length > 0
      ? params.location_id
      : undefined;
  const selectedLocationId = paramLocationId ?? providerLocationId;
  const tenantCurrency = getTenantDefaultCurrency();
  const { width: windowWidth } = useWindowDimensions();
  const { bundle } = useConfigBundle();
  const defaultPhoneDial = useDefaultPhoneDial();
  const mapboxCountryIso =
    bundle?.meta?.active_market_country?.trim().length === 2
      ? bundle.meta.active_market_country.trim().toUpperCase()
      : "ZA";

  // --- API data ---
  const { data: services, loading: servicesLoading, error: servicesError } = useApi<Service[]>("/api/provider/services?include_variants=true");
  const teamUrl = selectedLocationId
    ? `/api/provider/team?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/team";
  const { data: staffList, error: staffError } = useApi<StaffMember[]>(teamUrl);
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

  // --- Products ---
  const { data: productsRaw } = useApi<Product[]>("/api/provider/products?limit=100");
  const productsList = useMemo(() => (Array.isArray(productsRaw) ? productsRaw : []), [productsRaw]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);

  // --- Packages ---
  const packagesUrl = selectedLocationId
    ? `/api/provider/packages?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/packages";
  const { data: packagesRaw } = useApi<{ packages: Package[] }>(packagesUrl);
  const packagesList = useMemo(
    () => (packagesRaw?.packages ?? []).filter((p) => p.is_active && p.items?.length > 0),
    [packagesRaw],
  );
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [showPackagePicker, setShowPackagePicker] = useState(false);

  // Pre-select client from navigation params — fetch by ID for reliability
  const preselectedClientId = params.clientId || params.client_id;
  const { data: rawPreselectedClients } = useApi<ApiClient[]>(
    `/api/provider/clients?customer_id=${encodeURIComponent(preselectedClientId ?? "")}`,
    { enabled: !!preselectedClientId && !selectedClient }
  );
  useEffect(() => {
    if (preselectedClientId && rawPreselectedClients && !selectedClient) {
      // API may return array filtered by customer_id; take first match
      const raw = rawPreselectedClients.find(
        (c) => c.customer_id === preselectedClientId || c.id === preselectedClientId
      ) ?? rawPreselectedClients[0];
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

  // --- Appointment type ---
  const [isWalkIn, setIsWalkIn] = useState(params.walk_in === "true");
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
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<{ code: string; discount: number; discountType: string; discountValue: number } | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [paymentOption, setPaymentOption] = useState<"full" | "deposit">("full");
  const [depositPercentage, setDepositPercentage] = useState<number>(30);
  const [referralSourceId, setReferralSourceId] = useState<string>("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [, setCheckingAvailability] = useState(false);

  // Auto-save draft to AsyncStorage
  const DRAFT_KEY = "beautonomi_mobile_booking_draft";
  useEffect(() => {
    const timer = setTimeout(() => {
      const draft = { notes, selectedServices, selectedProducts, discountValue, discountType, tipAmount, selectedPackageId, promoCode };
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [notes, selectedServices, selectedProducts, discountValue, discountType, tipAmount, selectedPackageId, promoCode]);

  // Restore draft on mount if no prefilled params
  useEffect(() => {
    if (preselectedClientId) return;
    AsyncStorage.getItem(DRAFT_KEY).then((saved) => {
      if (!saved) return;
      try {
        const draft = JSON.parse(saved);
        if (draft.notes) setNotes(draft.notes);
        if (Array.isArray(draft.selectedServices) && draft.selectedServices.length > 0) {
          // Only restore services whose IDs still exist in the catalogue
          const validServices = services
            ? draft.selectedServices.filter((s: SelectedService) =>
                services.some((cat) => cat.id === s.serviceId)
              )
            : draft.selectedServices;
          if (validServices.length > 0) setSelectedServices(validServices);
        }
        if (Array.isArray(draft.selectedProducts) && draft.selectedProducts.length > 0) {
          setSelectedProducts(draft.selectedProducts);
        }
        if (draft.discountValue) setDiscountValue(draft.discountValue);
        if (draft.discountType) setDiscountType(draft.discountType);
        if (draft.promoCode) setPromoCode(draft.promoCode);
        if (draft.tipAmount) setTipAmount(draft.tipAmount);
        if (draft.selectedPackageId) setSelectedPackageId(draft.selectedPackageId);
      } catch { /* ignore */ }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; services may load after
  }, []);

  // Summary (must be before slotParams which uses summary.totalMinutes)
  const summary = useMemo(() => {
    let subtotal = 0;
    let totalMinutes = 0;
    const items: { name: string; price: number; duration: number; staffName?: string; quantity?: number }[] = [];
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
    selectedProducts.forEach((p) => {
      const lineTotal = p.unitPrice * p.quantity;
      subtotal += lineTotal;
      items.push({ name: p.productVariantName ? `${p.productName} · ${p.productVariantName}` : p.productName, price: lineTotal, duration: 0, quantity: p.quantity });
    });
    const manualDiscount = discountValue
      ? discountType === "percentage"
        ? (subtotal * (parseFloat(discountValue) || 0)) / 100
        : (parseFloat(discountValue) || 0)
      : 0;
    const discountAmt = promoApplied ? promoApplied.discount : manualDiscount;
    const taxRatePercent = paymentSettings?.taxRatePercent ?? 0;
    const taxRate = taxRatePercent / 100;
    const taxInclusive = paymentSettings?.taxInclusive ?? true;
    const travelFeeNum = Number(travelFee) || 0;
    const tipNum = Number(tipAmount) || 0;
    const pricing = calculateBookingTotals({
      subtotal,
      discountAmount: discountAmt,
      taxRate,
      taxInclusive,
      travelFee: travelFeeNum,
      serviceFeePercentage: 0,
      tipAmount: tipNum,
    });
    return { items, subtotal, discountAmt, afterDiscount: pricing.afterDiscount, tax: pricing.taxAmount, total: pricing.totalAmount, totalMinutes, taxRate, taxRatePercent, taxInclusive, travelFeeNum, tipNum };
  }, [selectedServices, selectedProducts, services, staffList, discountValue, discountType, paymentSettings, travelFee, tipAmount, promoApplied]);

  // Auto-clear promo code when cart items change so stale discount doesn't apply
  useEffect(() => {
    if (promoApplied) {
      setPromoApplied(null);
      setPromoCode("");
      setPromoError("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only react to cart changes
  }, [selectedServices.length, selectedProducts.length]);

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

  // §Provider-launch (audit 2026-04): when the user entered this screen
  // from a specific staff column or a filtered location on the calendar,
  // we receive `staff_id` / `location_id` query params. Pre-seed each
  // newly-added service with that staff so the provider doesn't have to
  // re-pick it per line. Location is handled further down via the
  // existing `selectedLocationId` flow.
  const preselectedStaffId =
    typeof params.staff_id === "string" && params.staff_id.length > 0
      ? params.staff_id
      : undefined;

  // --- Helpers ---
  function toggleService(serviceId: string) {
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.serviceId === serviceId);
      if (exists) return prev.filter((s) => s.serviceId !== serviceId);
      return [
        ...prev,
        { serviceId, addOnIds: [], ...(preselectedStaffId ? { staffId: preselectedStaffId } : {}) },
      ];
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

  function handleAddPackage(pkg: Package) {
    if (!pkg.items || pkg.items.length === 0) {
      Alert.alert("Error", "This package has no items");
      return;
    }
    pkg.items.forEach((item) => {
      if (item.offering_id && item.offering) {
        const offering = item.offering;
        const catalogueService = services?.find((s) => s.id === item.offering_id);
        if (catalogueService) {
          setSelectedServices((prev) => [...prev, { serviceId: catalogueService.id, addOnIds: [] }]);
        } else if (offering.id) {
          Alert.alert("Notice", `Service "${offering.title || offering.name || "Unknown"}" from this package is not in your active catalogue. It was skipped.`);
        }
      } else if (item.product_id && item.product) {
        const prod = item.product;
        const catalogueProduct = productsList.find((p) => p.id === item.product_id);
        const unitPrice = catalogueProduct?.price ?? prod.retail_price ?? 0;
        setSelectedProducts((prev) => [...prev, {
          productId: item.product_id!,
          productName: catalogueProduct?.name ?? prod.name ?? "Product",
          quantity: item.quantity || 1,
          unitPrice,
        }]);
      }
    });
    setSelectedPackageId(pkg.id);
    setShowPackagePicker(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function applyPromoCode() {
    const code = promoCode.trim();
    if (!code) return;
    setPromoValidating(true);
    setPromoError("");
    try {
      const subtotal = summary.subtotal;
      const res = await api.get<{ valid?: boolean; discount?: number; coupon?: { code?: string; discount_type?: string; discount_value?: number }; message?: string }>(
        `/api/provider/coupons/validate?code=${encodeURIComponent(code)}&subtotal=${subtotal}`,
      );
      if (res.error || !res.data?.valid) {
        setPromoError((res.error as { message?: string })?.message || "Invalid code");
        setPromoApplied(null);
        return;
      }
      const coupon = res.data.coupon;
      setPromoApplied({
        code: coupon?.code || code,
        discount: res.data.discount || 0,
        discountType: coupon?.discount_type || "fixed",
        discountValue: coupon?.discount_value || 0,
      });
      setDiscountValue("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setPromoError("Failed to validate code");
      setPromoApplied(null);
    } finally {
      setPromoValidating(false);
    }
  }

  function clearPromoCode() {
    setPromoCode("");
    setPromoApplied(null);
    setPromoError("");
  }

  // --- Validation ---
  function validate(): string | null {
    if (clientMode === "search" && !selectedClient) return "Please select a client";
    if (clientMode === "new" && !newClientFirst.trim()) return "Please enter client first name";
    if (clientMode === "new" && !isWalkIn) {
      const phoneErr = validateE164Phone(newClientPhoneE164);
      if (phoneErr) return phoneErr;
    }
    if (!selectedDate) return "Please select a date";
    if (!selectedTime) return "Please select a time";
    if (selectedServices.length === 0 && selectedProducts.length === 0) return "Please select at least one service or product";
    if (locationType === "at_home") {
      if (!addressLine1.trim()) return "Search and select the client's address";
      if (addressLatitude == null || addressLongitude == null) {
        return "Choose an address from the search suggestions so the map pin and travel distance are accurate.";
      }
    }
    return null;
  }

  async function checkAvailability(): Promise<{ ok: boolean; warning?: string }> {
    if (!selectedDate || !selectedTime || selectedServices.length === 0) return { ok: true };

    setCheckingAvailability(true);
    setConflictWarning(null);

    try {
      const scheduledAt = buildScheduledAtWithTz(selectedDate, selectedTime, providerTimezone);
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
        const msg = conflicts.join("\n");
        setConflictWarning(msg);
        return { ok: false, warning: msg };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not verify availability. You may proceed, but double-check the calendar.";
      setConflictWarning(msg);
      return { ok: true, warning: msg };
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

    const result = await checkAvailability();
    if (!result.ok) {
      Alert.alert(
        "Scheduling Conflict",
        result.warning ?? "There is a conflict at this time. Do you want to proceed anyway?",
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

    const scheduledAt = buildScheduledAtWithTz(selectedDate, selectedTime, providerTimezone);

    const payload: Record<string, unknown> = {
      ...clientPayload,
      scheduled_at: scheduledAt,
      services: selectedServices.map((s) => {
        const svc = services?.find((sv) => sv.id === s.serviceId);
        // Include add-on durations so the server builds the correct booking window
        const addonDuration = s.addOnIds.reduce((acc, aoId) => {
          const ao = svc?.add_ons?.find((a: { id: string; duration_minutes?: number }) => a.id === aoId);
          return acc + (ao?.duration_minutes || 0);
        }, 0);
        return {
          service_id: s.serviceId,
          staff_id: s.staffId || undefined,
          add_on_ids: s.addOnIds.length > 0 ? s.addOnIds : undefined,
          price: svc?.price || 0,
          duration_minutes: (svc?.duration_minutes || 60) + addonDuration,
          currency: svc?.currency || getTenantDefaultCurrency(),
          ...(s.customization ? { customization: s.customization } : {}),
        };
      }),
      products: selectedProducts.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        totalPrice: p.unitPrice * p.quantity,
        productVariantId: p.productVariantId || null,
      })),
      location_type: locationType,
      location_id: locationType === "at_salon" ? selectedLocationId : undefined,
      special_requests: notes.trim() || undefined,
      subtotal: summary.subtotal,
      discount_amount: summary.discountAmt || 0,
      discount_code: promoApplied?.code || undefined,
      discount_reason: promoApplied
        ? `Promo: ${promoApplied.code}`
        : discountValue
          ? `${discountType === "percentage" ? discountValue + "%" : formatCurrency(Number(discountValue) || 0, tenantCurrency)} discount`
          : undefined,
      tax_amount: summary.tax,
      tax_rate: summary.taxRatePercent,
      total_amount: summary.total,
      currency: getTenantDefaultCurrency(),
      status: params.status || params.defaultStatus || undefined,
      referral_source_id: referralSourceId.trim() || undefined,
      booking_source: isWalkIn ? "walk_in" : "provider",
      payment_method: paymentMethod,
      payment_option: paymentOption,
      ...(paymentOption === "deposit" ? {
        deposit_required: true,
        deposit_percentage: depositPercentage,
        deposit_amount: Math.ceil((summary.total * depositPercentage) / 100),
      } : {}),
      send_notification: true,
      ...(selectedPackageId ? { package_id: selectedPackageId } : {}),
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

    const { data: responseData, error } = await createBooking(payload);
    if (error) {
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
                router.push("/(app)/(tabs)/more/settings/subscription" as any),
            },
          ]
        );
      } else {
        Alert.alert("Error", error);
      }
      return;
    }
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
    const warnings = (responseData as any)?._warnings as string[] | undefined;
    if (warnings?.length) {
      Alert.alert("Booking Created", warnings.join("\n"));
    } else {
      Alert.alert("Success", "Booking created successfully");
    }
    router.back();
  }

  /* ---------------------------------------------------------------- */
  /*  JSX                                                             */
  /* ---------------------------------------------------------------- */

  return (
    <KeyboardAvoidingView
      style={twStyle("flex-1 bg-white")}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
    >
      <ScreenContainer>
        <ScreenHeader title={isWalkIn ? "Walk-in Booking" : "New Booking"} showBack />

        {staffError && !staffList ? (
          <View style={twStyle("mx-4 mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3")}>
            <Text style={twStyle("text-sm text-amber-900")}>
              Could not load team list. Pull to refresh the screen or try again — staff assignment may be unavailable.
            </Text>
          </View>
        ) : null}

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
            isWalkIn={isWalkIn}
            serviceAddressSummary={
              locationType === "at_home" && addressLine1.trim()
                ? [addressLine1, addressLine2, addressCity, addressStateProv, addressPostalCode, addressCountry]
                    .filter((s) => typeof s === "string" && s.trim())
                    .join(", ")
                : undefined
            }
            paymentMethod={paymentMethod}
            paymentOption={paymentOption}
            depositPercentage={depositPercentage}
            packageName={selectedPackageId ? (packagesList.find((p) => p.id === selectedPackageId)?.name ?? null) : null}
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
                    accessibilityLabel="Existing client"
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
                    accessibilityLabel="New client"
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
              <SectionLabel label="Booking Type" />
              <View style={twStyle("mb-4 flex-row")}>
                {(
                  [
                    { val: "at_salon", label: "In Salon", icon: "business-outline" as const },
                    { val: "walk_in", label: "Walk-in", icon: "walk-outline" as const },
                    { val: "at_home", label: "At Home", icon: "home-outline" as const },
                  ] as const
                ).map((loc, idx) => {
                  const isActive = loc.val === "walk_in" ? isWalkIn : (!isWalkIn && locationType === loc.val);
                  return (
                  <TouchableOpacity
                    key={loc.val}
                    style={[twStyle(`flex-1 flex-row items-center justify-center rounded-xl border py-3 ${
                      isActive
                        ? "border-gray-900 bg-gray-900"
                        : "border-gray-200 bg-white"
                    }`), idx < 2 ? { marginRight: 8 } : undefined]}
                    onPress={() => {
                      if (loc.val === "walk_in") {
                        setIsWalkIn(true);
                        setLocationType("at_salon");
                      } else {
                        setIsWalkIn(false);
                        setLocationType(loc.val as "at_salon" | "at_home");
                      }
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isActive }}
                    accessibilityLabel={loc.label}
                  >
                    <Ionicons
                      name={loc.icon as any}
                      size={16}
                      color={isActive ? "#fff" : "#6b7280"}
                    />
                    <Text
                      style={twStyle(`ml-2 font-medium ${
                        isActive ? "text-white" : "text-gray-700"
                      }`)}
                    >
                      {loc.label}
                    </Text>
                  </TouchableOpacity>
                  );
                })}
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
                    accessibilityLabel="Street address"
                  />
                  <Text style={twStyle("mb-1 mt-3 text-xs font-medium text-gray-600")}>Unit / apartment (optional)</Text>
                  <TextInput
                    style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                    placeholder="e.g. Unit 4B"
                    placeholderTextColor="#9ca3af"
                    value={addressLine2}
                    onChangeText={setAddressLine2}
                    accessibilityLabel="Unit or apartment"
                  />
                  <View style={[twStyle("flex-row"), { marginTop: 12 }]}>
                    <TextInput
                      style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"), { marginRight: 8 }]}
                      placeholder="City"
                      placeholderTextColor="#9ca3af"
                      value={addressCity}
                      onChangeText={setAddressCity}
                      accessibilityLabel="City"
                    />
                    <TextInput
                      style={twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                      placeholder="Province / state"
                      placeholderTextColor="#9ca3af"
                      value={addressStateProv}
                      onChangeText={setAddressStateProv}
                      accessibilityLabel="Province or state"
                    />
                  </View>
                  <View style={[twStyle("flex-row"), { marginTop: 12 }]}>
                    <TextInput
                      style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"), { marginRight: 8 }]}
                      placeholder="Postal code"
                      placeholderTextColor="#9ca3af"
                      value={addressPostalCode}
                      onChangeText={setAddressPostalCode}
                      accessibilityLabel="Postal code"
                    />
                    <TextInput
                      style={twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                      placeholder="Country"
                      placeholderTextColor="#9ca3af"
                      value={addressCountry}
                      onChangeText={setAddressCountry}
                      accessibilityLabel="Country"
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
                      accessibilityLabel="Travel fee amount"
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
                accessibilityLabel="Tip amount"
              />
            </View>

            <View style={twStyle(isTablet ? "flex-1" : "")}>
              {/* -------- SERVICES -------- */}
              <SectionLabel label="Services" required />
              {servicesLoading ? (
                <LoadingState fullScreen={false} message="Loading services..." />
              ) : servicesError && !services ? (
                <View style={twStyle("mb-4 rounded-xl bg-red-50 p-4")}>
                  <Text style={twStyle("text-sm text-red-600")}>Failed to load services. Pull down to refresh and try again.</Text>
                </View>
              ) : (
                <View style={twStyle("mb-4")}>
                  {(() => {
                    if (!services) return null;
                    const parentSvcs = services.filter((s) => !s.parent_service_id && s.service_type !== "variant");
                    const variantSvcs = services.filter((s) => s.service_type === "variant" || !!s.parent_service_id);
                    const variantsByParent = new Map<string, Service[]>();
                    variantSvcs.forEach((v) => {
                      const key = v.parent_service_id ?? v.id;
                      if (!variantsByParent.has(key)) variantsByParent.set(key, []);
                      variantsByParent.get(key)!.push(v);
                    });

                    const renderServiceRow = (service: Service, indent?: boolean) => {
                      const sel = selectedServices.find((s) => s.serviceId === service.id);
                      const isSelected = !!sel;
                      const staffName = staffList?.find((s) => s.id === sel?.staffId)?.name;
                      const displayName = service.variant_name
                        ? `${service.title} · ${service.variant_name}`
                        : service.title;
                      return (
                        <View key={service.id}>
                          <TouchableOpacity
                            style={[
                              twStyle(`flex-row items-center justify-between rounded-xl border p-4 ${
                                isSelected ? "border-indigo-500 bg-indigo-50" : "border-gray-100 bg-white"
                              }`),
                              indent ? { marginLeft: 12 } : undefined,
                            ]}
                            onPress={() => toggleService(service.id)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isSelected }}
                            accessibilityLabel={`${displayName}, ${service.duration_minutes} minutes`}
                          >
                            <View style={twStyle("flex-1")}>
                              <Text style={twStyle(`text-sm font-medium ${isSelected ? "text-indigo-900" : "text-gray-900"}`)}>
                                {displayName}
                              </Text>
                              <Text style={twStyle("text-xs text-gray-500")}>{formatDuration(service.duration_minutes)}</Text>
                            </View>
                            <View style={twStyle("flex-row items-center")}>
                              <Text style={twStyle(`mr-3 text-sm font-semibold ${isSelected ? "text-indigo-700" : "text-gray-900"}`)}>
                                {formatCurrency(service.price, service.currency)}
                              </Text>
                              <View style={twStyle(`h-5 w-5 items-center justify-center rounded-md ${isSelected ? "bg-indigo-600" : "border border-gray-300"}`)}>
                                {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                              </View>
                            </View>
                          </TouchableOpacity>
                          {isSelected && (
                            <View style={[twStyle("mt-1 mb-1 flex-row"), indent ? { marginLeft: 24 } : { marginLeft: 12 }]}>
                              <TouchableOpacity
                                style={[twStyle("flex-row items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5"), { marginRight: 8 }]}
                                onPress={() => setStaffPickerService(service.id)}
                                accessibilityLabel={`Assign staff for ${displayName}`}
                              >
                                <Ionicons name="person-outline" size={14} color="#6b7280" />
                                <Text style={twStyle("ml-1 text-xs text-gray-600")}>{staffName ?? "Assign Staff"}</Text>
                              </TouchableOpacity>
                              {service.add_ons && service.add_ons.length > 0 && (
                                <TouchableOpacity
                                  style={twStyle("flex-row items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5")}
                                  onPress={() => setAddOnPickerService(service.id)}
                                >
                                  <Ionicons name="add-circle-outline" size={14} color="#6b7280" />
                                  <Text style={twStyle("ml-1 text-xs text-gray-600")}>Add-ons ({sel?.addOnIds.length ?? 0})</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                          {isSelected && (
                            <View style={[twStyle("mt-1 mb-1"), indent ? { marginLeft: 24 } : { marginLeft: 12 }]}>
                              <TextInput
                                style={twStyle("rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700")}
                                placeholder="Add customization notes (optional)"
                                placeholderTextColor="#9ca3af"
                                value={sel?.customization ?? ""}
                                onChangeText={(text) => {
                                  setSelectedServices((prev) =>
                                    prev.map((s) => s.serviceId === service.id ? { ...s, customization: text } : s)
                                  );
                                }}
                                multiline
                                maxLength={500}
                              />
                            </View>
                          )}
                        </View>
                      );
                    };

                    return parentSvcs.map((service, svcIdx) => {
                      const variants = variantsByParent.get(service.id) ?? [];
                      if (variants.length > 0) {
                        return (
                          <View key={service.id} style={svcIdx > 0 ? { marginTop: 12 } : undefined}>
                            <Text style={twStyle("text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 px-1")}>
                              {service.title}
                            </Text>
                            <View style={twStyle("gap-y-2")}>
                              {variants.map((v) => renderServiceRow(v, true))}
                            </View>
                          </View>
                        );
                      }
                      return (
                        <View key={service.id} style={svcIdx > 0 ? { marginTop: 8 } : undefined}>
                          {renderServiceRow(service, false)}
                        </View>
                      );
                    });
                  })()}
                </View>
              )}

              {/* -------- PRODUCTS -------- */}
              {productsList.length > 0 && (
                <View style={twStyle("mb-4")}>
                  <SectionLabel label="Products" />
                  {selectedProducts.map((p, idx) => (
                    <View key={`${p.productId}-${p.productVariantId || ''}`} style={twStyle("mb-2 flex-row items-center justify-between rounded-xl border border-gray-100 bg-white p-3")}>
                      <View style={twStyle("flex-1")}>
                        <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>
                          {p.productVariantName ? `${p.productName} · ${p.productVariantName}` : p.productName}
                        </Text>
                        <Text style={twStyle("text-xs text-gray-500")}>
                          {formatCurrency(p.unitPrice, tenantCurrency)} × {p.quantity}
                        </Text>
                      </View>
                      <View style={twStyle("flex-row items-center gap-2")}>
                        <TouchableOpacity
                          onPress={() => setSelectedProducts((prev) => prev.map((pp, i) => i === idx ? { ...pp, quantity: Math.max(1, pp.quantity - 1) } : pp))}
                          style={twStyle("h-7 w-7 items-center justify-center rounded-md border border-gray-200")}
                          accessibilityLabel="Decrease quantity"
                        >
                          <Ionicons name="remove" size={14} color="#6b7280" />
                        </TouchableOpacity>
                        <Text style={twStyle("text-sm font-medium text-gray-900 w-5 text-center")}>{p.quantity}</Text>
                        <TouchableOpacity
                          onPress={() => setSelectedProducts((prev) => prev.map((pp, i) => i === idx ? { ...pp, quantity: pp.quantity + 1 } : pp))}
                          style={twStyle("h-7 w-7 items-center justify-center rounded-md border border-gray-200")}
                          accessibilityLabel="Increase quantity"
                        >
                          <Ionicons name="add" size={14} color="#6b7280" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setSelectedProducts((prev) => prev.filter((_, i) => i !== idx))}
                          style={twStyle("ml-1 h-7 w-7 items-center justify-center rounded-md")}
                          accessibilityLabel="Remove product"
                        >
                          <Ionicons name="close-circle" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={twStyle("flex-row items-center rounded-xl border border-dashed border-gray-300 px-4 py-3")}
                    onPress={() => setShowProductPicker(true)}
                    accessibilityLabel="Add a product"
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#6366f1" />
                    <Text style={twStyle("ml-2 text-sm font-medium text-indigo-600")}>Add Product</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* -------- PACKAGES -------- */}
              {packagesList.length > 0 && (
                <View style={twStyle("mb-4")}>
                  <SectionLabel label="Package" />
                  {selectedPackageId ? (
                    <View style={twStyle("flex-row items-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3")}>
                      <Ionicons name="gift-outline" size={16} color="#6366f1" />
                      <Text style={twStyle("flex-1 ml-2 text-sm font-medium text-indigo-700")} numberOfLines={1}>
                        {packagesList.find((p) => p.id === selectedPackageId)?.name ?? "Package"}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setSelectedPackageId(null)}
                        accessibilityLabel="Remove package"
                      >
                        <Ionicons name="close-circle" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={twStyle("flex-row items-center rounded-xl border border-dashed border-gray-300 px-4 py-3")}
                      onPress={() => setShowPackagePicker(true)}
                      accessibilityLabel="Add a package"
                    >
                      <Ionicons name="gift-outline" size={18} color="#6366f1" />
                      <Text style={twStyle("ml-2 text-sm font-medium text-indigo-600")}>Add Package</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* -------- DISCOUNT -------- */}
              <SectionLabel label="Discount" />
              <View style={[twStyle("mb-4 flex-row items-center"), promoApplied ? { opacity: 0.4 } : undefined]} pointerEvents={promoApplied ? "none" : "auto"}>
                <View style={[twStyle("flex-1 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-3"), { marginRight: 8 }]}>
                  <TextInput
                    style={twStyle("flex-1 py-3 text-base text-gray-900")}
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                    value={discountValue}
                    onChangeText={setDiscountValue}
                    keyboardType="numeric"
                    editable={!promoApplied}
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
                    {tenantCurrency}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* -------- PROMO CODE -------- */}
              <SectionLabel label="Promo Code" />
              {promoApplied ? (
                <View style={twStyle("mb-4 flex-row items-center rounded-xl border border-green-300 bg-green-50 px-4 py-3")}>
                  <Ionicons name="pricetag" size={16} color="#16a34a" />
                  <View style={twStyle("ml-2 flex-1")}>
                    <Text style={twStyle("text-sm font-semibold text-green-700")}>{promoApplied.code}</Text>
                    <Text style={twStyle("text-xs text-green-600")}>
                      {promoApplied.discountType === "percentage"
                        ? `${promoApplied.discountValue}% off`
                        : `${formatCurrency(promoApplied.discountValue, tenantCurrency)} off`}
                      {" "}({formatCurrency(promoApplied.discount, tenantCurrency)} saved)
                    </Text>
                  </View>
                  <TouchableOpacity onPress={clearPromoCode} accessibilityLabel="Remove promo code">
                    <Ionicons name="close-circle" size={20} color="#6b7280" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={twStyle("mb-4")}>
                  <View style={twStyle("flex-row items-center")}>
                    <View style={[twStyle("flex-1 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-3"), { marginRight: 8 }]}>
                      <TextInput
                        style={twStyle("flex-1 py-3 text-base text-gray-900")}
                        placeholder="Enter promo code"
                        placeholderTextColor="#9ca3af"
                        value={promoCode}
                        onChangeText={(t) => { setPromoCode(t.toUpperCase()); setPromoError(""); }}
                        autoCapitalize="characters"
                        accessibilityLabel="Promo code"
                      />
                    </View>
                    <TouchableOpacity
                      style={twStyle(`rounded-xl px-4 py-3 ${promoCode.trim() ? "bg-indigo-600" : "bg-gray-300"}`)}
                      onPress={applyPromoCode}
                      disabled={!promoCode.trim() || promoValidating}
                      accessibilityLabel="Apply promo code"
                    >
                      {promoValidating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={twStyle("text-sm font-semibold text-white")}>Apply</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {promoError ? (
                    <Text style={twStyle("mt-1 text-xs text-red-500")}>{promoError}</Text>
                  ) : null}
                </View>
              )}

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
                    accessibilityLabel={`Pay by ${pm.label}`}
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

              {/* -------- DEPOSIT OPTION -------- */}
              <View style={twStyle("mb-4")}>
                <SectionLabel label="Payment Option" />
                <View style={twStyle("flex-row")}>
                  <TouchableOpacity
                    style={twStyle(`flex-1 flex-row items-center justify-center rounded-xl border py-3 mr-2 ${
                      paymentOption === "full"
                        ? "border-gray-900 bg-gray-900"
                        : "border-gray-200 bg-white"
                    }`)}
                    onPress={() => setPaymentOption("full")}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={16}
                      color={paymentOption === "full" ? "#fff" : "#6b7280"}
                    />
                    <Text style={twStyle(`ml-1.5 text-sm font-medium ${
                      paymentOption === "full" ? "text-white" : "text-gray-700"
                    }`)}>Full Payment</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={twStyle(`flex-1 flex-row items-center justify-center rounded-xl border py-3 ${
                      paymentOption === "deposit"
                        ? "border-gray-900 bg-gray-900"
                        : "border-gray-200 bg-white"
                    }`)}
                    onPress={() => setPaymentOption("deposit")}
                  >
                    <Ionicons
                      name="layers-outline"
                      size={16}
                      color={paymentOption === "deposit" ? "#fff" : "#6b7280"}
                    />
                    <Text style={twStyle(`ml-1.5 text-sm font-medium ${
                      paymentOption === "deposit" ? "text-white" : "text-gray-700"
                    }`)}>Deposit</Text>
                  </TouchableOpacity>
                </View>
                {paymentOption === "deposit" && (
                  <View style={twStyle("mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3")}>
                    <Text style={twStyle("text-xs font-medium text-gray-600 mb-2")}>Deposit Percentage</Text>
                    <View style={twStyle("flex-row items-center")}>
                      {[20, 30, 50, 100].map((pct) => (
                        <TouchableOpacity
                          key={pct}
                          style={twStyle(`flex-1 items-center py-2 rounded-lg mr-1 ${
                            depositPercentage === pct
                              ? "bg-gray-900"
                              : "bg-white border border-gray-200"
                          }`)}
                          onPress={() => setDepositPercentage(pct)}
                        >
                          <Text style={twStyle(`text-xs font-semibold ${
                            depositPercentage === pct ? "text-white" : "text-gray-700"
                          }`)}>{pct}%</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {summary.total > 0 && (
                      <Text style={twStyle("mt-2 text-xs text-gray-500")}>
                        Deposit: {formatCurrency(Math.ceil((summary.total * depositPercentage) / 100), tenantCurrency)}
                        {" "}of{" "}
                        {formatCurrency(summary.total, tenantCurrency)}
                      </Text>
                    )}
                  </View>
                )}
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
        {!showConfirmation && (selectedServices.length > 0 || selectedProducts.length > 0) && (
          <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-700")}>Summary</Text>
            {selectedPackageId && (
              <View style={twStyle("mb-2 flex-row items-center")}>
                <Ionicons name="gift-outline" size={14} color="#6366f1" />
                <Text style={twStyle("ml-1 text-xs font-medium text-indigo-600")}>
                  Package: {packagesList.find((p) => p.id === selectedPackageId)?.name ?? "Package"}
                </Text>
              </View>
            )}
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
              <Text style={twStyle("text-sm text-gray-500")}>VAT ({summary.taxRatePercent ?? 0}%)</Text>
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

        {!showConfirmation && conflictWarning && (
          <View style={twStyle("mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3")}>
            <View style={twStyle("flex-row items-center gap-2 mb-1")}>
              <Ionicons name="warning-outline" size={18} color="#d97706" />
              <Text style={twStyle("text-sm font-semibold text-amber-800")}>Scheduling Conflict</Text>
            </View>
            <Text style={twStyle("text-sm text-amber-700")}>{conflictWarning}</Text>
          </View>
        )}

        {!showConfirmation && (
          <ActionButton
            label="Review Booking"
            onPress={handleReview}
            disabled={selectedServices.length === 0 && selectedProducts.length === 0}
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
                  accessibilityLabel={`Time ${slot}`}
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

        {/* -------- PRODUCT PICKER SHEET -------- */}
        <BottomSheet
          visible={showProductPicker}
          onClose={() => setShowProductPicker(false)}
          title="Add Product"
        >
          <ScrollView style={{ maxHeight: 400 }}>
            {productsList.map((product) => {
              if (product.variants && product.variants.length > 0) {
                return (
                  <View key={product.id}>
                    <Text style={twStyle("px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide")}>{product.name}</Text>
                    {product.variants.map((v) => {
                      const alreadyAdded = selectedProducts.some((sp) => sp.productId === product.id && sp.productVariantId === v.id);
                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={twStyle(`flex-row items-center justify-between px-4 py-3 border-b border-gray-100 ${alreadyAdded ? "bg-indigo-50" : ""}`)}
                          onPress={() => {
                            if (!alreadyAdded) {
                              setSelectedProducts((prev) => [...prev, {
                                productId: product.id,
                                productName: product.name,
                                productVariantId: v.id,
                                productVariantName: v.name,
                                quantity: 1,
                                unitPrice: v.price,
                              }]);
                            }
                            setShowProductPicker(false);
                          }}
                        >
                          <Text style={twStyle("text-sm text-gray-900")}>{v.name}</Text>
                          <Text style={twStyle("text-sm font-medium text-gray-700")}>{formatCurrency(v.price, tenantCurrency)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              }
              const alreadyAdded = selectedProducts.some((sp) => sp.productId === product.id && !sp.productVariantId);
              return (
                <TouchableOpacity
                  key={product.id}
                  style={twStyle(`flex-row items-center justify-between px-4 py-3 border-b border-gray-100 ${alreadyAdded ? "bg-indigo-50" : ""}`)}
                  onPress={() => {
                    if (!alreadyAdded) {
                      setSelectedProducts((prev) => [...prev, {
                        productId: product.id,
                        productName: product.name,
                        quantity: 1,
                        unitPrice: product.price,
                      }]);
                    }
                    setShowProductPicker(false);
                  }}
                >
                  <Text style={twStyle("text-sm text-gray-900")}>{product.name}</Text>
                  <Text style={twStyle("text-sm font-medium text-gray-700")}>{formatCurrency(product.price, tenantCurrency)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </BottomSheet>

        {/* -------- PACKAGE PICKER SHEET -------- */}
        <BottomSheet
          visible={showPackagePicker}
          onClose={() => setShowPackagePicker(false)}
          title="Add Package"
        >
          <ScrollView style={{ maxHeight: 400 }}>
            {packagesList.map((pkg) => (
              <TouchableOpacity
                key={pkg.id}
                style={twStyle("flex-row items-center justify-between px-4 py-3 border-b border-gray-100")}
                onPress={() => handleAddPackage(pkg)}
              >
                <View style={twStyle("flex-1 mr-3")}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>{pkg.name}</Text>
                  {pkg.description ? (
                    <Text style={twStyle("text-xs text-gray-500 mt-0.5")} numberOfLines={1}>{pkg.description}</Text>
                  ) : null}
                  <Text style={twStyle("text-xs text-gray-400 mt-0.5")}>
                    {pkg.items.length} item{pkg.items.length !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>{formatCurrency(pkg.price, pkg.currency || tenantCurrency)}</Text>
              </TouchableOpacity>
            ))}
            {packagesList.length === 0 && (
              <Text style={twStyle("py-4 text-center text-sm text-gray-400")}>No packages available</Text>
            )}
          </ScrollView>
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
  isWalkIn,
  serviceAddressSummary,
  paymentMethod,
  paymentOption,
  depositPercentage,
  packageName,
  creating,
  onConfirm,
  onBack,
}: {
  summary: {
    items: { name: string; price: number; duration: number; staffName?: string; quantity?: number }[];
    subtotal: number;
    discountAmt: number;
    tax: number;
    total: number;
    totalMinutes: number;
    taxRatePercent?: number;
    travelFeeNum?: number;
    tipNum?: number;
  };
  currency: string;
  selectedDate: Date;
  selectedTime: string;
  clientName: string;
  locationType: string;
  isWalkIn?: boolean;
  serviceAddressSummary?: string;
  paymentMethod: string;
  paymentOption?: "full" | "deposit";
  depositPercentage?: number;
  packageName?: string | null;
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
        <ConfirmRow label="Type" value={isWalkIn ? "Walk-in" : locationType === "at_home" ? "At Home" : "In Salon"} />
        {serviceAddressSummary ? (
          <View style={twStyle("border-b border-gray-50 py-2")}>
            <Text style={twStyle("text-sm text-gray-500")}>Service address</Text>
            <Text style={twStyle("mt-1 text-sm font-medium text-gray-900")}>{serviceAddressSummary}</Text>
          </View>
        ) : null}
        <ConfirmRow label="Payment" value={paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)} />
        {paymentOption === "deposit" && depositPercentage ? (
          <ConfirmRow
            label="Deposit"
            value={`${depositPercentage}% (${formatCurrency(Math.ceil((summary.total * depositPercentage) / 100), currency)})`}
          />
        ) : null}
        {packageName ? <ConfirmRow label="Package" value={packageName} /> : null}
        <ConfirmRow label="Duration" value={formatDuration(summary.totalMinutes)} />
      </View>

      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4")}>
        {summary.items.map((item, i) => (
          <View key={i} style={twStyle("flex-row justify-between py-0.5")}>
            <Text style={twStyle("flex-1 text-sm text-gray-600")} numberOfLines={1}>
              {item.name}{item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ""}{item.staffName ? ` (${item.staffName})` : ""}
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
          <Text style={twStyle("text-sm text-gray-500")}>VAT ({summary.taxRatePercent ?? 0}%)</Text>
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
      <TouchableOpacity style={twStyle("mt-3 items-center py-2")} onPress={onBack} accessibilityLabel="Back to edit" accessibilityRole="button">
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
