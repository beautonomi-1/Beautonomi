import { useState, useMemo, useEffect, useCallback, useRef, memo } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Switch,
  FlatList,
  type ListRenderItemInfo,
  DeviceEventEmitter,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { format, addDays, isSameDay, parseISO, isValid, startOfDay } from "date-fns";
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
import { normalizeProductsList } from "@/lib/unpack-provider-api";
import { PROVIDER_PRODUCTS_CATALOG_CHANGED } from "@/lib/provider-products-catalog-events";
import { PROVIDER_SERVICES_CATALOG_CHANGED } from "@/lib/provider-services-catalog-events";
import { buildZonedIsoForWallClock } from "@/lib/tz";
import { api } from "@/lib/api-client";
import { twStyle } from "@/lib/twStyle";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { AddressMapPinModal } from "@/components/AddressMapPinModal";
import { StaticMapImage } from "@/components/ui/StaticMapImage";
import { reverseGeocodeCoordinates } from "@/lib/reverse-geocode-address";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { ensureForegroundLocationPermission } from "@/lib/native-permissions";
import { useDefaultPhoneDial } from "@/hooks/useDefaultPhoneDial";
import { Colors } from "@/constants/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { calculateBookingTotals, effectiveTravelFee, percentOf, safeNum } from "@beautonomi/utils";
import { BookingDateStrip, BookingTimeSlotGrid } from "@/components/bookings/BookingDateTimePicker";
import {
  ProviderBookingCreatedSuccessSheet,
  type ProviderBookingCreatedSuccessPayload,
} from "@/components/bookings/ProviderBookingCreatedSuccessSheet";
import { useBookingAvailableSlots } from "@/hooks/useBookingAvailableSlots";
import { usePaycloudCollectAvailability } from "@/hooks/usePaycloudCollectAvailability";
import { PaycloudCollectSetupAffordance } from "@/components/payments/PaycloudCollectSetupAffordance";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** From `offering_resources` + `resources` when `include_offering_resources=true` on GET /api/provider/services */
interface ResourceRequirement {
  resource_id: string;
  required: boolean;
  name: string;
  capacity?: number;
  is_active?: boolean;
  location_id?: string | null;
}

interface Service {
  id: string;
  title: string;
  duration_minutes: number;
  price: number;
  currency: string;
  service_type?: string;
  variant_name?: string | null;
  parent_service_id?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  global_category_id?: string | null;
  global_category_name?: string | null;
  category?: { id?: string | null; name?: string | null; title?: string | null } | null;
  global_category?: { id?: string | null; name?: string | null; title?: string | null } | null;
  provider_categories?: { id?: string | null; name?: string | null; title?: string | null } | null;
  add_ons?: AddOn[];
  resource_requirements?: ResourceRequirement[];
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
    is_registered?: boolean;
  };
  /** §Provider-audit 2026-05: surfaced from `/api/provider/clients` so we
   * can render a member/expired/cancelled pill on the new-booking flow. */
  salon_membership?: {
    plan_id?: string | null;
    plan_name?: string | null;
    status?: string | null;
    expires_at?: string | null;
    cancelled_at?: string | null;
    is_entitled?: boolean;
  } | null;
}

interface Client {
  id: string;
  customer_id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url?: string | null;
  is_shadow?: boolean | null;
  /**
   * §Provider-audit 2026-05: when present, the new-booking screen surfaces
   * an explicit member/cancelled/expired pill so providers know exactly
   * which benefits the server will auto-apply.
   */
  salon_membership?: {
    plan_id?: string | null;
    plan_name?: string | null;
    status?: string | null;
    expires_at?: string | null;
    cancelled_at?: string | null;
    is_entitled?: boolean;
  } | null;
}

interface SelectedService {
  serviceId: string;
  staffId?: string;
  addOnIds: string[];
  customization?: string;
  isCustom?: boolean;
  customName?: string;
  customPrice?: number;
  customDuration?: number;
  /**
   * §Provider-audit 2026-04 (packages round 2): track which package a line
   * came from so the "Remove package" action can cleanly undo everything the
   * package added without wiping manual selections.
   */
  fromPackageId?: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  currency: string;
  quantity?: number | null;
  track_stock_quantity?: boolean | null;
  /** Retail category string (from products table / API). */
  category?: string | null;
  variants?: { id: string; name: string; price: number; quantity?: number | null }[];
}

interface SelectedProduct {
  productId: string;
  productName: string;
  productVariantId?: string;
  productVariantName?: string;
  quantity: number;
  unitPrice: number;
  maxStock?: number | null;
  /** See `SelectedService.fromPackageId`. */
  fromPackageId?: string;
}

function stockLimitForProductLine(
  product: Product,
  variant?: { quantity?: number | null } | null,
): number | null {
  if (product.track_stock_quantity === false) return null;
  const raw = variant ? variant.quantity : product.quantity;
  const stock = Number(raw ?? 0);
  return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0;
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

/** Intake / consent / waiver forms (`GET /api/provider/forms`) — answers map to `bookings.provider_form_responses`. */
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

type ProviderFormResponsesState = Record<string, Record<string, string | number | boolean | null>>;

/** Same nesting as checkout / `POST /api/provider/bookings` (`form_id` → `field_id` → value). */
function sanitizeProviderFormResponsesForApi(
  responses: ProviderFormResponsesState,
): Record<string, Record<string, unknown>> | null {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [formId, fields] of Object.entries(responses)) {
    const inner: Record<string, unknown> = {};
    for (const [fieldId, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      inner[fieldId] = v;
    }
    if (Object.keys(inner).length > 0) out[formId] = inner;
  }
  return Object.keys(out).length > 0 ? out : null;
}

type DiscountType = "percentage" | "fixed";
type PaymentMethod =
  | "pay_later"
  | "cash"
  | "card"
  | "yoco_pos"
  | "paycloud_terminal"
  | "payment_link"
  | "paystack_terminal";
type RecurrencePattern = "daily" | "weekly" | "biweekly" | "monthly";

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

/** Non-throwing read of server `_warnings` on create-booking success payloads. */
function readCreateBookingWarnings(data: unknown): string[] | undefined {
  if (data == null || typeof data !== "object") return undefined;
  const raw = (data as { _warnings?: unknown })._warnings;
  if (!Array.isArray(raw)) return undefined;
  const strings = raw.filter((x): x is string => typeof x === "string");
  return strings.length ? strings : undefined;
}

function formatRecurrencePattern(pattern: RecurrencePattern): string {
  switch (pattern) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Every 2 weeks";
    case "monthly":
      return "Monthly";
    default:
      return "Repeating";
  }
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DATE_RANGE_DAYS = 90;
const PAYMENT_METHODS: { label: string; value: PaymentMethod; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Pay Later", value: "pay_later", icon: "time-outline" },
  { label: "Cash", value: "cash", icon: "cash-outline" },
  { label: "Manual Card", value: "card", icon: "card-outline" },
  { label: "Yoco Terminal", value: "yoco_pos", icon: "phone-portrait-outline" },
  { label: "Card machine", value: "paycloud_terminal", icon: "card-outline" },
  { label: "Paystack Terminal", value: "paystack_terminal", icon: "qr-code-outline" },
  { label: "Payment Link", value: "payment_link", icon: "send-outline" },
];
const TIP_PERCENTAGES = [0, 10, 15, 20] as const;
const UNCATEGORIZED_SERVICE_CATEGORY = "__uncategorized__";
const UNCATEGORIZED_PRODUCT_CATEGORY = "__uncategorized_product__";

function getServiceCategoryInfo(service: Service): { id: string; label: string } {
  const id =
    service.category_id ||
    service.global_category_id ||
    service.category?.id ||
    service.global_category?.id ||
    service.provider_categories?.id ||
    UNCATEGORIZED_SERVICE_CATEGORY;
  const label =
    service.category_name ||
    service.global_category_name ||
    service.category?.name ||
    service.category?.title ||
    service.global_category?.name ||
    service.global_category?.title ||
    service.provider_categories?.name ||
    service.provider_categories?.title ||
    "Other";
  return { id, label };
}

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

/** Matches `/api/provider/bookings/available-slots` (shared web availability engine). */
interface AvailableSlotsApiRow {
  time: string;
  available: boolean;
  reason?: string;
}

interface AvailableSlotsApiResponse {
  slots: string[];
  date: string;
  slot_grid?: AvailableSlotsApiRow[];
  provider_timezone?: string | null;
}

const SCHEDULING_DURATION_HINT =
  "Pick a service first so we can show accurate times based on duration.";

/** Default mobile travel buffer minutes — keep aligned with `HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_BUFFER_MINUTES` in apps/web. */
const DEFAULT_MOBILE_TRAVEL_BUFFER_MINUTES = 30;

export default function NewBookingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    date?: string;
    time?: string;
    status?: string;
    defaultStatus?: string;
    clientId?: string;
    client_id?: string;
    walk_in?: string;
    staff_id?: string;
    location_id?: string;
    recurring?: string;
    location_type?: string;
  }>();
  const { isTablet } = useResponsive();
  const { selectedLocationId: providerLocationId, provider: providerProfile } = useProvider();
  const profileTimezone = providerProfile?.timezone ?? null;
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
  const yocoEnabled = bundle?.flags?.payment_yoco?.enabled === true;
  const paystackTerminalEnabled = bundle?.flags?.payment_paystack_virtual_terminal?.enabled === true;
  const paymentLinkEnabled = bundle?.flags?.payment_link?.enabled === true;
  const {
    paycloudEnabled,
    collectEnabled: paycloudCollectEnabled,
    primaryBlocker: paycloudPrimaryBlocker,
    loading: paycloudLoading,
  } = usePaycloudCollectAvailability();
  const defaultPhoneDial = useDefaultPhoneDial();
  const mapboxCountryIso =
    bundle?.meta?.active_market_country?.trim().length === 2
      ? bundle.meta.active_market_country.trim().toUpperCase()
      : "ZA";

  // --- API data ---
  const { data: services, loading: servicesLoading, error: servicesError, refresh: refreshServices } = useApi<Service[]>(
    "/api/provider/services?include_variants=true&include_offering_resources=true",
  );
  const teamUrl = selectedLocationId
    ? `/api/provider/team?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/team";
  const { data: staffList, error: staffError, refresh: refreshStaffList } = useApi<StaffMember[]>(teamUrl);
  const { data: paymentSettings } = useApi<PaymentSettings>("/api/provider/settings/payments");
  const { data: referralSourcesRaw } = useApi<{ id: string; name: string; is_active?: boolean }[]>("/api/provider/referral-sources");
  const referralSources = useMemo(
    () => (Array.isArray(referralSourcesRaw) ? referralSourcesRaw.filter((s) => s.is_active !== false) : []),
    [referralSourcesRaw]
  );
  const { data: providerFormsRaw, loading: formsLoading, error: formsError } = useApi<ProviderForm[]>("/api/provider/forms");
  const activeProviderForms = useMemo(
    () => (Array.isArray(providerFormsRaw) ? providerFormsRaw.filter((f) => f.is_active !== false) : []),
    [providerFormsRaw],
  );
  const { execute: createBooking, loading: creating } = useApiPost<any, any>("/api/provider/bookings");
  const [creatingRecurring, setCreatingRecurring] = useState(false);

  // --- Client search ---
  const [clientSearch, setClientSearch] = useState("");
  const [clientMode, setClientMode] = useState<"search" | "new">("search");
  const { data: rawSearchedClients, loading: clientsLoading } = useApi<ApiClient[]>(
    `/api/provider/clients?search=${encodeURIComponent(clientSearch)}`,
    { enabled: clientSearch.trim().length >= 2 }
  );
  const { data: rawBrowseClients, loading: browseClientsLoading } = useApi<ApiClient[]>(
    "/api/provider/clients/serviced?limit=25",
    { enabled: clientMode === "search" && clientSearch.trim().length < 2 }
  );
  const mapApiClientRow = useCallback(
    (c: ApiClient): Client => ({
      id: c.id,
      customer_id: c.customer_id,
      full_name: c.customer?.full_name || "Unknown",
      email: c.customer?.email || "",
      phone: c.customer?.phone || "",
      avatar_url: c.customer?.avatar_url ?? null,
      is_shadow: c.customer?.is_registered === false,
      salon_membership: c.salon_membership ?? null,
    }),
    [],
  );
  const searchedClients = useMemo<Client[] | null>(() => {
    if (!rawSearchedClients) return null;
    return rawSearchedClients.map(mapApiClientRow);
  }, [rawSearchedClients, mapApiClientRow]);
  const browsableClients = useMemo<Client[] | null>(() => {
    if (!rawBrowseClients) return null;
    return rawBrowseClients.map(mapApiClientRow);
  }, [rawBrowseClients, mapApiClientRow]);
  const displayClients =
    clientSearch.trim().length >= 2 ? searchedClients : browsableClients;
  const displayClientsLoading =
    clientSearch.trim().length >= 2 ? clientsLoading : browseClientsLoading;
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newClientFirst, setNewClientFirst] = useState("");
  const [newClientLast, setNewClientLast] = useState("");
  const [newClientPhoneE164, setNewClientPhoneE164] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");

  // --- Date / Time ---
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (params.date) {
      const parsed = parseISO(params.date);
      if (isValid(parsed)) return parsed;
    }
    return today;
  });
  const [selectedTime, setSelectedTime] = useState<string>(() => params.time ?? "");
  const [showTimePicker, setShowTimePicker] = useState(false);

  // --- Services ---
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [showCustomService, setShowCustomService] = useState(false);
  const [customServiceName, setCustomServiceName] = useState("");
  const [customServicePrice, setCustomServicePrice] = useState("");
  const [customServiceDuration, setCustomServiceDuration] = useState("60");
  const [staffPickerService, setStaffPickerService] = useState<string | null>(null);
  const [addOnPickerService, setAddOnPickerService] = useState<string | null>(null);
  const [selectedServiceCategory, setSelectedServiceCategory] = useState("all");
  const [selectedProductCategory, setSelectedProductCategory] = useState("all");

  // --- Products ---
  // §Provider-audit 2026-04 (round 4): /api/provider/products returns
  // `{ products, total, page, limit, total_pages }`, not a bare array,
  // so the previous `Array.isArray(productsRaw)` check always failed
  // and the product picker on the new-booking screen was permanently
  // empty. Unwrap via the shared helper used by packages.tsx.
  const { data: productsRaw, refresh: refreshProducts } = useApi<unknown>("/api/provider/products?limit=200");
  const productsList = useMemo(
    () => normalizeProductsList(productsRaw) as Product[],
    [productsRaw],
  );
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);

  useEffect(() => {
    const subProducts = DeviceEventEmitter.addListener(PROVIDER_PRODUCTS_CATALOG_CHANGED, () => {
      void refreshProducts();
    });
    const subServices = DeviceEventEmitter.addListener(PROVIDER_SERVICES_CATALOG_CHANGED, () => {
      void refreshServices();
    });
    return () => {
      subProducts.remove();
      subServices.remove();
    };
  }, [refreshProducts, refreshServices]);

  useEffect(() => {
    if (productsList.length === 0 || selectedProducts.length === 0) return;
    setSelectedProducts((prev) => {
      const next: SelectedProduct[] = [];
      for (const line of prev) {
        const product = productsList.find((p) => p.id === line.productId);
        if (!product) continue;
        const variant = product.variants?.find((v) => v.id === line.productVariantId) ?? null;
        const maxStock = stockLimitForProductLine(product, variant);
        if (maxStock === 0) continue;
        next.push({
          ...line,
          maxStock,
          quantity: maxStock == null ? line.quantity : Math.min(line.quantity, maxStock),
        });
      }
      return next;
    });
  }, [productsList, selectedProducts.length]);

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
          is_shadow: raw.customer?.is_registered === false,
          salon_membership: raw.salon_membership ?? null,
        });
      }
    }
  }, [preselectedClientId, rawPreselectedClients, selectedClient]);

  // --- Appointment type ---
  const [isWalkIn, setIsWalkIn] = useState(params.walk_in === "true");
  const [locationType, setLocationType] = useState<"at_salon" | "at_home">(() =>
    params.location_type === "at_home" ? "at_home" : "at_salon",
  );
  useEffect(() => {
    if (params.location_type === "at_home") setLocationType("at_home");
  }, [params.location_type]);
  const [addressSearchValue, setAddressSearchValue] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressStateProv, setAddressStateProv] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [addressLatitude, setAddressLatitude] = useState<number | null>(null);
  const [addressLongitude, setAddressLongitude] = useState<number | null>(null);
  const [addressMapPinOpen, setAddressMapPinOpen] = useState(false);
  const [locatingClientAddress, setLocatingClientAddress] = useState(false);
  const [travelFee, setTravelFee] = useState("");
  /** When true, address-based /api/location/validate will not overwrite the travel fee field. */
  const travelFeeUserLockedRef = useRef(false);
  const [travelFeePreviewLoading, setTravelFeePreviewLoading] = useState(false);
  /** From POST /api/location/validate — drives availability `travel_buffer` parity with customer booking. */
  const [travelPreviewMinutes, setTravelPreviewMinutes] = useState<number | null>(null);
  /** From POST /api/location/validate — straight-line or driving distance to base. */
  const [travelPreviewDistanceKm, setTravelPreviewDistanceKm] = useState<number | null>(null);
  const [tipAmount, setTipAmount] = useState("");
  const [notes, setNotes] = useState("");
  // §Provider-audit 2026-04: allow providers to suppress customer
  // notifications for silent/internal bookings (walk-ins, reception-entered
  // same-day bookings). Default is still true so existing workflows are
  // unchanged; the API has always honoured `send_notification` but the app
  // was hard-coding it to `true`.
  const [sendNotification, setSendNotification] = useState(true);
  const [providerFormResponses, setProviderFormResponses] = useState<ProviderFormResponsesState>({});
  const intakeConfirmationBlocks = useMemo(() => {
    const sanitized = sanitizeProviderFormResponsesForApi(providerFormResponses);
    if (!sanitized) return [] as { formId: string; title: string; lines: string[] }[];
    const blocks: { formId: string; title: string; lines: string[] }[] = [];
    for (const form of activeProviderForms) {
      const inner = sanitized[form.id];
      if (!inner || Object.keys(inner).length === 0) continue;
      const fieldById = new Map((form.fields || []).map((f) => [f.id, f.name]));
      const lines = Object.entries(inner).map(([fid, val]) => {
        const label = fieldById.get(fid) ?? fid;
        const display = typeof val === "boolean" ? (val ? "Yes" : "No") : String(val);
        const shortened = display.length > 120 ? `${display.slice(0, 117)}…` : display;
        return `• ${label}: ${shortened}`;
      });
      blocks.push({ formId: form.id, title: form.title, lines });
    }
    return blocks;
  }, [activeProviderForms, providerFormResponses]);
  const [discountValue, setDiscountValue] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<{ code: string; discount: number; discountType: string; discountValue: number } | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pay_later");
  const [paymentOption, setPaymentOption] = useState<"full" | "deposit">("full");
  const [depositPercentage, setDepositPercentage] = useState<number>(30);
  const [referralSourceId, setReferralSourceId] = useState<string>("");
  const [isRecurring, setIsRecurring] = useState(() => params.recurring === "true");
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("weekly");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState("");

  useEffect(() => {
    if (!yocoEnabled && paymentMethod === "yoco_pos") {
      setPaymentMethod("pay_later");
    }
    if (!paystackTerminalEnabled && paymentMethod === "paystack_terminal") {
      setPaymentMethod("pay_later");
    }
    if (!paymentLinkEnabled && paymentMethod === "payment_link") {
      setPaymentMethod("pay_later");
    }
    if (
      (!paycloudEnabled || !paycloudCollectEnabled) &&
      paymentMethod === "paycloud_terminal"
    ) {
      setPaymentMethod("pay_later");
    }
  }, [
    yocoEnabled,
    paystackTerminalEnabled,
    paymentLinkEnabled,
    paycloudEnabled,
    paycloudCollectEnabled,
    paymentMethod,
  ]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [createdBookingSuccess, setCreatedBookingSuccess] =
    useState<ProviderBookingCreatedSuccessPayload | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [slotAutoSnapMessage, setSlotAutoSnapMessage] = useState<string | null>(null);

  const homeAddressCountryFallback = useMemo(
    () => addressCountry.trim() || bundle?.meta?.tenant_region?.name?.trim() || "South Africa",
    [addressCountry, bundle?.meta?.tenant_region?.name],
  );

  const atHomeTravelBufferMinutes = useMemo(() => {
    if (locationType !== "at_home") return 0;
    if (travelPreviewMinutes != null && Number.isFinite(travelPreviewMinutes) && travelPreviewMinutes > 0) {
      return Math.ceil(travelPreviewMinutes);
    }
    return DEFAULT_MOBILE_TRAVEL_BUFFER_MINUTES;
  }, [locationType, travelPreviewMinutes]);

  // New address / pin → allow server to refresh travel fee again
  useEffect(() => {
    travelFeeUserLockedRef.current = false;
  }, [addressLatitude, addressLongitude]);

  // Dynamic travel fee + drive time (same engine as customer / web booking)
  useEffect(() => {
    if (locationType !== "at_home") {
      setTravelPreviewMinutes(null);
      setTravelPreviewDistanceKm(null);
      return;
    }
    const pid = providerProfile?.id;
    if (
      !pid ||
      !addressLine1.trim() ||
      !addressCity.trim() ||
      addressLatitude == null ||
      addressLongitude == null
    ) {
      setTravelPreviewMinutes(null);
      setTravelPreviewDistanceKm(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setTravelFeePreviewLoading(true);
        try {
          const country = addressCountry.trim() || homeAddressCountryFallback;
          const addressString = [addressLine1, addressLine2, addressCity, addressPostalCode, country]
            .filter(Boolean)
            .join(", ");
          const res = await api.post<{
            valid?: boolean;
            travelFee?: number;
            travelTimeMinutes?: number;
            distanceKm?: number;
          }>("/api/location/validate", {
            address: addressString,
            provider_id: pid,
            latitude: addressLatitude,
            longitude: addressLongitude,
          });
          if (cancelled) return;
          if (res.error) {
            setTravelPreviewMinutes(null);
            setTravelPreviewDistanceKm(null);
            return;
          }
          const d = res.data;
          if (d?.valid === true) {
            const fee = Math.max(0, Number(d.travelFee ?? 0));
            setTravelPreviewMinutes(
              typeof d.travelTimeMinutes === "number" && Number.isFinite(d.travelTimeMinutes)
                ? d.travelTimeMinutes
                : null,
            );
            const dk = d.distanceKm;
            setTravelPreviewDistanceKm(
              typeof dk === "number" && Number.isFinite(dk) ? dk : null,
            );
            if (!travelFeeUserLockedRef.current) {
              setTravelFee(fee === 0 ? "" : fee.toFixed(2));
            }
          } else {
            setTravelPreviewMinutes(null);
            setTravelPreviewDistanceKm(
              typeof d?.distanceKm === "number" && Number.isFinite(d.distanceKm) ? d.distanceKm : null,
            );
            if (!travelFeeUserLockedRef.current) {
              setTravelFee("");
            }
          }
        } catch {
          if (!cancelled) {
            setTravelPreviewMinutes(null);
            setTravelPreviewDistanceKm(null);
          }
        } finally {
          if (!cancelled) setTravelFeePreviewLoading(false);
        }
      })();
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    locationType,
    providerProfile?.id,
    addressLine1,
    addressLine2,
    addressCity,
    addressPostalCode,
    addressCountry,
    addressLatitude,
    addressLongitude,
    homeAddressCountryFallback,
  ]);

  const handleAtHomeDropPin = useCallback(
    async (lat: number, lng: number) => {
      const mapped = await reverseGeocodeCoordinates(lat, lng, homeAddressCountryFallback);
      if (mapped) {
        setAddressSearchValue(`${mapped.address_line1}, ${mapped.city}`);
        setAddressLine1(mapped.address_line1);
        setAddressCity(mapped.city);
        setAddressStateProv(mapped.state);
        setAddressPostalCode(mapped.postal_code);
        setAddressCountry(mapped.country);
        setAddressLatitude(mapped.latitude);
        setAddressLongitude(mapped.longitude);
      } else {
        setAddressLatitude(lat);
        setAddressLongitude(lng);
      }
      setAddressMapPinOpen(false);
    },
    [homeAddressCountryFallback],
  );

  const handleAtHomeCurrentLocation = useCallback(async () => {
    if (locatingClientAddress) return;
    setLocatingClientAddress(true);
    try {
      const allowed = await ensureForegroundLocationPermission({
        title: "Location permission",
        message: "Allow location to fill the client address from your current position.",
      });
      if (!allowed) {
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const mapped = await reverseGeocodeCoordinates(
        loc.coords.latitude,
        loc.coords.longitude,
        homeAddressCountryFallback,
      );
      if (mapped) {
        setAddressSearchValue(`${mapped.address_line1}, ${mapped.city}`);
        setAddressLine1(mapped.address_line1);
        setAddressCity(mapped.city);
        setAddressStateProv(mapped.state);
        setAddressPostalCode(mapped.postal_code);
        setAddressCountry(mapped.country);
        setAddressLatitude(mapped.latitude);
        setAddressLongitude(mapped.longitude);
      } else {
        setAddressLatitude(loc.coords.latitude);
        setAddressLongitude(loc.coords.longitude);
      }
    } catch (e) {
      Alert.alert("Location error", e instanceof Error ? e.message : "Could not read location.");
    } finally {
      setLocatingClientAddress(false);
    }
  }, [locatingClientAddress, homeAddressCountryFallback]);

  // §Provider-audit 2026-04 (round 2): draft persistence reworked to
  // surface an explicit "Resume draft" banner instead of silently
  // repopulating the form. Providers were reporting "ghost" services
  // appearing when they tapped + New booking after a previous aborted
  // attempt. We also expire drafts older than 24h.
  const DRAFT_KEY = "beautonomi_mobile_booking_draft";
  const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  type DraftPayload = {
    notes?: string;
    selectedServices?: SelectedService[];
    selectedProducts?: SelectedProduct[];
    discountValue?: string;
    discountType?: DiscountType;
    tipAmount?: string;
    selectedPackageId?: string | null;
    promoCode?: string;
    providerFormResponses?: ProviderFormResponsesState;
    isRecurring?: boolean;
    recurrencePattern?: RecurrencePattern;
    recurrenceEndDate?: string;
    recurrenceOccurrences?: string;
    savedAt?: number;
  };

  const [pendingDraft, setPendingDraft] = useState<DraftPayload | null>(null);

  // Auto-save draft to AsyncStorage (debounced). Skipped once the user
  // has dismissed a pending-draft banner but not yet made any changes.
  useEffect(() => {
    const hasAnything =
      selectedServices.length > 0 ||
      selectedProducts.length > 0 ||
      notes.trim().length > 0 ||
      !!selectedPackageId ||
      isRecurring ||
      promoCode.trim().length > 0 ||
      Object.keys(providerFormResponses || {}).length > 0;
    if (!hasAnything) return;
    const timer = setTimeout(() => {
      const draft: DraftPayload = {
        notes,
        selectedServices,
        selectedProducts,
        discountValue,
        discountType,
        tipAmount,
        selectedPackageId,
        promoCode,
        providerFormResponses,
        isRecurring,
        recurrencePattern,
        recurrenceEndDate,
        recurrenceOccurrences,
        savedAt: Date.now(),
      };
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [notes, selectedServices, selectedProducts, discountValue, discountType, tipAmount, selectedPackageId, promoCode, providerFormResponses, isRecurring, recurrencePattern, recurrenceEndDate, recurrenceOccurrences]);

  // Peek for a saved draft on mount. Do NOT auto-apply — surface a
  // banner instead (see `renderDraftBanner()` in the JSX below).
  useEffect(() => {
    if (preselectedClientId) return;
    if (params.date || params.time || params.walk_in) return;
    AsyncStorage.getItem(DRAFT_KEY)
      .then((saved) => {
        if (!saved) return;
        try {
          const draft = JSON.parse(saved) as DraftPayload;
          const savedAt = typeof draft.savedAt === "number" ? draft.savedAt : 0;
          if (savedAt && Date.now() - savedAt > DRAFT_MAX_AGE_MS) {
            AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
            return;
          }
          const hasContent =
            (Array.isArray(draft.selectedServices) && draft.selectedServices.length > 0) ||
            (Array.isArray(draft.selectedProducts) && draft.selectedProducts.length > 0) ||
            draft.isRecurring === true ||
            (typeof draft.notes === "string" && draft.notes.trim().length > 0);
          if (!hasContent) {
            AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
            return;
          }
          setPendingDraft(draft);
        } catch {
          AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  /**
   * §Provider-audit 2026-05: previously the draft restorer only filtered
   * services by id, so a draft that had a stale `staffId` (team member
   * removed) or a stale add-on would silently ride along and then fail
   * server validation when the provider tapped Confirm. We now sanitise
   * each line against the *current* catalogue before applying it, and
   * surface any drops as a small toast-style alert so the provider knows
   * what was kept vs dropped.
   */
  const applyPendingDraft = useCallback(() => {
    if (!pendingDraft) return;
    const draft = pendingDraft;
    if (draft.notes) setNotes(draft.notes);

    let droppedServices = 0;
    let droppedAddOns = 0;
    let droppedStaff = 0;
    let droppedProducts = 0;
    let droppedPackage = false;

    // Compute the fallback staff inline to avoid relying on `defaultStaffForNewLines`
    // which is declared further down in this component (TDZ).
    const fallbackStaff =
      typeof params.staff_id === "string" && params.staff_id.length > 0
        ? params.staff_id
        : staffList?.length === 1
          ? staffList[0]?.id
          : undefined;

    if (Array.isArray(draft.selectedServices) && draft.selectedServices.length > 0) {
      const validServices: SelectedService[] = [];
      for (const line of draft.selectedServices) {
        const svc = services ? services.find((s) => s.id === line.serviceId) : null;
        if (services && !svc) {
          droppedServices += 1;
          continue;
        }
        const validAddOnIds = svc
          ? line.addOnIds.filter((aoId) => svc.add_ons?.some((a) => a.id === aoId))
          : line.addOnIds;
        if (svc) droppedAddOns += line.addOnIds.length - validAddOnIds.length;
        const staffOk =
          !line.staffId || (staffList ? staffList.some((s) => s.id === line.staffId) : true);
        if (!staffOk) droppedStaff += 1;
        validServices.push({
          ...line,
          addOnIds: validAddOnIds,
          ...(staffOk ? {} : { staffId: fallbackStaff }),
        });
      }
      if (validServices.length > 0) setSelectedServices(validServices);
    }

    if (Array.isArray(draft.selectedProducts) && draft.selectedProducts.length > 0) {
      const validProducts = productsList.length > 0
        ? draft.selectedProducts.filter((p) => productsList.some((cat) => cat.id === p.productId))
        : draft.selectedProducts;
      droppedProducts = (draft.selectedProducts.length - validProducts.length);
      if (validProducts.length > 0) setSelectedProducts(validProducts);
    }

    if (draft.discountValue) setDiscountValue(draft.discountValue);
    if (draft.discountType) setDiscountType(draft.discountType);
    if (draft.promoCode) setPromoCode(draft.promoCode);
    if (draft.tipAmount) setTipAmount(draft.tipAmount);
    if (draft.selectedPackageId) {
      // Only restore the package if it's still active in the provider's catalogue.
      const stillActive = packagesList.some((p) => p.id === draft.selectedPackageId);
      if (stillActive) setSelectedPackageId(draft.selectedPackageId);
      else droppedPackage = true;
    }
    if (draft.isRecurring === true) setIsRecurring(true);
    if (draft.recurrencePattern) setRecurrencePattern(draft.recurrencePattern);
    if (draft.recurrenceEndDate) setRecurrenceEndDate(draft.recurrenceEndDate);
    if (draft.recurrenceOccurrences) setRecurrenceOccurrences(draft.recurrenceOccurrences);
    if (
      draft.providerFormResponses &&
      typeof draft.providerFormResponses === "object"
    ) {
      setProviderFormResponses(draft.providerFormResponses);
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const drops: string[] = [];
    if (droppedServices > 0) drops.push(`${droppedServices} service${droppedServices === 1 ? "" : "s"} no longer in catalogue`);
    if (droppedAddOns > 0) drops.push(`${droppedAddOns} add-on${droppedAddOns === 1 ? "" : "s"} removed`);
    if (droppedStaff > 0) drops.push(`${droppedStaff} staff assignment${droppedStaff === 1 ? "" : "s"} reset`);
    if (droppedProducts > 0) drops.push(`${droppedProducts} product${droppedProducts === 1 ? "" : "s"} removed`);
    if (droppedPackage) drops.push("package no longer active");
    if (drops.length > 0) {
      Alert.alert(
        "Draft resumed with changes",
        `We restored your draft, but updated it because ${drops.join(", ")}.`,
      );
    }

    setPendingDraft(null);
  }, [pendingDraft, services, staffList, productsList, packagesList, params.staff_id]);

  const discardPendingDraft = useCallback(() => {
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
    setPendingDraft(null);
  }, []);

  // §Provider-audit 2026-04 (B3): wrap every numeric summand in a
  // finite-only coercion so a single malformed price/duration coming
  // from the API (e.g. null, "—", NaN) can't poison `subtotal` or
  // `total` and render "R NaN" in the UI or send NaN to the server.
  //
  // §Cross-app audit 2026-04: `safeNum` is now imported from
  // `@beautonomi/utils` so the customer app and the web API share the
  // same coercion instead of re-implementing it.

  /** Pre-discount cart total for membership preview (matches summary subtotal before discounts). */
  const cartSubtotalOnly = useMemo(() => {
    let subtotal = 0;
    selectedServices.forEach((sel) => {
      if (sel.isCustom) {
        subtotal += safeNum(sel.customPrice);
        return;
      }
      const svc = services?.find((s) => s.id === sel.serviceId);
      if (!svc) return;
      const svcPrice = safeNum(svc.price);
      subtotal += svcPrice;
      sel.addOnIds.forEach((aoId) => {
        const ao = svc.add_ons?.find((a) => a.id === aoId);
        if (!ao) return;
        subtotal += safeNum(ao.price);
      });
    });
    selectedProducts.forEach((p) => {
      const unit = safeNum(p.unitPrice);
      const qty = Math.max(1, Math.floor(safeNum(p.quantity)) || 1);
      subtotal += unit * qty;
    });
    return subtotal;
  }, [selectedServices, selectedProducts, services]);

  const membershipPreviewUrl = useMemo(() => {
    const cid = selectedClient?.customer_id;
    if (!cid || cartSubtotalOnly <= 0) return "";
    return `/api/provider/bookings/pricing-preview?customer_id=${encodeURIComponent(cid)}&subtotal=${encodeURIComponent(String(cartSubtotalOnly))}`;
  }, [selectedClient?.customer_id, cartSubtotalOnly]);

  const { data: membershipPricingPreview } = useApi<{
    membershipDiscountAmount?: number;
    membershipPlanName?: string | null;
  }>(membershipPreviewUrl, { enabled: membershipPreviewUrl.length > 0 });

  // Summary (must be before slotParams which uses summary.totalMinutes)
  const summary = useMemo(() => {
    let subtotal = 0;
    let servicesSubtotal = 0;
    let totalMinutes = 0;
    const items: { name: string; price: number; duration: number; staffName?: string; quantity?: number }[] = [];
    selectedServices.forEach((sel) => {
      if (sel.isCustom) {
        const svcPrice = safeNum(sel.customPrice);
        const svcMinutes = safeNum(sel.customDuration ?? 60);
        subtotal += svcPrice;
        servicesSubtotal += svcPrice;
        totalMinutes += svcMinutes;
        const staffName = staffList?.find((s) => s.id === sel.staffId)?.name;
        items.push({
          name: sel.customName ?? "Custom service",
          price: svcPrice,
          duration: svcMinutes,
          staffName,
        });
        return;
      }
      const svc = services?.find((s) => s.id === sel.serviceId);
      if (!svc) return;
      const svcPrice = safeNum(svc.price);
      const svcMinutes = safeNum(svc.duration_minutes);
      subtotal += svcPrice;
      servicesSubtotal += svcPrice;
      totalMinutes += svcMinutes;
      const staffName = staffList?.find((s) => s.id === sel.staffId)?.name;
      items.push({ name: svc.title, price: svcPrice, duration: svcMinutes, staffName });
      sel.addOnIds.forEach((aoId) => {
        const ao = svc.add_ons?.find((a) => a.id === aoId);
        if (!ao) return;
        const aoPrice = safeNum(ao.price);
        const aoMinutes = safeNum(ao.duration_minutes);
        subtotal += aoPrice;
        servicesSubtotal += aoPrice;
        totalMinutes += aoMinutes;
        items.push({ name: `  + ${ao.name}`, price: aoPrice, duration: aoMinutes });
      });
    });
    selectedProducts.forEach((p) => {
      const unit = safeNum(p.unitPrice);
      const qty = Math.max(1, Math.floor(safeNum(p.quantity)) || 1);
      const lineTotal = unit * qty;
      subtotal += lineTotal;
      items.push({
        name: p.productVariantName ? `${p.productName} · ${p.productVariantName}` : p.productName,
        price: lineTotal,
        duration: 0,
        quantity: qty,
      });
    });
    const discountNumeric = safeNum(discountValue);
    const manualDiscount = discountValue
      ? discountType === "percentage"
        ? (subtotal * discountNumeric) / 100
        : discountNumeric
      : 0;
    const promoDiscount = promoApplied ? safeNum(promoApplied.discount) : 0;

    // §Provider-audit 2026-04 (packages round 2): mirror the server math in
    // POST /api/provider/bookings — `packageDiscount = max(0, servicesSubtotal - pkg.price)` —
    // so the summary on screen matches what gets saved. Previously the
    // provider saw the pre-discount total, then the server silently applied
    // the bundle discount, which made the UI look broken.
    const activePackage = selectedPackageId
      ? packagesList.find((p) => p.id === selectedPackageId)
      : null;
    const packageDiscount = activePackage && activePackage.price != null
      ? Math.max(0, servicesSubtotal - safeNum(activePackage.price))
      : 0;

    const membershipDiscountAmt = safeNum(membershipPricingPreview?.membershipDiscountAmount);
    const baseDiscountAmt = Math.max(manualDiscount, promoDiscount, packageDiscount);
    /** Non-membership discounts only; membership is sent separately to avoid double-counting on the server. */
    const discountAmt = baseDiscountAmt;
    const discountAmtForTotals = baseDiscountAmt + membershipDiscountAmt;

    const taxRatePercent = safeNum(paymentSettings?.taxRatePercent);
    const taxRate = taxRatePercent / 100;
    const taxInclusive = paymentSettings?.taxInclusive ?? true;
    const travelFeeNum = effectiveTravelFee(locationType, safeNum(travelFee));
    const tipNum = safeNum(tipAmount);
    const pricing = calculateBookingTotals({
      subtotal,
      discountAmount: discountAmtForTotals,
      taxRate,
      taxInclusive,
      travelFee: travelFeeNum,
      serviceFeePercentage: 0,
      tipAmount: tipNum,
    });
    return {
      items,
      subtotal,
      discountAmt,
      baseDiscountAmt,
      membershipDiscountAmt,
      membershipPlanName: membershipPricingPreview?.membershipPlanName ?? null,
      packageDiscount,
      manualDiscount,
      promoDiscount,
      afterDiscount: safeNum(pricing.afterDiscount),
      tax: safeNum(pricing.taxAmount),
      total: safeNum(pricing.totalAmount),
      totalMinutes,
      taxRate,
      taxRatePercent,
      taxInclusive,
      travelFeeNum,
      tipNum,
    };
  }, [
    selectedServices,
    selectedProducts,
    services,
    staffList,
    discountValue,
    discountType,
    paymentSettings,
    travelFee,
    locationType,
    tipAmount,
    promoApplied,
    selectedPackageId,
    packagesList,
    membershipPricingPreview?.membershipDiscountAmount,
    membershipPricingPreview?.membershipPlanName,
  ]);

  /** Deduped rooms/equipment linked to selected offerings (offering_resources). */
  const aggregatedBookingResources = useMemo(() => {
    if (!services || selectedServices.length === 0) return [];
    type Agg = {
      resource_id: string;
      name: string;
      required: boolean;
      serviceTitles: string[];
      inactive: boolean;
      locationMismatch: boolean;
    };
    const byId = new Map<string, Agg>();
    for (const sel of selectedServices) {
      if (sel.isCustom) continue;
      const svc = services.find((x) => x.id === sel.serviceId);
      if (!svc) continue;
      const title = svc.variant_name ? `${svc.title} · ${svc.variant_name}` : svc.title;
      for (const r of svc.resource_requirements ?? []) {
        const prev = byId.get(r.resource_id);
        if (!prev) {
          byId.set(r.resource_id, {
            resource_id: r.resource_id,
            name: r.name,
            required: r.required,
            serviceTitles: [title],
            inactive: r.is_active === false,
            locationMismatch:
              Boolean(selectedLocationId) &&
              Boolean(r.location_id) &&
              r.location_id !== selectedLocationId,
          });
        } else {
          prev.required = prev.required || r.required;
          if (!prev.serviceTitles.includes(title)) prev.serviceTitles.push(title);
          if (r.is_active === false) prev.inactive = true;
          if (
            Boolean(selectedLocationId) &&
            Boolean(r.location_id) &&
            r.location_id !== selectedLocationId
          ) {
            prev.locationMismatch = true;
          }
        }
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [services, selectedServices, selectedLocationId]);

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
    const serviceIds = [...new Set(selectedServices.filter((s) => !s.isCustom).map((s) => s.serviceId).filter(Boolean))];
    const mode = locationType === "at_home" ? "mobile" : "salon";
    const travelBuffer = locationType === "at_home" ? atHomeTravelBufferMinutes : 0;
    return {
      date: d,
      duration_minutes: dur,
      staff_ids: staffIds.join(","),
      location_id: selectedLocationId ?? "",
      service_ids: serviceIds.join(","),
      mode,
      travel_buffer: travelBuffer,
    };
  }, [selectedDate, summary.totalMinutes, selectedServices, selectedLocationId, locationType, atHomeTravelBufferMinutes]);

  const {
    rows: timePickerRows,
    loading: availableSlotsLoading,
    providerTimezone: slotsProviderTimezone,
    slotsData: availableSlotsData,
  } = useBookingAvailableSlots(slotParams.date ? slotParams : null, {
    enabled: !!slotParams.date,
  });

  const schedulingTimezone = slotsProviderTimezone || profileTimezone;

  const needsServiceFirstForScheduling =
    selectedServices.length === 0 && selectedProducts.length === 0;

  const handleSelectTimeSlot = useCallback((time: string) => {
    setSelectedTime(time);
    setShowTimePicker(false);
  }, []);

  const apiAvailableTimes = useMemo(() => {
    const fromGrid = availableSlotsData?.slot_grid?.filter((s) => s.available).map((s) => s.time);
    if (fromGrid && fromGrid.length > 0) return fromGrid;
    return availableSlotsData?.slots ?? [];
  }, [availableSlotsData]);

  const serviceCategoryOptions = useMemo(() => {
    if (!services?.length) return [];
    const categories = new Map<string, { id: string; label: string; count: number }>();
    services
      .filter((s) => !s.parent_service_id && s.service_type !== "variant")
      .forEach((service) => {
        const info = getServiceCategoryInfo(service);
        const existing = categories.get(info.id);
        if (existing) {
          existing.count += 1;
        } else {
          categories.set(info.id, { ...info, count: 1 });
        }
      });
    return Array.from(categories.values()).sort((a, b) => {
      if (a.id === UNCATEGORIZED_SERVICE_CATEGORY) return 1;
      if (b.id === UNCATEGORIZED_SERVICE_CATEGORY) return -1;
      return a.label.localeCompare(b.label);
    });
  }, [services]);

  useEffect(() => {
    if (
      selectedServiceCategory !== "all" &&
      !serviceCategoryOptions.some((category) => category.id === selectedServiceCategory)
    ) {
      setSelectedServiceCategory("all");
    }
  }, [selectedServiceCategory, serviceCategoryOptions]);

  const productCategoryOptions = useMemo(() => {
    if (!productsList.length) return [];
    const categories = new Map<string, { id: string; label: string; count: number }>();
    productsList.forEach((product) => {
      const raw = (product.category ?? "").trim();
      const id = raw.length > 0 ? raw : UNCATEGORIZED_PRODUCT_CATEGORY;
      const label = raw.length > 0 ? raw : "Uncategorized";
      const existing = categories.get(id);
      if (existing) {
        existing.count += 1;
      } else {
        categories.set(id, { id, label, count: 1 });
      }
    });
    return Array.from(categories.values()).sort((a, b) => {
      if (a.id === UNCATEGORIZED_PRODUCT_CATEGORY) return 1;
      if (b.id === UNCATEGORIZED_PRODUCT_CATEGORY) return -1;
      return a.label.localeCompare(b.label);
    });
  }, [productsList]);

  useEffect(() => {
    if (
      selectedProductCategory !== "all" &&
      !productCategoryOptions.some((c) => c.id === selectedProductCategory)
    ) {
      setSelectedProductCategory("all");
    }
  }, [selectedProductCategory, productCategoryOptions]);

  const productsForPicker = useMemo(() => {
    if (selectedProductCategory === "all") return productsList;
    return productsList.filter((product) => {
      const raw = (product.category ?? "").trim();
      const id = raw.length > 0 ? raw : UNCATEGORIZED_PRODUCT_CATEGORY;
      return id === selectedProductCategory;
    });
  }, [productsList, selectedProductCategory]);

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
  const defaultStaffForNewLines =
    preselectedStaffId ?? (staffList?.length === 1 ? staffList[0]?.id : undefined);

  // When the engine returns concrete slots, keep the selected time inside that set
  // so check-availability and create payloads match blocks/staff hours.
  useEffect(() => {
    if (!apiAvailableTimes.length) return;
    setSelectedTime((cur) => {
      if (cur && apiAvailableTimes.includes(cur)) return cur;
      if (cur) {
        const idx = apiAvailableTimes.findIndex((s) => s >= cur);
        return idx >= 0 ? apiAvailableTimes[idx]! : apiAvailableTimes[0]!;
      }
      return apiAvailableTimes[0] ?? "";
    });
  }, [apiAvailableTimes, selectedDate]);

  const prevSelectedTimeRef = useRef(selectedTime);
  useEffect(() => {
    const prev = prevSelectedTimeRef.current;
    prevSelectedTimeRef.current = selectedTime;
    if (!prev || !selectedTime || prev === selectedTime) return;
    if (!apiAvailableTimes.includes(prev) && apiAvailableTimes.includes(selectedTime)) {
      setSlotAutoSnapMessage(`Time adjusted to ${selectedTime} — previous slot unavailable`);
      const timer = setTimeout(() => setSlotAutoSnapMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [selectedTime, apiAvailableTimes]);

  // Solo team member: every service line should carry staff_id for slot filtering + create payload.
  useEffect(() => {
    const sole = staffList?.length === 1 ? staffList[0]!.id : null;
    if (!sole) return;
    setSelectedServices((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((row) => {
        if (!row.staffId) {
          changed = true;
          return { ...row, staffId: sole };
        }
        return row;
      });
      return changed ? next : prev;
    });
  }, [staffList]);

  // --- Helpers ---
  function toggleService(serviceId: string) {
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.serviceId === serviceId);
      if (exists) return prev.filter((s) => s.serviceId !== serviceId);
      return [
        ...prev,
        { serviceId, addOnIds: [], ...(defaultStaffForNewLines ? { staffId: defaultStaffForNewLines } : {}) },
      ];
    });
  }

  function addCustomServiceLine() {
    const name = customServiceName.trim();
    const price = safeNum(customServicePrice);
    const duration = Math.max(1, Math.floor(safeNum(customServiceDuration) || 60));
    if (!name) {
      Alert.alert("Custom service", "Enter a service name.");
      return;
    }
    if (price <= 0) {
      Alert.alert("Custom service", "Enter a price greater than zero.");
      return;
    }
    const serviceId = `custom:${Date.now()}`;
    setSelectedServices((prev) => [
      ...prev,
      {
        serviceId,
        addOnIds: [],
        isCustom: true,
        customName: name,
        customPrice: price,
        customDuration: duration,
        ...(defaultStaffForNewLines ? { staffId: defaultStaffForNewLines } : {}),
      },
    ]);
    setCustomServiceName("");
    setCustomServicePrice("");
    setCustomServiceDuration("60");
    setShowCustomService(false);
  }

  function removeCustomService(serviceId: string) {
    setSelectedServices((prev) => prev.filter((s) => s.serviceId !== serviceId));
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

  function applyTipPercentage(percent: number) {
    if (percent <= 0) {
      setTipAmount("");
      return;
    }
    const amount = Math.max(0, (summary.afterDiscount || summary.subtotal) * (percent / 100));
    setTipAmount(amount > 0 ? amount.toFixed(2) : "");
  }

  function handleAddPackage(pkg: Package) {
    if (!pkg.items || pkg.items.length === 0) {
      Alert.alert("Error", "This package has no items");
      return;
    }
    // §Provider-audit 2026-04 (packages round 2): if another package was
    // already attached, swap it rather than stacking two packages onto one
    // booking. Server only stores a single `package_id`, and the discount
    // math only applies to one package.
    let nextServices = selectedPackageId
      ? selectedServices.filter((s) => s.fromPackageId !== selectedPackageId)
      : [...selectedServices];
    let nextProducts = selectedPackageId
      ? selectedProducts.filter((p) => p.fromPackageId !== selectedPackageId)
      : [...selectedProducts];
    const skippedServiceNames: string[] = [];
    const skippedProductNames: string[] = [];

    pkg.items.forEach((item) => {
      if (item.offering_id && item.offering) {
        const offering = item.offering;
        const catalogueService = services?.find((s) => s.id === item.offering_id);
        if (catalogueService) {
          // Respect the package's quantity for services too — some packages
          // bundle "3 blowouts" as one offering with quantity 3.
          const qty = Math.max(1, Math.floor(item.quantity || 1));
          for (let i = 0; i < qty; i++) {
            nextServices.push({
              serviceId: catalogueService.id,
              addOnIds: [],
              ...(defaultStaffForNewLines ? { staffId: defaultStaffForNewLines } : {}),
              fromPackageId: pkg.id,
            });
          }
        } else if (offering.id) {
          skippedServiceNames.push(offering.title || offering.name || "Unknown service");
        }
      } else if (item.product_id && item.product) {
        const prod = item.product;
        const catalogueProduct = productsList.find((p) => p.id === item.product_id);
        const maxStock = catalogueProduct ? stockLimitForProductLine(catalogueProduct) : null;
        const quantity = Math.max(1, Math.floor(item.quantity || 1));
        if (maxStock !== null && quantity > maxStock) {
          skippedProductNames.push(catalogueProduct?.name ?? prod.name ?? "Product");
          return;
        }
        const unitPrice = catalogueProduct?.price ?? prod.retail_price ?? 0;
        nextProducts.push({
          productId: item.product_id!,
          productName: catalogueProduct?.name ?? prod.name ?? "Product",
          quantity,
          unitPrice,
          maxStock,
          fromPackageId: pkg.id,
        });
      }
    });
    setSelectedServices(nextServices);
    setSelectedProducts(nextProducts);
    setSelectedPackageId(pkg.id);
    setShowPackagePicker(false);
    if (skippedServiceNames.length > 0) {
      Alert.alert(
        "Some services were skipped",
        `The following services are not in your active catalogue and were skipped:\n\n• ${skippedServiceNames.join("\n• ")}`,
      );
    }
    if (skippedProductNames.length > 0) {
      Alert.alert(
        "Some products were skipped",
        `These package products are out of stock or below the package quantity:\n\n• ${skippedProductNames.join("\n• ")}`,
      );
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // §Provider-audit 2026-04 (packages round 2): removing a package should
  // undo the lines it added, otherwise the provider is left with a cart that
  // no longer matches the package discount and confusing Summary rows.
  function handleRemovePackage() {
    if (!selectedPackageId) return;
    const pkgId = selectedPackageId;
    setSelectedServices((prev) => prev.filter((s) => s.fromPackageId !== pkgId));
    setSelectedProducts((prev) => prev.filter((p) => p.fromPackageId !== pkgId));
    setSelectedPackageId(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  function setProviderFormField(formId: string, fieldId: string, value: string | number | boolean | null) {
    setProviderFormResponses((prev) => ({
      ...prev,
      [formId]: { ...(prev[formId] ?? {}), [fieldId]: value },
    }));
  }

  // --- Validation ---
  function validate(): string | null {
    if (clientMode === "search" && !selectedClient) return "Please select a client";
    if (clientMode === "new" && !newClientFirst.trim()) return "Please enter client first name";
    if (clientMode === "new" && !isWalkIn) {
      const phoneErr = validateE164Phone(newClientPhoneE164);
      if (phoneErr) return phoneErr;
    }
    if (selectedServices.length === 0 && selectedProducts.length === 0) return "Please select at least one service or product";
    if (!selectedDate) return "Please select a date";
    if (!selectedTime) return "Please select a time";
    if (isRecurring) {
      if (!selectedClient?.customer_id) return "Repeating visits must use a saved client. Select the client from search results first.";
      if (selectedServices.length === 0) return "Repeating visits need at least one service.";
      const occ = recurrenceOccurrences.trim();
      if (occ && (!/^\d+$/.test(occ) || Number(occ) < 2)) return "Repeat count must be at least 2 visits.";
    }
    if ((staffList?.length ?? 0) > 0 && selectedServices.length > 0) {
      const missingStaff = selectedServices.some((s) => !s.staffId);
      if (missingStaff) return "Please assign staff for each service";
    }
    for (const form of activeProviderForms) {
      for (const field of form.fields || []) {
        if (!field.is_required) continue;
        const val = providerFormResponses[form.id]?.[field.id];
        if (field.field_type === "checkbox") {
          if (val !== true) {
            return `Please complete "${field.name}" (${form.title})`;
          }
          continue;
        }
        if (val === undefined || val === null || String(val).trim() === "") {
          return `Please complete "${field.name}" (${form.title})`;
        }
      }
    }
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
      const scheduledAt = buildScheduledAtWithTz(selectedDate, selectedTime, schedulingTimezone);
      const staffIds = selectedServices
        .map((s) => s.staffId)
        .filter((id): id is string => !!id);

      const params = new URLSearchParams({
        scheduled_at: scheduledAt,
        duration_minutes: String(summary.totalMinutes),
      });
      if (staffIds.length > 0) params.set("staff_ids", staffIds.join(","));
      if (selectedLocationId) params.set("location_id", selectedLocationId);
      // §Provider-audit 2026-04: include offerings so the server can
      // pre-flight required resources (rooms, chairs, equipment) and warn
      // before we open the review modal.
      const offeringIds = Array.from(
        new Set(selectedServices.filter((s) => !s.isCustom).map((s) => s.serviceId).filter(Boolean)),
      );
      if (offeringIds.length > 0) params.set("offering_ids", offeringIds.join(","));
      params.set("mode", locationType === "at_home" ? "mobile" : "salon");
      params.set(
        "travel_buffer",
        locationType === "at_home" ? String(atHomeTravelBufferMinutes) : "0",
      );

      const res = await api.get<{ available?: boolean; conflicts?: string[] }>(
        `/api/provider/bookings/check-availability?${params}`,
      );

      if (res.data && res.data.available === false) {
        const conflicts = res.data.conflicts ?? ["There is a scheduling conflict at this time."];
        const msg = conflicts.join("\n");
        setConflictWarning(msg);
        return { ok: false, warning: msg };
      }
      // §Provider-audit 2026-04: API error (e.g. 4xx/5xx) was previously
      // swallowed into "ok: true" which meant the review modal opened without
      // a verified slot — providers could create 409-conflicted bookings
      // without warning. Surface the problem as a soft conflict instead.
      if (res.error) {
        const msg = res.error.message || "Could not verify availability — please double-check the calendar before confirming.";
        setConflictWarning(msg);
        return { ok: false, warning: msg };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : "Could not verify availability — please double-check the calendar before confirming.";
      setConflictWarning(msg);
      return { ok: false, warning: msg };
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

    const scheduledAt = buildScheduledAtWithTz(selectedDate, selectedTime, schedulingTimezone);
    const selectedServicePayloads = selectedServices.map((s) => {
      if (s.isCustom) {
        return {
          isCustom: true,
          customName: s.customName ?? "Custom service",
          name: s.customName ?? "Custom service",
          price: s.customPrice ?? 0,
          duration_minutes: s.customDuration ?? 60,
          duration: s.customDuration ?? 60,
          staff_id: s.staffId || undefined,
          currency: getTenantDefaultCurrency(),
        };
      }
      const svc = services?.find((sv) => sv.id === s.serviceId);
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
        name: svc?.title || "Service",
        ...(s.customization ? { customization: s.customization } : {}),
      };
    });
    const selectedAddOnPayloads = selectedServices.flatMap((s) => {
      const svc = services?.find((sv) => sv.id === s.serviceId);
      return s.addOnIds
        .map((aoId) => {
          const ao = svc?.add_ons?.find((a) => a.id === aoId);
          if (!ao) return null;
          return {
            addon_id: ao.id,
            service_id: s.serviceId,
            name: ao.name,
            quantity: 1,
            price: safeNum(ao.price),
            currency: svc?.currency || getTenantDefaultCurrency(),
          };
        })
        .filter((ao): ao is NonNullable<typeof ao> => Boolean(ao));
    });
    const selectedProductPayloads = selectedProducts.map((p) => {
      const unit = safeNum(p.unitPrice);
      const qty = Math.max(1, Math.floor(safeNum(p.quantity)) || 1);
      return {
        productId: p.productId,
        productName: p.productName,
        quantity: qty,
        unitPrice: unit,
        totalPrice: unit * qty,
        productVariantId: p.productVariantId || null,
      };
    });
    const winManual = summary.baseDiscountAmt === summary.manualDiscount;
    const winPromo = summary.baseDiscountAmt === summary.promoDiscount;
    const winPackage = summary.baseDiscountAmt === summary.packageDiscount;

    const payload: Record<string, unknown> = {
      ...clientPayload,
      scheduled_at: scheduledAt,
      services: selectedServicePayloads,
      addons: selectedAddOnPayloads,
      products: selectedProductPayloads,
      location_type: locationType,
      location_id: locationType === "at_salon" ? selectedLocationId : undefined,
      special_requests: notes.trim() || undefined,
      subtotal: summary.subtotal,
      discount_amount: winManual || winPackage ? (winManual ? summary.manualDiscount : summary.packageDiscount) : 0,
      membership_discount_amount: summary.membershipDiscountAmt || 0,
      promotion_discount_amount: winPromo ? summary.promoDiscount : 0,
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
        deposit_amount: percentOf(summary.total, depositPercentage),
      } : {}),
      send_notification: sendNotification,
      ...(selectedPackageId ? { package_id: selectedPackageId } : {}),
    };
    const providerFormPayload = sanitizeProviderFormResponsesForApi(providerFormResponses);
    if (providerFormPayload) payload.provider_form_responses = providerFormPayload;
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

    if (isRecurring && selectedClient?.customer_id) {
      setCreatingRecurring(true);
      try {
        const recurrenceInterval = recurrencePattern === "biweekly" ? 2 : 1;
        const recurrenceFreq =
          recurrencePattern === "daily"
            ? "DAILY"
            : recurrencePattern === "monthly"
              ? "MONTHLY"
              : "WEEKLY";
        // Recurring bookings are keyed by catalog service_id; custom (ad-hoc) services
        // cannot recur, so narrow to the non-custom payloads that carry a service_id.
        const recurringServicePayloads = selectedServicePayloads.filter(
          (s): s is Extract<typeof s, { service_id: string }> => "service_id" in s,
        );
        const cartItems = [
          ...recurringServicePayloads.map((s) => ({
            id: s.service_id,
            type: "service" as const,
            name: s.name,
            quantity: 1,
            unit_price: s.price,
            total: s.price,
            service_id: s.service_id,
            staff_id: s.staff_id,
            duration_minutes: s.duration_minutes,
          })),
          ...selectedAddOnPayloads.map((ao) => ({
            id: ao.addon_id,
            type: "addon" as const,
            name: ao.name,
            quantity: ao.quantity,
            unit_price: ao.price,
            total: ao.price * ao.quantity,
            addon_id: ao.addon_id,
            service_id: ao.service_id,
          })),
          ...selectedProductPayloads.map((p) => ({
            id: p.productId,
            type: "product" as const,
            name: p.productName,
            quantity: p.quantity,
            unit_price: p.unitPrice,
            total: p.totalPrice,
            product_id: p.productId,
            product_variant_id: p.productVariantId,
          })),
        ];
        const occurrenceCount = recurrenceOccurrences.trim() ? Number(recurrenceOccurrences.trim()) : null;
        const recurrenceParts = [`FREQ=${recurrenceFreq}`, `INTERVAL=${recurrenceInterval}`];
        if (occurrenceCount && Number.isFinite(occurrenceCount) && occurrenceCount > 1) {
          recurrenceParts.push(`COUNT=${Math.floor(occurrenceCount)}`);
        }
        const recurringBody: Record<string, unknown> = {
          customer_id: selectedClient.customer_id,
          service_id: recurringServicePayloads[0]?.service_id,
          staff_id: recurringServicePayloads[0]?.staff_id,
          location_id: locationType === "at_salon" ? selectedLocationId : null,
          recurrence_rule: recurrenceParts.join(";"),
          start_date: format(selectedDate, "yyyy-MM-dd"),
          end_date: occurrenceCount ? undefined : recurrenceEndDate.trim() || undefined,
          occurrences: occurrenceCount || undefined,
          start_time: selectedTime.length >= 5 ? `${selectedTime.slice(0, 5)}:00` : "10:00:00",
          notes: notes.trim() || undefined,
          is_active: true,
          frequency: recurrencePattern,
          preferred_time: selectedTime.slice(0, 5),
          location_type: locationType,
          payment_method: paymentMethod,
          referral_source_id: referralSourceId.trim() || undefined,
          metadata: {
            duration_minutes: summary.totalMinutes,
            price: summary.total,
            booking_source: isWalkIn ? "walk_in" : "provider",
            cart_items: cartItems,
            addons: selectedAddOnPayloads,
            services: recurringServicePayloads.map((s) => ({
              offering_id: s.service_id,
              staff_id: s.staff_id,
            })),
            pricing: {
              subtotal: summary.subtotal,
              discount_amount: winManual || winPackage ? (winManual ? summary.manualDiscount : summary.packageDiscount) : 0,
              promotion_discount_amount: winPromo ? summary.promoDiscount : 0,
              membership_discount_amount: summary.membershipDiscountAmt,
              tax_amount: summary.tax,
              tax_rate: summary.taxRatePercent,
              service_fee_percentage: 0,
              service_fee_amount: 0,
              tip_amount: summary.tipNum,
              travel_fee: locationType === "at_home" ? summary.travelFeeNum : 0,
              total_amount: summary.total,
            },
            ...(locationType === "at_home"
              ? {
                  address: {
                    line1: addressLine1.trim() || null,
                    line2: addressLine2.trim() || null,
                    city: addressCity.trim() || null,
                    state: addressStateProv.trim() || null,
                    postal_code: addressPostalCode.trim() || null,
                    country: addressCountry.trim() || null,
                    latitude: addressLatitude,
                    longitude: addressLongitude,
                  },
                }
              : {}),
          },
        };
        const recurringResult = await api.post<any>("/api/provider/recurring-appointments", recurringBody);
        if (recurringResult.error) {
          const msg = String((recurringResult.error as { message?: string })?.message || "Failed to create repeating visit");
          Alert.alert("Error", msg);
          return;
        }
        AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
        const recurringData = recurringResult.data;
        const warnings = readCreateBookingWarnings(recurringData);
        const initialBookingId =
          recurringData && typeof recurringData === "object" && recurringData !== null && "_initial_booking_id" in recurringData
            ? String((recurringData as { _initial_booking_id?: unknown })._initial_booking_id || "")
            : "";
        if (paymentMethod === "yoco_pos" && initialBookingId) {
          const extra = warnings?.length ? `\n\n${warnings.join("\n")}` : "";
          Alert.alert(
            "Repeating visit created",
            `The first appointment is on the calendar. Use your Yoco terminal to complete card payment.${extra}`,
            [{ text: "Continue", onPress: () => router.replace(`/(app)/(tabs)/bookings/${initialBookingId}?collectYoco=1` as never) }],
          );
        } else if (paymentMethod === "paycloud_terminal" && initialBookingId) {
          const extra = warnings?.length ? `\n\n${warnings.join("\n")}` : "";
          Alert.alert(
            "Repeating visit created",
            `The first appointment is on the calendar. Use your card machine to complete payment.${extra}`,
            [{ text: "Continue", onPress: () => router.replace(`/(app)/(tabs)/bookings/${initialBookingId}?collectPaycloud=1` as never) }],
          );
        } else if (paymentMethod === "paystack_terminal" && initialBookingId) {
          const extra = warnings?.length ? `\n\n${warnings.join("\n")}` : "";
          Alert.alert(
            "Repeating visit created",
            `The first appointment is on the calendar. Show the customer the Paystack Terminal QR or link to complete payment.${extra}`,
            [{ text: "Continue", onPress: () => router.replace(`/(app)/(tabs)/bookings/${initialBookingId}?collectPaystack=1` as never) }],
          );
        } else {
          Alert.alert(
            "Repeating visit created",
            warnings?.length
              ? `Series created, with a note:\n\n${warnings.join("\n")}`
              : "Series created and the first appointment is on the calendar.",
          );
          router.replace("/(app)/(tabs)/more/recurring-appointments" as never);
        }
        return;
      } finally {
        setCreatingRecurring(false);
      }
    }

    const { data: responseData, error, errorCode } = await createBooking(payload);
    if (error) {
      // §Provider-audit 2026-04: branch on typed server error codes rather
      // than scanning the translated message. Slot-conflict / calendar-block
      // paths kick the provider back into the time picker to re-verify
      // availability (common when two devices try to claim the same slot).
      if (
        errorCode === "CONFLICT" ||
        errorCode === "CALENDAR_BLOCK" ||
        errorCode === "RESOURCE_CONFLICT" ||
        errorCode === "SLOT_NOT_AVAILABLE"
      ) {
        setConflictWarning(error);
        Alert.alert("Slot unavailable", error, [
          {
            text: "Pick another time",
            onPress: () => {
              setShowConfirmation(false);
            },
          },
        ]);
        return;
      }
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
                router.push("/(app)/(tabs)/more/settings/subscription" as never),
            },
          ]
        );
      } else {
        Alert.alert("Error", error);
      }
      return;
    }
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
    const warnings = readCreateBookingWarnings(responseData);
    const newBookingId =
      responseData && typeof responseData === "object" && responseData !== null && "id" in responseData
        ? String((responseData as { id: unknown }).id)
        : "";
    const cardChargeTotal =
      paymentMethod === "yoco_pos" || paymentMethod === "paycloud_terminal"
        ? paymentOption === "deposit"
          ? percentOf(summary.total, depositPercentage)
          : summary.total
        : 0;
    const goYoco =
      paymentMethod === "yoco_pos" && cardChargeTotal > 0 && newBookingId.length > 0;
    const goPaycloud =
      paymentMethod === "paycloud_terminal" && cardChargeTotal > 0 && newBookingId.length > 0;
    const paystackChargeTotal =
      paymentMethod === "paystack_terminal"
        ? paymentOption === "deposit"
          ? percentOf(summary.total, depositPercentage)
          : summary.total
        : 0;
    const goPaystack =
      paymentMethod === "paystack_terminal" && paystackChargeTotal > 0 && newBookingId.length > 0;

    const navigateYoco = () => {
      router.replace(`/(app)/(tabs)/bookings/${newBookingId}?collectYoco=1` as never);
    };
    const navigatePaycloud = () => {
      router.replace(`/(app)/(tabs)/bookings/${newBookingId}?collectPaycloud=1` as never);
    };

    if (goYoco) {
      const extra = warnings?.length ? `\n\n${warnings.join("\n")}` : "";
      Alert.alert(
        "Booking created",
        `Use your Yoco terminal to complete card payment.${extra}`,
        [{ text: "Continue", onPress: navigateYoco }],
      );
    } else if (goPaycloud) {
      const extra = warnings?.length ? `\n\n${warnings.join("\n")}` : "";
      Alert.alert(
        "Booking created",
        `Use your card machine to complete payment.${extra}`,
        [{ text: "Continue", onPress: navigatePaycloud }],
      );
    } else if (goPaystack) {
      const extra = warnings?.length ? `\n\n${warnings.join("\n")}` : "";
      Alert.alert(
        "Booking created",
        `Show the customer the Paystack Terminal QR or link to complete payment.${extra}`,
        [{ text: "Continue", onPress: () => router.replace(`/(app)/(tabs)/bookings/${newBookingId}?collectPaystack=1` as never) }],
      );
    } else {
      if (!newBookingId.length) {
        Alert.alert(
          "Booking created",
          warnings?.length
            ? `${warnings.join("\n")}\n\nOpen your bookings list to find the new appointment.`
            : "Open your bookings list to find the new appointment.",
        );
        router.replace("/(app)/(tabs)/bookings" as never);
        return;
      }
      const responseStatus =
        responseData && typeof responseData === "object" && responseData !== null && "status" in responseData
          ? String((responseData as { status: unknown }).status)
          : "booked";
      const responsePaymentStatus =
        responseData &&
        typeof responseData === "object" &&
        responseData !== null &&
        "payment_status" in responseData &&
        (responseData as { payment_status?: unknown }).payment_status != null
          ? String((responseData as { payment_status: unknown }).payment_status)
          : undefined;
      const bookingNumber =
        responseData &&
        typeof responseData === "object" &&
        responseData !== null &&
        "booking_number" in responseData &&
        (responseData as { booking_number?: unknown }).booking_number != null
          ? String((responseData as { booking_number: unknown }).booking_number)
          : undefined;
      const clientName =
        clientMode === "search" && selectedClient
          ? selectedClient.full_name
          : `${newClientFirst.trim()} ${newClientLast.trim()}`.trim();
      setShowConfirmation(false);
      setCreatedBookingSuccess({
        bookingId: newBookingId,
        status: responseStatus,
        paymentStatus: responsePaymentStatus,
        clientName: clientName || undefined,
        date: format(selectedDate, "EEE, MMM d, yyyy"),
        time: selectedTime,
        bookingNumber,
        warnings,
        isWalkIn,
        sendNotification,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /*  JSX                                                             */
  /* ---------------------------------------------------------------- */

  return (
    <View style={{ flex: 1 }}>
      <ScreenContainer onRefresh={() => void refreshStaffList()}>
        <ScreenHeader title={isWalkIn ? "Walk-in Booking" : "New Booking"} showBack />

        {!isWalkIn ? (
          <TouchableOpacity
            onPress={() =>
              router.push("/(app)/(tabs)/more/group-bookings?openCreate=true" as never)
            }
            style={twStyle(
              "mb-3 flex-row items-center rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3",
            )}
            accessibilityRole="button"
            accessibilityLabel="Create group booking"
          >
            <View
              style={twStyle(
                "mr-3 h-10 w-10 items-center justify-center rounded-full bg-indigo-100",
              )}
            >
              <Ionicons name="people-outline" size={20} color="#4338ca" />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-sm font-semibold text-indigo-900")}>Group booking</Text>
              <Text style={twStyle("mt-0.5 text-xs text-indigo-700")}>
                Book multiple participants in one session
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6366f1" />
          </TouchableOpacity>
        ) : null}

        {staffError && !staffList ? (
          <View style={twStyle("mb-2 rounded-2xl border border-amber-200 bg-amber-50 p-3")}>
            <Text style={twStyle("text-sm text-amber-900")}>
              Could not load team list. Pull to refresh the screen or try again — staff assignment may be unavailable.
            </Text>
          </View>
        ) : null}

        {/* §Provider-audit 2026-04 (round 2): resumable draft banner so
            providers explicitly opt in to re-using a previous in-progress
            booking instead of having it silently repopulate. */}
        {pendingDraft && !showConfirmation ? (
          <View
            style={twStyle(
              "mb-2 rounded-3xl border border-primary/20 bg-primary/10 p-3",
            )}
          >
            <View style={twStyle("flex-row items-start")}>
              <Ionicons
                name="document-text-outline"
                size={18}
                color={Colors.primary}
                style={{ marginTop: 2, marginRight: 8 }}
              />
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("text-sm font-semibold text-primary")}>
                  Resume previous draft?
                </Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-700")}>
                  {(() => {
                    const count = (pendingDraft.selectedServices ?? []).length;
                    const parts: string[] = [];
                    if (count > 0) parts.push(`${count} service${count === 1 ? "" : "s"}`);
                    const pCount = (pendingDraft.selectedProducts ?? []).length;
                    if (pCount > 0) parts.push(`${pCount} product${pCount === 1 ? "" : "s"}`);
                    if (pendingDraft.notes && pendingDraft.notes.trim().length > 0) {
                      parts.push("notes");
                    }
                    if (pendingDraft.isRecurring) {
                      parts.push(`repeats ${formatRecurrencePattern(pendingDraft.recurrencePattern ?? "weekly").toLowerCase()}`);
                    }
                    return parts.length > 0
                      ? `Contains ${parts.join(" · ")}.`
                      : "Previous selections saved.";
                  })()}
                </Text>
              </View>
            </View>
            <View style={twStyle("mt-3 flex-row")}>
              <TouchableOpacity
                onPress={applyPendingDraft}
                style={twStyle(
                  "mr-2 flex-1 flex-row items-center justify-center rounded-2xl bg-primary py-2",
                )}
                accessibilityRole="button"
                accessibilityLabel="Resume draft"
              >
                <Ionicons name="refresh" size={14} color="#fff" />
                <Text style={twStyle("ml-1.5 text-xs font-semibold text-white")}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={discardPendingDraft}
                style={twStyle(
                  "flex-1 flex-row items-center justify-center rounded-2xl border border-primary/20 bg-white py-2",
                )}
                accessibilityRole="button"
                accessibilityLabel="Discard draft"
              >
                <Ionicons name="trash-outline" size={14} color={Colors.primary} />
                <Text style={twStyle("ml-1.5 text-xs font-semibold text-primary")}>Discard</Text>
              </TouchableOpacity>
            </View>
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
            specialRequests={notes.trim() || undefined}
            intakeConfirmationBlocks={intakeConfirmationBlocks}
            paymentMethod={paymentMethod}
            paymentOption={paymentOption}
            depositPercentage={depositPercentage}
            isRecurring={isRecurring}
            recurrencePattern={recurrencePattern}
            recurrenceEndDate={recurrenceEndDate.trim() || undefined}
            recurrenceOccurrences={recurrenceOccurrences.trim() || undefined}
            packageName={selectedPackageId ? (packagesList.find((p) => p.id === selectedPackageId)?.name ?? null) : null}
            creating={creating || creatingRecurring}
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
                      <View>
                        <View style={twStyle("flex-row items-center rounded-3xl border border-primary/20 bg-primary/10 p-3")}>
                          <Avatar name={selectedClient.full_name} imageUrl={selectedClient.avatar_url} size="sm" />
                          <View style={twStyle("ml-2 flex-1")}>
                            <Text style={twStyle("text-sm font-medium text-gray-900")}>
                              {selectedClient.full_name}
                            </Text>
                            <Text style={twStyle("text-xs text-gray-500")}>{selectedClient.phone || selectedClient.email}</Text>
                            <Text style={twStyle("mt-0.5 text-[11px] font-semibold text-gray-600")}>
                              {selectedClient.is_shadow ? "Walk-in client" : "Has Beautonomi app"}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setSelectedClient(null)}
                            accessibilityLabel="Remove selected client"
                          >
                            <Ionicons name="close-circle" size={20} color={Colors.primary} />
                          </TouchableOpacity>
                        </View>
                        {/* §Provider-audit 2026-05: visible reminder that the
                          server will auto-apply the membership benefit, and
                          a clear cancelled/expired pill so providers don't
                          assume a lapsed member is still entitled. */}
                        {selectedClient.salon_membership ? (
                          <View
                            style={twStyle(
                              `mt-2 flex-row items-center rounded-xl border px-3 py-2 ${
                                selectedClient.salon_membership.is_entitled
                                  ? "border-purple-200 bg-purple-50"
                                  : selectedClient.salon_membership.cancelled_at
                                    ? "border-red-200 bg-red-50"
                                    : "border-amber-200 bg-amber-50"
                              }`,
                            )}
                          >
                            <Ionicons
                              name={selectedClient.salon_membership.is_entitled ? "ribbon-outline" : "alert-circle-outline"}
                              size={16}
                              color={
                                selectedClient.salon_membership.is_entitled
                                  ? "#7c3aed"
                                  : selectedClient.salon_membership.cancelled_at
                                    ? "#b91c1c"
                                    : "#b45309"
                              }
                            />
                            <Text
                              style={twStyle(
                                `ml-2 flex-1 text-xs font-medium ${
                                  selectedClient.salon_membership.is_entitled
                                    ? "text-purple-800"
                                    : selectedClient.salon_membership.cancelled_at
                                      ? "text-red-700"
                                      : "text-amber-800"
                                }`,
                              )}
                            >
                              {selectedClient.salon_membership.is_entitled
                                ? `Active member${selectedClient.salon_membership.plan_name ? ` — ${selectedClient.salon_membership.plan_name}` : ""}. Member discount applied automatically.`
                                : selectedClient.salon_membership.cancelled_at
                                  ? "Membership cancelled — no member benefits will apply."
                                  : "Membership expired — no member benefits will apply."}
                            </Text>
                          </View>
                        ) : null}
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
                        {clientSearch.trim().length < 2 ? (
                          <Text style={twStyle("mt-2 text-xs text-gray-500")}>
                            Recent clients — or type 2+ characters to search everyone.
                          </Text>
                        ) : null}
                        {displayClientsLoading && (
                          <ActivityIndicator size="small" color="#111" style={twStyle("mt-2")} />
                        )}
                        {displayClients && displayClients.length > 0 && (
                          <View style={twStyle("mt-2 max-h-40 rounded-xl border border-gray-100 bg-white")}>
                            <ScrollView nestedScrollEnabled>
                              {displayClients.map((c) => (
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
                                    <Text style={twStyle("text-[10px] font-semibold text-gray-500")}>
                                      {c.is_shadow ? "Walk-in client" : "Has Beautonomi app"}
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

              {/* -------- SERVICES -------- */}
              <SectionLabel label="Services" required />
              <View style={twStyle("mb-3 flex-row flex-wrap items-center gap-2")}>
                <TouchableOpacity
                  style={twStyle("rounded-full border border-dashed border-primary bg-primary/5 px-3 py-2")}
                  onPress={() => setShowCustomService(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add custom service line item"
                >
                  <Text style={twStyle("text-xs font-semibold text-primary")}>+ Custom service (in person)</Text>
                </TouchableOpacity>
                {selectedClient?.customer_id ? (
                  <TouchableOpacity
                    style={twStyle("rounded-full border border-gray-200 bg-gray-50 px-3 py-2")}
                    onPress={() =>
                      router.push(`/(app)/(tabs)/more/messaging/${selectedClient.customer_id}` as never)
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Send a quote instead via messaging"
                  >
                    <Text style={twStyle("text-xs font-semibold text-gray-700")}>Send a quote instead</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {selectedServices.some((s) => s.isCustom) ? (
                <View style={twStyle("mb-3")}>
                  {selectedServices
                    .filter((s) => s.isCustom)
                    .map((sel) => (
                      <View
                        key={sel.serviceId}
                        style={twStyle("mb-2 flex-row items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3")}
                      >
                        <View style={twStyle("flex-1 pr-2")}>
                          <Text style={twStyle("text-sm font-medium text-gray-900")}>{sel.customName}</Text>
                          <Text style={twStyle("text-xs text-gray-600")}>
                            {formatDuration(sel.customDuration ?? 60)} · Custom price
                          </Text>
                        </View>
                        <View style={twStyle("flex-row items-center")}>
                          <Text style={twStyle("mr-3 text-sm font-semibold text-gray-900")}>
                            {formatCurrency(sel.customPrice ?? 0, getTenantDefaultCurrency())}
                          </Text>
                          <TouchableOpacity
                            onPress={() => removeCustomService(sel.serviceId)}
                            accessibilityLabel={`Remove ${sel.customName}`}
                          >
                            <Ionicons name="close-circle" size={22} color="#b45309" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                </View>
              ) : null}
              {servicesLoading ? (
                <LoadingState fullScreen={false} message="Loading services..." />
              ) : servicesError && !services ? (
                <View style={twStyle("mb-4 rounded-xl bg-red-50 p-4")}>
                  <Text style={twStyle("text-sm text-red-600")}>Failed to load services. Pull down to refresh and try again.</Text>
                </View>
              ) : (
                <View style={twStyle("mb-4")}>
                  {serviceCategoryOptions.length > 1 && (
                    <View style={twStyle("mb-3 rounded-2xl border border-gray-100 bg-gray-50 p-2")}>
                      <Text style={twStyle("mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
                        Filter by category
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <TouchableOpacity
                          style={[
                            twStyle(`mr-2 rounded-full border px-3 py-2 ${
                              selectedServiceCategory === "all" ? "border-gray-900 bg-gray-900" : "border-gray-200 bg-white"
                            }`),
                          ]}
                          onPress={() => setSelectedServiceCategory("all")}
                          accessibilityRole="button"
                          accessibilityLabel="Show all services"
                        >
                          <Text style={twStyle(`text-xs font-semibold ${selectedServiceCategory === "all" ? "text-white" : "text-gray-700"}`)}>
                            All
                          </Text>
                        </TouchableOpacity>
                        {serviceCategoryOptions.map((category) => {
                          const active = selectedServiceCategory === category.id;
                          return (
                            <TouchableOpacity
                              key={category.id}
                              style={[
                                twStyle(`mr-2 rounded-full border px-3 py-2 ${
                                  active ? "border-emerald-600 bg-emerald-600" : "border-emerald-200 bg-white"
                                }`),
                              ]}
                              onPress={() => setSelectedServiceCategory(category.id)}
                              accessibilityRole="button"
                              accessibilityLabel={`Show ${category.label} services`}
                            >
                              <Text style={twStyle(`text-xs font-semibold ${active ? "text-white" : "text-emerald-700"}`)}>
                                {category.label} · {category.count}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                  {(() => {
                    if (!services) return null;
                    const allParentSvcs = services.filter((s) => !s.parent_service_id && s.service_type !== "variant");
                    const parentSvcs = selectedServiceCategory === "all"
                      ? allParentSvcs
                      : allParentSvcs.filter((s) => getServiceCategoryInfo(s).id === selectedServiceCategory);
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
                                isSelected ? "border-primary bg-primary/10" : "border-gray-100 bg-white"
                              }`),
                              indent ? { marginLeft: 12 } : undefined,
                            ]}
                            onPress={() => toggleService(service.id)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isSelected }}
                            accessibilityLabel={`${displayName}, ${service.duration_minutes} minutes`}
                          >
                            <View style={twStyle("flex-1")}>
                              <Text style={twStyle(`text-sm font-medium ${isSelected ? "text-primary" : "text-gray-900"}`)}>
                                {displayName}
                              </Text>
                              <Text style={twStyle("text-xs text-gray-500")}>{formatDuration(service.duration_minutes)}</Text>
                            </View>
                            <View style={twStyle("flex-row items-center")}>
                              <Text style={twStyle(`mr-3 text-sm font-semibold ${isSelected ? "text-primary" : "text-gray-900"}`)}>
                                {formatCurrency(service.price, service.currency)}
                              </Text>
                              <View style={twStyle(`h-5 w-5 items-center justify-center rounded-md ${isSelected ? "bg-primary" : "border border-gray-300"}`)}>
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

                    if (parentSvcs.length === 0) {
                      return (
                        <View style={twStyle("rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6")}>
                          <Text style={twStyle("text-center text-sm font-medium text-gray-600")}>No services in this category</Text>
                          <Text style={twStyle("mt-1 text-center text-xs text-gray-400")}>Choose another category or add services in Catalogue.</Text>
                        </View>
                      );
                    }

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

              {aggregatedBookingResources.length > 0 ? (
                <View
                  style={twStyle("mb-4 rounded-2xl border border-teal-100 bg-teal-50/90 px-4 py-3")}
                  accessibilityLabel="Resource requirements for selected services"
                >
                  <View style={twStyle("mb-2 flex-row items-center")}>
                    <Ionicons name="layers-outline" size={18} color="#0f766e" />
                    <Text style={twStyle("ml-2 text-sm font-semibold text-teal-900")}>Rooms & equipment</Text>
                  </View>
                  <Text style={twStyle("mb-3 text-xs leading-4 text-teal-900/90")}>
                    These come from each service&apos;s resource links in your catalogue. The schedule checks capacity when you
                    continue; assignments show on the booking and can be edited after saving.
                  </Text>
                  {aggregatedBookingResources.map((r) => (
                    <View
                      key={r.resource_id}
                      style={twStyle(`mb-2 rounded-xl border px-3 py-2 ${
                        r.inactive || r.locationMismatch ? "border-amber-200 bg-amber-50/80" : "border-teal-100 bg-white/90"
                      }`)}
                    >
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>
                        {r.name}
                        <Text style={twStyle("text-xs font-normal text-gray-500")}>
                          {" "}
                          · {r.required ? "Required" : "Optional"}
                        </Text>
                      </Text>
                      <Text style={twStyle("mt-0.5 text-xs text-gray-600")}>
                        Services: {r.serviceTitles.join(", ")}
                      </Text>
                      {r.inactive ? (
                        <Text style={twStyle("mt-1 text-xs text-amber-800")}>
                          This resource is inactive — reactivate under Resources &amp; forms or update the service link.
                        </Text>
                      ) : null}
                      {r.locationMismatch ? (
                        <Text style={twStyle("mt-1 text-xs text-amber-800")}>
                          Linked to a different branch than this booking — confirm capacity or adjust assignments after saving.
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {/* -------- DATE -------- */}
              <SectionLabel label="Date" required />
              {needsServiceFirstForScheduling ? (
                <Text style={twStyle("mb-2 text-xs text-amber-800")}>{SCHEDULING_DURATION_HINT}</Text>
              ) : null}
              <View style={twStyle("mb-4")}>
                <BookingDateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} isTablet={isTablet} />
              </View>

              {/* -------- TIME -------- */}
              <SectionLabel label="Time" required />
              {needsServiceFirstForScheduling ? (
                <Text style={twStyle("mb-2 text-xs text-amber-800")}>{SCHEDULING_DURATION_HINT}</Text>
              ) : null}
              <TouchableOpacity
                style={twStyle(`mb-4 flex-row items-center justify-between rounded-xl border px-4 py-3 ${
                  selectedTime ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50"
                }`)}
                onPress={() => setShowTimePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={selectedTime ? `Selected time ${selectedTime}` : "Select time"}
              >
                <View style={twStyle("flex-row items-center")}>
                  <Ionicons name="time-outline" size={18} color={selectedTime ? "#059669" : "#6b7280"} />
                  <Text style={twStyle(`ml-2 text-base ${selectedTime ? "font-semibold text-emerald-800" : "text-gray-400"}`)}>
                    {selectedTime || "Select time slot"}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={18} color="#9ca3af" />
              </TouchableOpacity>

              {/* -------- RECURRING -------- */}
              <SectionLabel label="Repeat booking" />
              <View style={twStyle(`mb-4 rounded-2xl border px-4 py-3 ${
                isRecurring ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"
              }`)}>
                <View style={twStyle("flex-row items-center justify-between")}>
                  <View style={twStyle("flex-1 pr-3")}>
                    <View style={twStyle("flex-row items-center")}>
                      <Ionicons name="repeat-outline" size={18} color={isRecurring ? "#059669" : "#6b7280"} />
                      <Text style={twStyle(`ml-2 text-sm font-bold ${isRecurring ? "text-emerald-900" : "text-gray-900"}`)}>
                        Make this recurring
                      </Text>
                    </View>
                    <Text style={twStyle(`mt-1 text-xs ${isRecurring ? "text-emerald-700" : "text-gray-500"}`)}>
                      Creates a series and puts the first appointment on the calendar now.
                    </Text>
                  </View>
                  <Switch
                    value={isRecurring}
                    onValueChange={(next) => {
                      setIsRecurring(next);
                      if (next && !selectedClient?.customer_id) {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      }
                    }}
                    trackColor={{ false: "#d1d5db", true: "#34d399" }}
                    thumbColor={isRecurring ? "#059669" : "#f4f4f5"}
                    accessibilityLabel="Repeat booking"
                  />
                </View>
                {isRecurring ? (
                  <View style={twStyle("mt-3")}>
                    {!selectedClient ? (
                      <View style={twStyle("mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2")}>
                        <Text style={twStyle("text-xs font-semibold text-amber-800")}>
                          Select an existing saved client first.
                        </Text>
                        <Text style={twStyle("mt-0.5 text-xs text-amber-700")}>
                          Recurring bookings need a saved client profile so future visits can be managed safely.
                        </Text>
                      </View>
                    ) : null}
                    <View style={twStyle("flex-row flex-wrap")}>
                      {(["daily", "weekly", "biweekly", "monthly"] as const).map((pattern) => (
                        <TouchableOpacity
                          key={pattern}
                          style={[twStyle(`rounded-full border px-3 py-2 ${
                            recurrencePattern === pattern
                              ? "border-emerald-700 bg-emerald-600"
                              : "border-emerald-200 bg-white"
                          }`), { marginRight: 8, marginBottom: 8 }]}
                          onPress={() => setRecurrencePattern(pattern)}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: recurrencePattern === pattern }}
                          accessibilityLabel={`Repeat ${pattern}`}
                        >
                          <Text style={twStyle(`text-xs font-semibold ${
                            recurrencePattern === pattern ? "text-white" : "text-emerald-700"
                          }`)}>
                            {pattern === "biweekly" ? "Every 2 weeks" : pattern.charAt(0).toUpperCase() + pattern.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={twStyle("mb-1 mt-1 text-xs font-medium text-emerald-800")}>Optional end date</Text>
                    <TextInput
                      style={twStyle("rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-base text-gray-900")}
                      placeholder="YYYY-MM-DD, leave blank to continue"
                      placeholderTextColor="#9ca3af"
                      value={recurrenceEndDate}
                      onChangeText={(value) => {
                        setRecurrenceEndDate(value);
                        if (value.trim()) setRecurrenceOccurrences("");
                      }}
                      keyboardType="numbers-and-punctuation"
                      accessibilityLabel="Recurring end date"
                    />
                    <Text style={twStyle("my-2 text-center text-xs font-semibold text-emerald-700")}>or</Text>
                    <TextInput
                      style={twStyle("rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-base text-gray-900")}
                      placeholder="End after number of visits"
                      placeholderTextColor="#9ca3af"
                      value={recurrenceOccurrences}
                      onChangeText={(value) => {
                        setRecurrenceOccurrences(value.replace(/\D/g, ""));
                        if (value.trim()) setRecurrenceEndDate("");
                      }}
                      keyboardType="number-pad"
                      accessibilityLabel="Recurring occurrence count"
                    />
                  </View>
                ) : null}
              </View>

              {/* -------- LOCATION --------
                  §Provider-audit 2026-04: hide the "At Home" chip when the
                  provider hasn't enabled mobile services. Falls back to
                  `true` when the capability flag is missing (older profile
                  payloads) so we don't regress existing providers. */}
              <SectionLabel label="Booking Type" />
              <View style={twStyle("mb-4 flex-row")}>
                {(
                  [
                    { val: "at_salon", label: "In Salon", icon: "business-outline" as const },
                    { val: "walk_in", label: "Walk-in", icon: "walk-outline" as const },
                    { val: "at_home", label: "At Home", icon: "home-outline" as const },
                  ] as const
                )
                  .filter((loc) => {
                    if (loc.val !== "at_home") return true;
                    const mobileEnabled =
                      (providerProfile as { offers_mobile_services?: boolean } | null)
                        ?.offers_mobile_services ?? true;
                    return mobileEnabled;
                  })
                  .map((loc, idx, arr) => {
                  const isActive = loc.val === "walk_in" ? isWalkIn : (!isWalkIn && locationType === loc.val);
                  const notLast = idx < arr.length - 1;
                  return (
                  <TouchableOpacity
                    key={loc.val}
                    style={[twStyle(`flex-1 flex-row items-center justify-center rounded-xl border py-3 ${
                      isActive
                        ? "border-gray-900 bg-gray-900"
                        : "border-gray-200 bg-white"
                    }`), notLast ? { marginRight: 8 } : undefined]}
                    onPress={() => {
                      if (loc.val === "walk_in") {
                        setIsWalkIn(true);
                        setLocationType("at_salon");
                        setTravelFee("");
                        travelFeeUserLockedRef.current = false;
                        setTravelPreviewMinutes(null);
                        setTravelPreviewDistanceKm(null);
                      } else {
                        setIsWalkIn(false);
                        const next = loc.val as "at_salon" | "at_home";
                        setLocationType(next);
                        if (next !== "at_home") {
                          setTravelFee("");
                          travelFeeUserLockedRef.current = false;
                          setTravelPreviewMinutes(null);
                          setTravelPreviewDistanceKm(null);
                        }
                      }
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isActive }}
                    accessibilityLabel={loc.label}
                  >
                    <Ionicons
                      name={loc.icon as keyof typeof Ionicons.glyphMap}
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
                    Search, drop a pin on the map, or use current location — pick a result so the pin and travel distance are correct.
                  </Text>
                  <AddressAutocomplete
                    label="Search address"
                    value={addressSearchValue}
                    countryCode={mapboxCountryIso}
                    defaultCountryName={homeAddressCountryFallback}
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
                    proximity={
                      addressLatitude != null && addressLongitude != null
                        ? { latitude: addressLatitude, longitude: addressLongitude }
                        : undefined
                    }
                  />
                  <View style={twStyle("mb-2 mt-2 flex-row flex-wrap gap-2")}>
                    <TouchableOpacity
                      onPress={() => void handleAtHomeCurrentLocation()}
                      disabled={locatingClientAddress}
                      style={twStyle(
                        `rounded-full border px-3 py-1.5 flex-row items-center ${
                          locatingClientAddress ? "border-gray-200 bg-gray-100" : "border-blue-200 bg-blue-50"
                        }`,
                      )}
                      accessibilityLabel="Use current location for client address"
                      accessibilityRole="button"
                    >
                      {locatingClientAddress ? (
                        <ActivityIndicator size="small" color="#2563eb" />
                      ) : (
                        <Ionicons name="locate-outline" size={16} color="#2563eb" />
                      )}
                      <Text style={twStyle("ml-1.5 text-xs font-semibold text-blue-700")}>
                        {locatingClientAddress ? "Locating…" : "Current location"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setAddressMapPinOpen(true)}
                      style={twStyle("rounded-full border border-gray-200 bg-white px-3 py-1.5 flex-row items-center")}
                      accessibilityLabel="Drop pin on map"
                      accessibilityRole="button"
                    >
                      <Ionicons name="map-outline" size={16} color="#374151" />
                      <Text style={twStyle("ml-1.5 text-xs font-semibold text-gray-700")}>Drop pin on map</Text>
                    </TouchableOpacity>
                  </View>
                  {addressLatitude != null && addressLongitude != null && (
                    <View style={{ marginTop: 12, alignItems: "center" }}>
                      <StaticMapImage
                        latitude={addressLatitude}
                        longitude={addressLongitude}
                        width={Math.min(windowWidth - 48, 400)}
                        height={160}
                        zoom={15}
                      />
                      <Text style={twStyle("mt-1.5 text-center text-xs text-gray-500")}>
                        {travelPreviewDistanceKm != null && Number.isFinite(travelPreviewDistanceKm)
                          ? `Selected location — ${travelPreviewDistanceKm.toFixed(1)} km from your base`
                          : "Selected map location"}
                      </Text>
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
                    <Text style={twStyle("mb-1 text-xs text-gray-500")}>
                      Travel fee ({tenantCurrency}) — calculated from address (override optional)
                    </Text>
                    {travelFeePreviewLoading ? (
                      <View style={twStyle("flex-row items-center py-2")}>
                        <ActivityIndicator size="small" color={Colors.primary} />
                        <Text style={twStyle("ml-2 text-sm text-gray-600")}>Calculating travel fee…</Text>
                      </View>
                    ) : travelPreviewDistanceKm != null || travelPreviewMinutes != null ? (
                      <Text style={twStyle("mb-2 text-xs text-gray-600")}>
                        {[
                          travelPreviewDistanceKm != null && Number.isFinite(travelPreviewDistanceKm)
                            ? `${travelPreviewDistanceKm.toFixed(1)} km away`
                            : null,
                          travelPreviewMinutes != null && Number.isFinite(travelPreviewMinutes) && travelPreviewMinutes > 0
                            ? `~${Math.round(travelPreviewMinutes)} min drive`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    ) : null}
                    <TextInput
                      style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                      placeholder="0"
                      placeholderTextColor="#9ca3af"
                      value={travelFee}
                      onChangeText={(t) => {
                        travelFeeUserLockedRef.current = true;
                        setTravelFee(t);
                      }}
                      keyboardType="decimal-pad"
                      accessibilityLabel="Travel fee amount"
                    />
                  </View>
                </View>
              )}
            </View>

            <View style={twStyle(isTablet ? "flex-1" : "")}>
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
                        <View style={twStyle("min-w-[32px] rounded-md bg-white px-2 py-1")}>
                          <Text style={twStyle("text-center text-base font-bold text-gray-950")}>{p.quantity}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setSelectedProducts((prev) => prev.map((pp, i) => {
                            if (i !== idx) return pp;
                            const nextQty = pp.maxStock == null ? pp.quantity + 1 : Math.min(pp.quantity + 1, pp.maxStock);
                            return { ...pp, quantity: nextQty };
                          }))}
                          disabled={p.maxStock != null && p.quantity >= p.maxStock}
                          style={twStyle(`h-7 w-7 items-center justify-center rounded-md border border-gray-200 ${p.maxStock != null && p.quantity >= p.maxStock ? "opacity-40" : ""}`)}
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
                    <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                    <Text style={twStyle("ml-2 text-sm font-medium text-primary")}>Add Product</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* -------- PACKAGES -------- */}
              {packagesList.length > 0 && (
                <View style={twStyle("mb-4")}>
                  <SectionLabel label="Package" />
                  {selectedPackageId ? (
                    <View style={twStyle("flex-row items-center rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3")}>
                      <Ionicons name="gift-outline" size={16} color={Colors.primary} />
                      <Text style={twStyle("flex-1 ml-2 text-sm font-medium text-primary")} numberOfLines={1}>
                        {packagesList.find((p) => p.id === selectedPackageId)?.name ?? "Package"}
                      </Text>
                      <TouchableOpacity
                        onPress={handleRemovePackage}
                        accessibilityLabel="Remove package and undo its items"
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
                      <Ionicons name="gift-outline" size={18} color={Colors.primary} />
                      <Text style={twStyle("ml-2 text-sm font-medium text-primary")}>Add Package</Text>
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
                      style={twStyle(`rounded-xl px-4 py-3 ${promoCode.trim() ? "bg-primary" : "bg-gray-300"}`)}
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
              <View style={twStyle("mb-4 flex-row flex-wrap justify-between")}>
                {PAYMENT_METHODS.filter(
                  (pm) =>
                    (yocoEnabled || pm.value !== "yoco_pos") &&
                    (paycloudEnabled && paycloudCollectEnabled || pm.value !== "paycloud_terminal") &&
                    (paystackTerminalEnabled || pm.value !== "paystack_terminal") &&
                    (paymentLinkEnabled || pm.value !== "payment_link"),
                ).map((pm, idx) => (
                  <TouchableOpacity
                    key={pm.value}
                    style={[twStyle(`flex-row items-center justify-center rounded-xl border py-3 ${
                      paymentMethod === pm.value
                        ? "border-gray-900 bg-gray-900"
                        : "border-gray-200 bg-white"
                    }`), {
                      width: isTablet ? "100%" : "48%",
                      marginBottom: idx < PAYMENT_METHODS.length - 1 ? 8 : 0,
                    }]}
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
              {paycloudEnabled && !paycloudCollectEnabled ? (
                <View style={twStyle("mb-4")}>
                  <PaycloudCollectSetupAffordance blocker={paycloudPrimaryBlocker} loading={paycloudLoading} />
                </View>
              ) : null}

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
                        Deposit: {formatCurrency(percentOf(summary.total, depositPercentage), tenantCurrency)}
                        {" "}of{" "}
                        {formatCurrency(summary.total, tenantCurrency)}
                      </Text>
                    )}
                  </View>
                )}
              </View>

              {/* -------- TIP -------- */}
              <SectionLabel label={`Tip (optional, ${tenantCurrency})`} />
              <View style={twStyle("mb-4")}>
                <View style={twStyle("mb-2 flex-row flex-wrap")}>
                  {TIP_PERCENTAGES.map((pct) => {
                    const target = pct > 0 ? ((summary.afterDiscount || summary.subtotal) * pct) / 100 : 0;
                    const isActive = pct === 0 ? safeNum(tipAmount) === 0 : Math.abs(safeNum(tipAmount) - target) < 0.01;
                    return (
                      <TouchableOpacity
                        key={pct}
                        style={[
                          twStyle(`rounded-full border px-3 py-2 ${
                            isActive ? "border-emerald-600 bg-emerald-600" : "border-emerald-200 bg-emerald-50"
                          }`),
                          { marginRight: 8, marginBottom: 8 },
                        ]}
                        onPress={() => applyTipPercentage(pct)}
                        accessibilityRole="button"
                        accessibilityLabel={pct === 0 ? "No tip" : `Tip ${pct} percent`}
                      >
                        <Text style={twStyle(`text-xs font-semibold ${isActive ? "text-white" : "text-emerald-700"}`)}>
                          {pct === 0 ? "No tip" : `${pct}%`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                  placeholder="Custom amount"
                  placeholderTextColor="#9ca3af"
                  value={tipAmount}
                  onChangeText={setTipAmount}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Tip amount"
                />
              </View>

              {/* -------- REFERRAL SOURCE -------- */}
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
                  placeholder={referralSources.length > 0 ? "Select referral source" : "No sources configured yet"}
                  accessibilityLabel="Referral source"
                />
              </View>

              {/* -------- PROVIDER INTAKE / CONSENT FORMS -------- */}
              {(formsLoading || formsError || activeProviderForms.length > 0) && (
                <View style={twStyle("mb-4")}>
                  <SectionLabel label="Client forms" />
                  {formsError && !providerFormsRaw ? (
                    <Text style={twStyle("mb-2 text-sm text-red-600")}>{formsError}</Text>
                  ) : null}
                  {formsLoading && activeProviderForms.length === 0 ? (
                    <Text style={twStyle("text-sm text-gray-500")}>Loading forms…</Text>
                  ) : null}
                  {activeProviderForms.map((form) => (
                    <View
                      key={form.id}
                      style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white p-3")}
                    >
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                        {form.title}
                        {form.is_required ? <Text style={twStyle("text-red-500")}> *</Text> : null}
                      </Text>
                      {form.description ? (
                        <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{form.description}</Text>
                      ) : null}
                      {(form.fields || []).map((field) => {
                        // Supported field_type values enforced by DB CHECK:
                        // 'text' | 'checkbox' | 'signature' | 'date'
                        const val = providerFormResponses[form.id]?.[field.id];
                        const isCheckbox = field.field_type === "checkbox";
                        const isDate = field.field_type === "date";
                        return (
                          <View key={field.id} style={twStyle("mt-3")}>
                            <Text style={twStyle("mb-1 text-xs font-medium text-gray-700")}>
                              {field.name}
                              {field.is_required ? <Text style={twStyle("text-red-500")}> *</Text> : null}
                            </Text>
                            {isCheckbox ? (
                              <View style={twStyle("flex-row items-center justify-between")}>
                                <Text style={twStyle("text-sm text-gray-600")}>Yes</Text>
                                <Switch
                                  value={val === true}
                                  onValueChange={(on) => setProviderFormField(form.id, field.id, on)}
                                  accessibilityLabel={field.name}
                                />
                              </View>
                            ) : (
                              <TextInput
                                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900")}
                                placeholder={
                                  field.field_type === "signature"
                                    ? "Type name to sign"
                                    : isDate
                                      ? "YYYY-MM-DD"
                                      : undefined
                                }
                                placeholderTextColor="#9ca3af"
                                value={val === undefined || val === null ? "" : String(val)}
                                onChangeText={(t) => setProviderFormField(form.id, field.id, t)}
                                keyboardType={isDate ? "numbers-and-punctuation" : "default"}
                                accessibilityLabel={field.name}
                              />
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
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

              {/* -------- NOTIFY CUSTOMER -------- */}
              <View
                style={twStyle(
                  "mb-4 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3",
                )}
              >
                <View style={twStyle("flex-1 pr-3")}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>
                    Notify customer
                  </Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    Send confirmation & reminders. Turn off for silent front-desk bookings.
                  </Text>
                </View>
                <Switch
                  value={sendNotification}
                  onValueChange={setSendNotification}
                  trackColor={{ false: "#d1d5db", true: Colors.primaryRing }}
                  thumbColor={sendNotification ? Colors.primary : "#f4f4f5"}
                  accessibilityLabel="Notify customer"
                />
              </View>
            </View>
          </View>
        )}

        {/* -------- SUMMARY -------- */}
        {!showConfirmation && (selectedServices.length > 0 || selectedProducts.length > 0) && (
          <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-700")}>Summary</Text>
            {selectedPackageId && (
              <View style={twStyle("mb-2 flex-row items-center")}>
                <Ionicons name="gift-outline" size={14} color={Colors.primary} />
                <Text style={twStyle("ml-1 text-xs font-medium text-primary")}>
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
            {summary.membershipDiscountAmt > 0 && (
              <View style={twStyle("flex-row justify-between")}>
                <Text style={twStyle("text-sm text-primary")}>
                  Membership discount
                  {summary.membershipPlanName ? ` (${summary.membershipPlanName})` : ""}
                </Text>
                <Text style={twStyle("text-sm text-primary")}>
                  {formatCurrency(-summary.membershipDiscountAmt, tenantCurrency)}
                </Text>
              </View>
            )}
            {summary.baseDiscountAmt > 0 && (
              <View style={twStyle("flex-row justify-between")}>
                <Text style={twStyle("text-sm text-green-600")}>
                  {selectedPackageId && summary.packageDiscount > 0 && summary.baseDiscountAmt === summary.packageDiscount
                    ? "Package saving"
                    : "Discount"}
                </Text>
                <Text style={twStyle("text-sm text-green-600")}>{formatCurrency(-summary.baseDiscountAmt, tenantCurrency)}</Text>
              </View>
            )}
            <View style={twStyle("flex-row justify-between")}>
              <Text style={twStyle("text-sm text-gray-500")}>VAT ({summary.taxRatePercent ?? 0}%)</Text>
              <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(summary.tax, tenantCurrency)}</Text>
            </View>
            {locationType === "at_home" && summary.travelFeeNum > 0 && (
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

        {!showConfirmation ? <View style={{ height: 112 + Math.max(insets.bottom, 12) }} /> : null}

        {/* -------- TIME PICKER SHEET -------- */}
        <BottomSheet
          visible={showTimePicker}
          onClose={() => setShowTimePicker(false)}
          title="Select Time"
          subtitle={selectedTime ? `Currently: ${selectedTime}` : "Tap a slot to confirm"}
          snapHeight="full"
        >
          {/* Compact inline note — one line instead of a paragraph so slots get more room */}
          <View style={twStyle("mb-3 flex-row items-center rounded-xl border border-blue-100 bg-blue-50 px-3 py-2")}>
            <Ionicons name="information-circle-outline" size={14} color="#1d4ed8" style={{ marginRight: 6 }} />
            <Text style={twStyle("flex-1 text-xs leading-4 text-blue-800")}>
              Slots with a customer hold appear unavailable until the hold expires.
            </Text>
          </View>
          {slotAutoSnapMessage ? (
            <View style={twStyle("mb-3 flex-row items-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2")}>
              <Ionicons name="alert-circle-outline" size={14} color="#d97706" style={{ marginRight: 6 }} />
              <Text style={twStyle("flex-1 text-xs text-amber-800")}>{slotAutoSnapMessage}</Text>
            </View>
          ) : null}
          {needsServiceFirstForScheduling ? (
            <View style={twStyle("mb-3 flex-row items-center rounded-xl border border-amber-100 bg-amber-50 px-3 py-2")}>
              <Ionicons name="alert-circle-outline" size={14} color="#d97706" style={{ marginRight: 6 }} />
              <Text style={twStyle("flex-1 text-xs text-amber-800")}>{SCHEDULING_DURATION_HINT}</Text>
            </View>
          ) : null}
          <BookingTimeSlotGrid
            rows={timePickerRows}
            selectedTime={selectedTime}
            onSelectTime={handleSelectTimeSlot}
            loading={availableSlotsLoading}
            providerTimezone={schedulingTimezone}
          />
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
          {productCategoryOptions.length > 1 && (
            <View style={twStyle("mb-3 rounded-2xl border border-primary/20 bg-primary/10 p-2")}>
              <Text style={twStyle("mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
                Filter by category
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <TouchableOpacity
                  style={[
                    twStyle(`mr-2 rounded-full border px-3 py-2 ${
                      selectedProductCategory === "all" ? "border-primary bg-primary" : "border-primary/20 bg-white"
                    }`),
                  ]}
                  onPress={() => setSelectedProductCategory("all")}
                  accessibilityRole="button"
                  accessibilityLabel="Show all products"
                >
                  <Text style={twStyle(`text-xs font-semibold ${selectedProductCategory === "all" ? "text-white" : "text-gray-700"}`)}>
                    All
                  </Text>
                </TouchableOpacity>
                {productCategoryOptions.map((category) => {
                  const active = selectedProductCategory === category.id;
                  return (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        twStyle(`mr-2 rounded-full border px-3 py-2 ${
                          active ? "border-primary bg-primary" : "border-primary/20 bg-white"
                        }`),
                      ]}
                      onPress={() => setSelectedProductCategory(category.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Show ${category.label} products`}
                    >
                      <Text style={twStyle(`text-xs font-semibold ${active ? "text-white" : "text-primary"}`)}>
                        {category.label} · {category.count}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
          <ScrollView style={{ maxHeight: 400 }}>
            {productsForPicker.length === 0 && (
              <Text style={twStyle("py-6 text-center text-sm text-gray-500")}>
                {productsList.length === 0 ? "No products in catalogue" : "No products in this category"}
              </Text>
            )}
            {productsForPicker.map((product) => {
              if (product.variants && product.variants.length > 0) {
                return (
                  <View key={product.id}>
                    <Text style={twStyle("px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide")}>{product.name}</Text>
                    {product.variants.map((v) => {
                      const alreadyAdded = selectedProducts.some((sp) => sp.productId === product.id && sp.productVariantId === v.id);
                      const maxStock = stockLimitForProductLine(product, v);
                      const isOutOfStock = maxStock === 0;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={twStyle(`flex-row items-center justify-between px-4 py-3 border-b border-gray-100 ${alreadyAdded ? "bg-primary/10" : ""} ${isOutOfStock ? "opacity-45" : ""}`)}
                          disabled={isOutOfStock}
                          onPress={() => {
                            if (!alreadyAdded && !isOutOfStock) {
                              setSelectedProducts((prev) => [...prev, {
                                productId: product.id,
                                productName: product.name,
                                productVariantId: v.id,
                                productVariantName: v.name,
                                quantity: 1,
                                unitPrice: v.price,
                                maxStock,
                              }]);
                            }
                            setShowProductPicker(false);
                          }}
                        >
                          <View>
                            <Text style={twStyle("text-sm text-gray-900")}>{v.name}</Text>
                            {maxStock != null ? (
                              <Text style={twStyle(`text-xs ${isOutOfStock ? "text-red-600" : "text-gray-500"}`)}>
                                {isOutOfStock ? "Out of stock" : `${maxStock} in stock`}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={twStyle("text-sm font-medium text-gray-700")}>{formatCurrency(v.price, tenantCurrency)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              }
              const alreadyAdded = selectedProducts.some((sp) => sp.productId === product.id && !sp.productVariantId);
              const maxStock = stockLimitForProductLine(product);
              const isOutOfStock = maxStock === 0;
              return (
                <TouchableOpacity
                  key={product.id}
                  style={twStyle(`flex-row items-center justify-between px-4 py-3 border-b border-gray-100 ${alreadyAdded ? "bg-primary/10" : ""} ${isOutOfStock ? "opacity-45" : ""}`)}
                  disabled={isOutOfStock}
                  onPress={() => {
                    if (!alreadyAdded && !isOutOfStock) {
                      setSelectedProducts((prev) => [...prev, {
                        productId: product.id,
                        productName: product.name,
                        quantity: 1,
                        unitPrice: product.price,
                        maxStock,
                      }]);
                    }
                    setShowProductPicker(false);
                  }}
                >
                  <View>
                    <Text style={twStyle("text-sm text-gray-900")}>{product.name}</Text>
                    {maxStock != null ? (
                      <Text style={twStyle(`text-xs ${isOutOfStock ? "text-red-600" : "text-gray-500"}`)}>
                        {isOutOfStock ? "Out of stock" : `${maxStock} in stock`}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={twStyle("text-sm font-medium text-gray-700")}>{formatCurrency(product.price, tenantCurrency)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </BottomSheet>

        {/* -------- PACKAGE PICKER SHEET -------- */}
        {/* §Provider-audit 2026-04 (packages round 2): each row now previews
            the items bundled in the package and surfaces the saving vs. the
            items' standalone price, so the provider can tell packages apart
            at a glance (previously they only saw name + price). */}
        <BottomSheet
          visible={showPackagePicker}
          onClose={() => setShowPackagePicker(false)}
          title="Add Package"
        >
          <ScrollView style={{ maxHeight: 480 }}>
            {packagesList.map((pkg) => {
              const itemsSubtotal = (pkg.items ?? []).reduce((sum, it) => {
                const qty = Math.max(1, Math.floor(it.quantity || 1));
                if (it.offering_id) {
                  const catalogue = services?.find((s) => s.id === it.offering_id);
                  const unit = safeNum(catalogue?.price ?? it.offering?.price);
                  return sum + unit * qty;
                }
                if (it.product_id) {
                  const catalogue = productsList.find((p) => p.id === it.product_id);
                  const unit = safeNum(catalogue?.price ?? it.product?.retail_price);
                  return sum + unit * qty;
                }
                return sum;
              }, 0);
              const saving = Math.max(0, itemsSubtotal - safeNum(pkg.price));
              const itemsLabel = (pkg.items ?? [])
                .slice(0, 3)
                .map((it) => {
                  const qty = Math.max(1, Math.floor(it.quantity || 1));
                  const name = it.offering?.title || it.offering?.name || it.product?.name || "Item";
                  return qty > 1 ? `${qty}× ${name}` : name;
                })
                .join(", ");
              const extraItems = Math.max(0, (pkg.items?.length ?? 0) - 3);
              const currency = pkg.currency || tenantCurrency;
              return (
                <TouchableOpacity
                  key={pkg.id}
                  style={twStyle("px-4 py-3 border-b border-gray-100")}
                  onPress={() => handleAddPackage(pkg)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add package ${pkg.name}`}
                >
                  <View style={twStyle("flex-row items-start justify-between")}>
                    <View style={twStyle("flex-1 mr-3")}>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>{pkg.name}</Text>
                      {pkg.description ? (
                        <Text style={twStyle("text-xs text-gray-500 mt-0.5")} numberOfLines={2}>{pkg.description}</Text>
                      ) : null}
                      {itemsLabel ? (
                        <Text style={twStyle("text-xs text-gray-500 mt-1")} numberOfLines={2}>
                          {itemsLabel}
                          {extraItems > 0 ? ` +${extraItems} more` : ""}
                        </Text>
                      ) : (
                        <Text style={twStyle("text-xs text-gray-400 mt-1")}>
                          {pkg.items.length} item{pkg.items.length !== 1 ? "s" : ""}
                        </Text>
                      )}
                    </View>
                    <View style={twStyle("items-end")}>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                        {formatCurrency(pkg.price, currency)}
                      </Text>
                      {saving > 0 && (
                        <Text style={twStyle("text-xs font-medium text-green-600 mt-0.5")}>
                          Save {formatCurrency(saving, currency)}
                        </Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            {packagesList.length === 0 && (
              <Text style={twStyle("py-4 text-center text-sm text-gray-400")}>No packages available</Text>
            )}
          </ScrollView>
        </BottomSheet>

        {/* -------- CUSTOM SERVICE SHEET -------- */}
        <BottomSheet
          visible={showCustomService}
          onClose={() => setShowCustomService(false)}
          title="Custom service"
        >
          <Text style={twStyle("mb-3 text-xs text-gray-500")}>
            For walk-in bespoke work priced on the spot. Use &quot;Send a quote instead&quot; when the client needs to approve remotely.
          </Text>
          <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>Service name</Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            placeholder="e.g. Colour correction"
            placeholderTextColor="#9ca3af"
            value={customServiceName}
            onChangeText={setCustomServiceName}
          />
          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>Price</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                value={customServicePrice}
                onChangeText={setCustomServicePrice}
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>Duration (min)</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                placeholder="60"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                value={customServiceDuration}
                onChangeText={setCustomServiceDuration}
              />
            </View>
          </View>
          <TouchableOpacity
            style={twStyle("rounded-xl bg-primary py-3 items-center")}
            onPress={addCustomServiceLine}
          >
            <Text style={twStyle("font-semibold text-white")}>Add to booking</Text>
          </TouchableOpacity>
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
                      isChecked ? "border-primary bg-primary/10" : "border-gray-100 bg-white"
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
                          isChecked ? "bg-primary" : "border border-gray-300"
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

        <AddressMapPinModal
          visible={addressMapPinOpen}
          onClose={() => setAddressMapPinOpen(false)}
          onPickCoordinates={(lat, lng) => {
            void handleAtHomeDropPin(lat, lng);
          }}
          initialCoordinate={
            addressLatitude != null && addressLongitude != null
              ? { latitude: addressLatitude, longitude: addressLongitude }
              : null
          }
        />
      </ScreenContainer>
      {!showConfirmation ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: "rgba(255,255,255,0.96)",
            borderTopWidth: 1,
            borderTopColor: "#f1f5f9",
          }}
        >
          <ActionButton
            label={
              checkingAvailability
                ? "Checking availability…"
                : isRecurring
                  ? "Review Repeating Booking"
                  : "Review Booking"
            }
            onPress={handleReview}
            disabled={(selectedServices.length === 0 && selectedProducts.length === 0) || checkingAvailability}
            loading={checkingAvailability}
            fullWidth
            size="lg"
            variant="brand"
          />
        </View>
      ) : null}
      <ProviderBookingCreatedSuccessSheet
        visible={createdBookingSuccess != null}
        payload={createdBookingSuccess}
        onDismiss={() => setCreatedBookingSuccess(null)}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirmation step                                                  */
/* ------------------------------------------------------------------ */

function formatNewBookingPaymentLabel(method: string): string {
  switch (method) {
    case "cash":
      return "Cash";
    case "card":
      return "Manual Card";
    case "yoco_pos":
      return "Yoco Terminal";
    case "paycloud_terminal":
      return "Card machine";
    case "paystack_terminal":
      return "Paystack Terminal";
    case "payment_link":
      return "Payment Link";
    case "pay_later":
    case "online":
      return "Pay Later";
    default:
      return method ? method.charAt(0).toUpperCase() + method.slice(1) : "—";
  }
}

function ConfirmationView({
  summary,
  currency,
  selectedDate,
  selectedTime,
  clientName,
  locationType,
  isWalkIn,
  serviceAddressSummary,
  specialRequests,
  intakeConfirmationBlocks,
  paymentMethod,
  paymentOption,
  depositPercentage,
  isRecurring,
  recurrencePattern,
  recurrenceEndDate,
  recurrenceOccurrences,
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
    membershipDiscountAmt?: number;
    membershipPlanName?: string | null;
    baseDiscountAmt?: number;
    packageDiscount?: number;
    manualDiscount?: number;
    promoDiscount?: number;
    taxInclusive?: boolean;
  };
  currency: string;
  selectedDate: Date;
  selectedTime: string;
  clientName: string;
  locationType: string;
  isWalkIn?: boolean;
  serviceAddressSummary?: string;
  specialRequests?: string;
  intakeConfirmationBlocks?: { formId: string; title: string; lines: string[] }[];
  paymentMethod: string;
  paymentOption?: "full" | "deposit";
  depositPercentage?: number;
  isRecurring?: boolean;
  recurrencePattern?: RecurrencePattern;
  recurrenceEndDate?: string;
  recurrenceOccurrences?: string;
  packageName?: string | null;
  creating: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <View accessibilityLabel="Booking confirmation">
      <View style={twStyle("mb-4 items-center")}>
        <View style={twStyle(`mb-2 h-14 w-14 items-center justify-center rounded-2xl ${isRecurring ? "bg-emerald-100" : "bg-primary/10"}`)}>
          <Ionicons name={isRecurring ? "repeat-outline" : "checkmark-circle-outline"} size={30} color={isRecurring ? "#059669" : Colors.primary} />
        </View>
        <Text style={twStyle("text-lg font-bold text-gray-900")}>
          {isRecurring ? "Confirm Repeating Booking" : "Confirm Booking"}
        </Text>
        <Text style={twStyle("text-sm text-gray-500")}>
          {isRecurring ? "Review the series details below" : "Review the details below"}
        </Text>
      </View>

      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <ConfirmRow label="Client" value={clientName} />
        <ConfirmRow label="Date" value={format(selectedDate, "EEE, MMM d, yyyy")} />
        <ConfirmRow label="Time" value={selectedTime} />
        {isRecurring ? (
          <ConfirmRow
            label="Repeats"
            value={`${formatRecurrencePattern(recurrencePattern ?? "weekly")}${recurrenceOccurrences ? ` for ${recurrenceOccurrences} visits` : recurrenceEndDate ? ` until ${recurrenceEndDate}` : ""}`}
          />
        ) : null}
        <ConfirmRow label="Type" value={isWalkIn ? "Walk-in" : locationType === "at_home" ? "At Home" : "In Salon"} />
        {serviceAddressSummary ? (
          <View style={twStyle("border-b border-gray-50 py-2")}>
            <Text style={twStyle("text-sm text-gray-500")}>Service address</Text>
            <Text style={twStyle("mt-1 text-sm font-medium text-gray-900")}>{serviceAddressSummary}</Text>
          </View>
        ) : null}
        <ConfirmRow label="Payment" value={formatNewBookingPaymentLabel(paymentMethod)} />
        {paymentOption === "deposit" && depositPercentage ? (
          <ConfirmRow
            label="Deposit"
            value={`${depositPercentage}% (${formatCurrency(percentOf(summary.total, depositPercentage), currency)})`}
          />
        ) : null}
        {packageName ? <ConfirmRow label="Package" value={packageName} /> : null}
        <ConfirmRow label="Duration" value={formatDuration(summary.totalMinutes)} />
        {specialRequests ? (
          <View style={twStyle("border-b border-gray-50 py-2")}>
            <Text style={twStyle("text-sm text-gray-500")}>Special requests</Text>
            <Text style={twStyle("mt-1 text-sm font-medium text-gray-900")}>{specialRequests}</Text>
          </View>
        ) : null}
      </View>

      {intakeConfirmationBlocks && intakeConfirmationBlocks.length > 0 ? (
        <View style={twStyle("mb-4 rounded-2xl border border-primary/20 bg-primary/10 p-4")}>
          <Text style={twStyle("mb-2 text-sm font-semibold text-primary")}>Client forms</Text>
          {intakeConfirmationBlocks.map((block) => (
            <View key={block.formId} style={twStyle("mb-3")}>
              <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-primary")}>
                {block.title}
              </Text>
              {block.lines.map((line, i) => (
                <Text key={i} style={twStyle("mt-1 pl-1 text-sm text-gray-800")}>
                  {line}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}

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
        {(summary.membershipDiscountAmt ?? 0) > 0 && (
          <View style={twStyle("flex-row justify-between")}>
            <Text style={twStyle("text-sm text-primary")}>
              Membership discount
              {summary.membershipPlanName ? ` (${summary.membershipPlanName})` : ""}
            </Text>
            <Text style={twStyle("text-sm text-primary")}>
              {formatCurrency(-(summary.membershipDiscountAmt ?? 0), currency)}
            </Text>
          </View>
        )}
        {(summary.baseDiscountAmt ?? 0) > 0 && (
          <View style={twStyle("flex-row justify-between")}>
            <Text style={twStyle("text-sm text-green-600")}>Discount</Text>
            <Text style={twStyle("text-sm text-green-600")}>{formatCurrency(-(summary.baseDiscountAmt ?? 0), currency)}</Text>
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

      <ActionButton
        label={isRecurring ? "Confirm & Create Series" : "Confirm & Create Booking"}
        onPress={onConfirm}
        loading={creating}
        fullWidth
        size="lg"
        variant="brand"
      />
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
