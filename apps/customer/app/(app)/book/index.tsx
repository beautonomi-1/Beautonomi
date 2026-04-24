import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  Modal,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, Stack, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { useSelectedAddress } from "@/providers/SelectedAddressProvider";
import { api } from "@/lib/api-client";
import { useLocation } from "@/hooks/useLocation";
import { useAddresses, type SavedAddress } from "@/hooks/useAddresses";
import { AddressPicker } from "@/components/AddressPicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { useTranslation } from "@beautonomi/i18n";
import { APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";
import { haptic } from "@/lib/haptics";
import { getApiErrorMessage } from "@/lib/api-error";
import { getDeviceRegionCountryIso } from "@/lib/device-default-country-dial";
import { trackBookingStarted, trackBookingHoldCreated } from "@/lib/analytics";
import {
  buildRetailCartRowsFromPublicPackage,
  cartMatchesPublicCatalogPackage,
  coerceSelectedDate,
  flattenProviderServicesToMenu,
  formatLocalDateYYYYMMDD,
  isPublicStaffIdForBooking,
  mergeExpressProductCartLines,
  resolvePackageOfferingsFromFlatMenu,
  toIsoUtcTimestamp,
  type PublicProductCatalogRow,
} from "@beautonomi/utils";
import {
  getPendingExcludeHoldId,
  setPendingExcludeHoldId,
} from "@/lib/booking-flow-hold";
import { getGuestFingerprintHash } from "@/lib/guest-fingerprint";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { getTenantLocaleTag } from "@/lib/locale";
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

type TravelFeePreview =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; travelFee: number; distanceKm?: number; travelTimeMinutes?: number }
  | { status: "error"; reason: string; distanceKm?: number };

export interface SelectedServiceItem {
  offeringId: string;
  title: string;
  duration_minutes: number;
  /** Per-offering buffer; aligns with web `slotParams` for `/availability`. */
  buffer_minutes?: number;
  price: number;
  currency: string;
  /** When false, at-home booking is not allowed for this line. */
  supports_at_home?: boolean;
}

const STEP_LABEL_KEYS: Record<Step, string> = {
  service: "booking.stepService",
  venue: "booking.stepVenue",
  staff: "booking.stepStaff",
  date: "booking.stepDate",
  time: "booking.stepTime",
  addons: "booking.stepExtras",
};

function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Default buffer after the last service segment; matches web booking when variant buffer is unknown. */
const DEFAULT_SLOT_BUFFER_MINUTES = 15;

/** Mirrors web `OnlineBookingFlowNew` `slotParams`: total span = Σ(duration + buffer) per line; API gets duration + last buffer. */
function buildSlotParamsFromSelectedServices(items: SelectedServiceItem[]): {
  durationMinutes: number;
  bufferMinutes: number;
} {
  if (items.length === 0) {
    return { durationMinutes: 60, bufferMinutes: DEFAULT_SLOT_BUFFER_MINUTES };
  }
  if (items.length === 1) {
    const buf = items[0].buffer_minutes ?? DEFAULT_SLOT_BUFFER_MINUTES;
    return { durationMinutes: items[0].duration_minutes || 60, bufferMinutes: buf };
  }
  let primarySpan = 0;
  for (const s of items) {
    const dur = s.duration_minutes || 60;
    const buf = s.buffer_minutes ?? DEFAULT_SLOT_BUFFER_MINUTES;
    primarySpan += dur + buf;
  }
  const lastBuf = items[items.length - 1].buffer_minutes ?? DEFAULT_SLOT_BUFFER_MINUTES;
  const durationMinutes = primarySpan - lastBuf;
  return {
    durationMinutes: durationMinutes > 0 ? durationMinutes : 60,
    bufferMinutes: lastBuf,
  };
}

function resolveOfferingBufferMinutes(svc: ProviderService, variantId?: string | null): number {
  const v = variantId ? svc.variants?.find((x) => x.id === variantId) : svc.variants?.[0];
  if (v?.buffer_minutes != null && Number.isFinite(v.buffer_minutes)) return Number(v.buffer_minutes);
  if (svc.buffer_minutes != null && Number.isFinite(svc.buffer_minutes)) return Number(svc.buffer_minutes);
  return DEFAULT_SLOT_BUFFER_MINUTES;
}

/** Public availability + holds: matches web `staff_id=any` / null DB staff. */
const ANY_STAFF_BOOKING_ID = "any";

function staffIdForPublicAvailabilityApi(sel: StaffMember | null): string | null {
  if (!sel) return null;
  return sel.id === ANY_STAFF_BOOKING_ID ? "any" : sel.id;
}

/** Prefer the staff the availability API attached to the slot ("any staff" union); matches web booking. */
function holdStaffIdFromSlotAndSelection(
  sel: StaffMember | null,
  slot: AvailabilitySlot | null
): string | null {
  const raw =
    slot?.staff_id ?? (sel && sel.id !== ANY_STAFF_BOOKING_ID ? sel.id : null);
  if (!raw || raw === "any" || String(raw).startsWith("provider-")) return null;
  return raw;
}

/** Same idea as web booking service step — chunk long lists per category. */
const SERVICE_PAGE_SIZE_MOBILE = 32;
const MANY_SERVICES_IN_CATEGORY = 12;
const MANY_CATEGORIES = 10;

function serviceMatchesSearchFilter(svc: ProviderService, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (svc.title?.toLowerCase().includes(q)) return true;
  return Boolean(
    svc.variants?.some((v) =>
      (v.title || v.variant_name || "").toLowerCase().includes(q),
    ),
  );
}

/** Ensure pre-selected base or variant row is inside the first visible page (or expanded page). */
function minVisibleCountForOffering(services: ProviderService[], offeringId: string, pageSize: number): number {
  const list = services ?? [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.id === offeringId) return Math.min(list.length, Math.max(pageSize, i + 6));
    if (s.variants?.some((v) => v.id === offeringId)) return Math.min(list.length, Math.max(pageSize, i + 6));
  }
  return pageSize;
}

const CAL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const CAL_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Matches web `StepSchedule`: respect provider min notice (lead time) on every calendar day. */
function isSlotStartStillSelectable(startIso: string, day: Date, minNoticeMinutes: number): boolean {
  const slotTime = new Date(startIso);
  const now = new Date();
  const dayStart = startOfLocalDay(day).getTime();
  const todayStart = startOfLocalDay(now).getTime();
  if (dayStart < todayStart) return false;
  const safeNotice = Number.isFinite(minNoticeMinutes) && minNoticeMinutes >= 0 ? minNoticeMinutes : 60;
  const cutoff = now.getTime() + safeNotice * 60 * 1000;
  return slotTime.getTime() >= cutoff;
}

function daysBetweenCalendar(a: Date, b: Date): number {
  const as = startOfLocalDay(a).getTime();
  const bs = startOfLocalDay(b).getTime();
  return Math.round((bs - as) / (24 * 60 * 60 * 1000));
}

/** Same encoding as web express redirect: URL-encoded JSON `[{ product_id, quantity, product_variant_id? }]`. */
function parseExpressProductCartParam(s: string | undefined): {
  product_id: string;
  quantity: number;
  product_variant_id?: string | null;
}[] {
  if (!s?.trim()) return [];
  try {
    const decoded = decodeURIComponent(s.trim());
    const arr = JSON.parse(decoded) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: { product_id: string; quantity: number; product_variant_id?: string | null }[] = [];
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const pid = typeof o.product_id === "string" ? o.product_id : null;
      const q = typeof o.quantity === "number" ? o.quantity : Number(o.quantity);
      if (!pid || !Number.isFinite(q) || q < 1) continue;
      const vid = o.product_variant_id;
      const variantPart =
        typeof vid === "string" ? { product_variant_id: vid } : vid === null ? { product_variant_id: null as string | null } : {};
      out.push({
        product_id: pid,
        quantity: Math.min(999, Math.floor(q)),
        ...variantPart,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function slotHourInTimeZone(value: string, timeZone?: string | null): number {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 12;
  if (timeZone) {
    try {
      const hour = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        hour12: false,
      }).formatToParts(parsed).find((p) => p.type === "hour")?.value;
      return Number(hour === "24" ? "0" : hour);
    } catch {
      // Fall through to device-local time if the provider timezone is invalid.
    }
  }
  return parsed.getHours();
}

function formatTimeSafe(value: unknown, timeZone?: string | null): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  // §UI-audit 2026-04: previously hardcoded to `en-US`, which surfaced
  // AM/PM time even for tenants that render 24-hour by default (e.g.
  // en-ZA). Use the same tenant-locale resolver as bookings.tsx.
  return parsed.toLocaleTimeString(getTenantLocaleTag(), {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
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
  const displayDuration = items
    ? (items.length > 1
        ? buildSlotParamsFromSelectedServices(items).durationMinutes
        : items.reduce((s, i) => s + i.duration_minutes, 0))
    : (variant?.duration_minutes ?? service?.duration_minutes);
  const currency = provider.currency ?? items?.[0]?.currency ?? getTenantDefaultCurrency();

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
function DateCell({ date, isSelected, isToday, disabled, onPress }: {
  date: Date;
  isSelected: boolean;
  isToday: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={{
        flex: 1,
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderRadius: 16,
        marginHorizontal: 2,
        backgroundColor: isSelected ? Colors.primary : isToday ? `${Colors.primary}12` : "transparent",
        shadowColor: isSelected ? Colors.primary : "transparent",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isSelected ? 0.35 : 0,
        shadowRadius: 8,
        elevation: isSelected ? 4 : 0,
        opacity: disabled ? 0.3 : 1,
        borderWidth: isToday && !isSelected ? 1.5 : 0,
        borderColor: isToday && !isSelected ? `${Colors.primary}40` : "transparent",
      }}
      accessibilityRole="button"
      accessibilityLabel={`Select ${date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
      accessibilityState={{ selected: isSelected, disabled: !!disabled }}
    >
      <Text style={{
        fontSize: 9,
        color: isSelected ? "rgba(255,255,255,0.75)" : "#9CA3AF",
        fontWeight: "700",
        letterSpacing: 0.5,
        textTransform: "uppercase",
        marginBottom: 3,
      }}>
        {dayNames[date.getDay()].slice(0, 3)}
      </Text>
      <Text style={{
        fontSize: 18,
        fontWeight: "800",
        color: isSelected ? "#fff" : isToday ? Colors.primary : "#111827",
        lineHeight: 22,
      }}>
        {date.getDate()}
      </Text>
      {isToday && !isSelected && (
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary, marginTop: 3 }} />
      )}
      {isSelected && (
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.6)", marginTop: 3 }} />
      )}
    </TouchableOpacity>
  );
}

/* ═══════════════════════════════════════════
   Main Screen
   ═══════════════════════════════════════════ */
export default function BookScreen() {
  useScreenTracking("Book");
  const { t } = useTranslation();
  // §UX-audit 2026-04: previously every sticky bottom bar and floating
  // header on this screen hard-coded `paddingBottom: 28` / `paddingTop: 52`,
  // so CTAs rendered under the home indicator on notched devices.
  const insets = useSafeAreaInsets();
  const anyStaffMember = useMemo<StaffMember>(
    () => ({
      id: ANY_STAFF_BOOKING_ID,
      name: t("booking.anyStaff"),
      role: t("booking.fastestAvailability"),
    }),
    [t]
  );
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(500, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};
  const {
    slug: slugParam,
    service_id,
    service_ids,
    /** Same comma-separated IDs as web `?services=` */
    services: servicesQueryParam,
    duration_minutes,
    reschedule_booking_id,
    campaign_id,
    provider_id,
    step: stepParam,
    location_type: locationTypeParam,
    location_id: locationIdParam,
    staff_id: staffIdParam,
    date: dateParam,
    addons: addonsParam,
    promo: promoParam,
    gift_card: giftCardParam,
    products: productsParam,
    package: packageParam,
    package_name: packageNameParam,
    package_price: packagePriceParam,
    package_currency: packageCurrencyParam,
    package_discount: packageDiscountParam,
    hold_id: holdIdParam,
  } = useLocalSearchParams<{
    slug: string | string[];
    service_id?: string;
    /** Comma-separated offering IDs (aligns with web `?services=` from express links) */
    service_ids?: string;
    services?: string;
    duration_minutes?: string;
    reschedule_booking_id?: string;
    campaign_id?: string;
    provider_id?: string;
    step?: string;
    location_type?: string;
    location_id?: string;
    staff_id?: string;
    date?: string;
    addons?: string;
    promo?: string;
    gift_card?: string;
    products?: string;
    /** `service_packages.id` — preselects bundle line items (same as web `?package=`) */
    package?: string | string[];
    /** Display name of the package — prefilled from partner-profile nav params */
    package_name?: string;
    /** Package price as string — prefilled from partner-profile nav params */
    package_price?: string;
    /** Package currency — prefilled from partner-profile nav params */
    package_currency?: string;
    /** Package discount percentage as string — prefilled from partner-profile nav params */
    package_discount?: string;
    /** When returning from checkout to change time — exclude this hold from availability (same as web). */
    hold_id?: string | string[];
  }>();
  const slug =
    typeof slugParam === "string"
      ? slugParam
      : Array.isArray(slugParam)
        ? slugParam[0] ?? ""
        : "";
  const holdIdFromRoute =
    typeof holdIdParam === "string"
      ? holdIdParam.trim()
      : Array.isArray(holdIdParam)
        ? (holdIdParam[0]?.trim() ?? "")
        : "";
  const packageIdFromRoute =
    typeof packageParam === "string"
      ? packageParam
      : Array.isArray(packageParam)
        ? packageParam[0]
        : undefined;
  const { user } = useAuth();
  const { coords } = useLocation();
  const { selectedAddress: primaryAddress } = useSelectedAddress();
  const {
    addresses: savedAddresses,
    loading: savedAddressesLoading,
    error: savedAddressesError,
    reload: reloadSavedAddresses,
  } = useAddresses(!!user);

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
  const [atHomeAddress, setAtHomeAddress] = useState({
    line1: "",
    line2: "",
    city: "",
    country: getDeviceRegionCountryIso(),
    postal_code: "",
    apartment_unit: "",
    building_name: "",
    floor_number: "",
    gate_code: "",
    buzzer_code: "",
    door_code: "",
    parking_instructions: "",
    location_landmarks: "",
    house_call_instructions: "",
  });
  const [atHomeCoords, setAtHomeCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressPickerVisible, setAddressPickerVisible] = useState(false);
  const [travelFeePreview, setTravelFeePreview] = useState<TravelFeePreview>({ status: "idle" });
  const [selectedVariant, setSelectedVariant] = useState<{
    id: string; title?: string; duration_minutes: number; price: number; buffer_minutes?: number;
  } | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const selectedDay = useMemo(() => coerceSelectedDate(selectedDate), [selectedDate]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotLoadError, setSlotLoadError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const loadSlotsCounterRef = useRef(0);

  const [creatingHold, setCreatingHold] = useState(false);
  const [addonsList, setAddonsList] = useState<{ id: string; title?: string; name?: string; price: number; duration_minutes?: number; currency?: string; is_recommended?: boolean }[]>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [waitlistJoining, setWaitlistJoining] = useState(false);
  /** Category id -> true when collapsed (services hidden). Used on service step for long lists. */
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Record<string, boolean>>({});
  /** Service id -> true when variants are expanded (shown). Defaults open on first render, matching web. */
  const [expandedVariantSvcIds, setExpandedVariantSvcIds] = useState<Record<string, boolean>>({});
  /** Deep link / prefill: show this category first and keep it expanded (others collapsed). */
  const [pinnedCategoryId, setPinnedCategoryId] = useState<string | null>(null);
  /** Filter services by title / variant name within categories (large menus). */
  const [serviceFilterText, setServiceFilterText] = useState("");
  /** Filter category headers when provider has many categories. */
  const [categoryFilterText, setCategoryFilterText] = useState("");
  /** Per-category visible count for "Load more" (key = category id). */
  const [visibleLimitByCategoryId, setVisibleLimitByCategoryId] = useState<Record<string, number>>({});
  /** Set only when `?package=` prefill matched the API and the cart matches services + packaged retail (sent to checkout for `package_id`). */
  const [packageIdForCheckout, setPackageIdForCheckout] = useState<string | null>(null);
  /** Retail lines from mixed packages — merged into checkout product cart (parity with customer web). */
  const [selectedPackageProducts, setSelectedPackageProducts] = useState<
    { id: string; name: string; price: number; quantity: number; currency: string }[]
  >([]);
  /** Full package object for UI display — seeded from nav params immediately, enriched after API loads. */
  const [activePackage, setActivePackage] = useState<{
    id: string;
    name: string;
    price: number;
    currency: string;
    discount_percentage?: number | null;
  } | null>(
    packageIdFromRoute && packageNameParam
      ? {
          id: packageIdFromRoute,
          name: packageNameParam,
          price: parseFloat(packagePriceParam ?? "0") || 0,
          currency: packageCurrencyParam ?? "",
          discount_percentage: packageDiscountParam ? parseFloat(packageDiscountParam) : null,
        }
      : null
  );

  // Week navigation for date picker
  const [weekOffset, setWeekOffset] = useState(0);
  /** Mirrors web `/online-booking-settings` so slot API applies min notice & max advance. */
  const [onlineBookingSettings, setOnlineBookingSettings] = useState<{
    min_notice_minutes: number;
    max_advance_days: number;
  } | null>(null);
  const maxAdvanceDays = onlineBookingSettings?.max_advance_days ?? 90;
  const minNoticeMinutes = onlineBookingSettings?.min_notice_minutes ?? 60;

  const selectableSlots = useMemo(() => {
    if (!selectedDay) return [];
    return slots.filter(
      (s) =>
        s.is_available !== false &&
        isSlotStartStillSelectable(s.start, selectedDay, minNoticeMinutes),
    );
  }, [slots, selectedDay, minNoticeMinutes]);

  // All future slots (available + unavailable) — used for the time grid so customers
  // can see which times are blocked rather than having them silently disappear.
  const displaySlots = useMemo(() => {
    if (!selectedDay) return [];
    return slots.filter((s) => isSlotStartStillSelectable(s.start, selectedDay, minNoticeMinutes));
  }, [slots, selectedDay, minNoticeMinutes]);

  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const appliedPrefillAddonsRef = useRef(false);
  /** Public package shape from API — used with {@link cartMatchesPublicCatalogPackage} when `packageIdForCheckout` is set. */
  const resolvedPackageShapeRef = useRef<{
    items?: { type?: string; id?: string; quantity?: number }[];
    services?: { id: string }[];
  } | null>(null);
  const prevStepRef = useRef<Step | null>(null);
  /** Which time-of-day section is expanded (matches web collapsible groups). */
  const [openTimePeriod, setOpenTimePeriod] = useState<"Morning" | "Afternoon" | "Evening" | null>(null);
  /** Own active hold — exclude from GET …/availability so the chosen slot stays visible (web parity). */
  const [excludeHoldIdForSlots, setExcludeHoldIdForSlots] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      const fromStorage = await getPendingExcludeHoldId(slug);
      const next = (holdIdFromRoute || fromStorage) || null;
      if (!cancelled) setExcludeHoldIdForSlots(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, holdIdFromRoute]);

  /** Multi-staff: default to “any” (fastest slot) so date/time steps never run with a null selection. */
  useEffect(() => {
    if (step !== "staff") return;
    if (staff.length <= 1) return;
    if (selectedStaff != null) return;
    setSelectedStaff(anyStaffMember);
  }, [step, staff.length, selectedStaff, anyStaffMember]);

  /**
   * Tab-switch / app-background persistence.
   * We use a ref to snapshot the in-progress state, and restore from that
   * snapshot when the screen regains focus — so pressing Home, switching tabs,
   * or navigating away and back does not reset the flow.
   */
  const flowSnapshotRef = useRef<{
    step: Step;
    selectedServices: SelectedServiceItem[];
    selectedStaff: StaffMember | null;
    selectedDate: Date | null;
    selectedSlot: AvailabilitySlot | null;
    locationType: "at_salon" | "at_home";
  } | null>(null);

  // Save snapshot whenever key state changes
  useEffect(() => {
    // Only snapshot if we're past the initial load and have something worth saving
    if (!provider) return;
    flowSnapshotRef.current = {
      step,
      selectedServices,
      selectedStaff,
      selectedDate,
      selectedSlot,
      locationType,
    };
  });

  const visibleSteps = useMemo(() => {
    const steps: Step[] = ["service", "venue"];
    if (staff.length > 0) steps.push("staff");
    steps.push("date", "time", "addons");
    return steps;
  }, [staff.length]);

  const salonLocations = useMemo(
    () => (provider?.locations ?? []).filter((loc) => loc.location_type === "salon"),
    [provider?.locations],
  );

  const serviceMenuStats = useMemo(() => {
    const cats = servicesData?.categories ?? [];
    let total = 0;
    let maxInCat = 0;
    for (const c of cats) {
      const n = c.services?.length ?? 0;
      total += n;
      if (n > maxInCat) maxInCat = n;
    }
    return { total, maxInCat };
  }, [servicesData]);

  const categoriesOrdered = useMemo(() => {
    const cats = servicesData?.categories ?? [];
    if (!pinnedCategoryId || cats.length <= 1) return cats;
    const idx = cats.findIndex((c) => c.id === pinnedCategoryId);
    if (idx <= 0) return cats;
    const next = [...cats];
    const [pick] = next.splice(idx, 1);
    return [pick, ...next];
  }, [servicesData, pinnedCategoryId]);

  const displayCategories = useMemo(() => {
    const nCats = servicesData?.categories?.length ?? 0;
    let list = categoriesOrdered;
    const cq = categoryFilterText.trim().toLowerCase();
    if (cq && nCats >= MANY_CATEGORIES) {
      list = list.filter((c) => c.name.toLowerCase().includes(cq));
    }
    if (pinnedCategoryId && !list.some((c) => c.id === pinnedCategoryId)) {
      const pinned = categoriesOrdered.find((c) => c.id === pinnedCategoryId);
      if (pinned) list = [pinned, ...list];
    }
    return list;
  }, [categoriesOrdered, categoryFilterText, servicesData?.categories?.length, pinnedCategoryId]);

  const showServiceSearch =
    serviceMenuStats.total >= 28 || serviceMenuStats.maxInCat >= MANY_SERVICES_IN_CATEGORY;
  const showCategorySearch = (servicesData?.categories?.length ?? 0) >= MANY_CATEGORIES;

  /** Hide categories with zero search matches so list stays scannable. */
  const categoriesToRender = useMemo(() => {
    const q = serviceFilterText.trim();
    if (!q) return displayCategories;
    return displayCategories.filter((cat) =>
      (cat.services ?? []).some((s) => serviceMatchesSearchFilter(s, serviceFilterText)),
    );
  }, [displayCategories, serviceFilterText]);

  useEffect(() => {
    setVisibleLimitByCategoryId({});
  }, [serviceFilterText]);

  useEffect(() => {
    const q = serviceFilterText.trim();
    if (!q || !servicesData?.categories?.length) return;
    setCollapsedCategoryIds((prev) => {
      const next = { ...prev };
      for (const c of servicesData.categories) {
        const has = (c.services || []).some((s) => serviceMatchesSearchFilter(s, q));
        if (has) delete next[c.id];
      }
      return next;
    });
  }, [serviceFilterText, servicesData]);

  const loadProviderAndServices = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setPackageIdForCheckout(null);
    setSelectedPackageProducts([]);
    resolvedPackageShapeRef.current = null;
    setPinnedCategoryId(null);
    setServiceFilterText("");
    setCategoryFilterText("");
    setVisibleLimitByCategoryId({});
    try {
      const [provRes, svcRes, staffRes, obRes, pkRes, prodRes] = await Promise.all([
        api.get<PublicProviderDetail>(`/api/public/providers/${encodeURIComponent(slug)}`),
        api.get<ProviderServicesResponse>(`/api/public/providers/${encodeURIComponent(slug)}/services`),
        api.get<StaffMember[] | { data: StaffMember[] }>(`/api/public/providers/${encodeURIComponent(slug)}/staff`),
        api.get<{ min_notice_minutes?: number; max_advance_days?: number }>(
          `/api/public/providers/${encodeURIComponent(slug)}/online-booking-settings`
        ),
        api.get<{ data?: unknown } | unknown[]>(`/api/public/providers/${encodeURIComponent(slug)}/packages`),
        api.get<unknown>(`/api/public/providers/${encodeURIComponent(slug)}/products`).catch(() => ({ error: true, data: null })),
      ]);

      if (provRes.error || !provRes.data) {
        setError(provRes.error?.message || t("booking.providerNotFound"));
      } else {
        setProvider(provRes.data);
        const locs = provRes.data.locations || [];
        const salonLocs = locs.filter((loc) => loc.location_type === "salon");
        const wantsAtHome = locationTypeParam === "at_home";

        if (wantsAtHome) {
          setLocationType("at_home");
          setSelectedLocation(null);
        } else if (salonLocs.length === 0) {
          setLocationType("at_home");
          setSelectedLocation(null);
        } else {
          setLocationType("at_salon");
          if (locationIdParam) {
            const match = salonLocs.find((l) => l.id === locationIdParam);
            if (match) setSelectedLocation(match);
            else if (salonLocs.length === 1) setSelectedLocation(salonLocs[0]);
          } else if (salonLocs.length === 1) {
            setSelectedLocation(salonLocs[0]);
          }
        }
      }

      if (!svcRes.error && svcRes.data) {
        setServicesData(svcRes.data);
        const flat: ProviderService[] = flattenProviderServicesToMenu(
          (svcRes.data as ProviderServicesResponse).categories
        ) as ProviderService[];

        const applyMultiFromIds = (
          rawIds: string[],
          mode: "strict" | "skip"
        ): SelectedServiceItem[] | null => {
          const ids = rawIds.map((x) => x.trim()).filter(Boolean);
          if (ids.length === 0) return null;
          const resolved = resolvePackageOfferingsFromFlatMenu(
            ids,
            flat,
            getTenantDefaultCurrency(),
            mode
          );
          if (!resolved?.length) return null;
          const entries: SelectedServiceItem[] = resolved.map((r) => ({
            offeringId: r.offeringId,
            title: r.title,
            duration_minutes: r.duration_minutes,
            buffer_minutes: r.buffer_minutes,
            price: r.price,
            currency: r.currency,
          }));
          setSelectedServices(entries);
          const firstOfferingId = entries[0].offeringId;
          const firstSvc = flat.find(
            (s) => s.id === firstOfferingId || s.variants?.some((vv) => vv.id === firstOfferingId),
          );
          if (firstSvc) {
            setSelectedService(firstSvc);
            const fv =
              firstSvc.variants?.find((vv) => vv.id === firstOfferingId) ?? firstSvc.variants?.[0];
            if (fv) setSelectedVariant(fv);
          }
          return entries;
        };

        // Pin matching category, collapse others, expand variant rows, ensure visible slice (web parity).
        const autoExpandPreselectedCategory = (
          entries: SelectedServiceItem[],
          categories: ProviderServicesResponse["categories"],
        ) => {
          if (!entries.length) return;
          const firstId = entries[0].offeringId;
          const matchingCat = categories.find((c) =>
            c.services?.some((s) => s.id === firstId || s.variants?.some((v) => v.id === firstId))
          );
          if (!matchingCat) return;

          setPinnedCategoryId(matchingCat.id);

          if (categories.length > 1) {
            const collapsed: Record<string, boolean> = {};
            for (const cat of categories) {
              if (cat.id !== matchingCat.id) collapsed[cat.id] = true;
            }
            setCollapsedCategoryIds(collapsed);
          }

          const catServices = matchingCat.services ?? [];
          const minVis = minVisibleCountForOffering(catServices, firstId, SERVICE_PAGE_SIZE_MOBILE);
          setVisibleLimitByCategoryId({ [matchingCat.id]: minVis });

          for (const s of catServices) {
            if (s.variants?.some((v) => v.id === firstId)) {
              setExpandedVariantSvcIds((prev) => ({ ...prev, [s.id]: true }));
              break;
            }
          }
        };

        const multiSource = (service_ids?.trim() || servicesQueryParam?.trim()) ?? "";
        if (multiSource) {
          const entries = applyMultiFromIds(multiSource.split(","), "skip");
          if (entries) autoExpandPreselectedCategory(entries, (svcRes.data as ProviderServicesResponse).categories);
        } else if (service_id) {
          const entries = applyMultiFromIds([service_id], "strict");
          if (entries) autoExpandPreselectedCategory(entries, (svcRes.data as ProviderServicesResponse).categories);
        } else if (packageIdFromRoute?.trim() && !pkRes.error && pkRes.data != null) {
          const raw = pkRes.data as { data?: unknown } | unknown;
          const inner =
            raw && typeof raw === "object" && "data" in raw && !Array.isArray(raw)
              ? (raw as { data: unknown }).data
              : raw;
          const arr = Array.isArray(inner) ? inner : [];
          const pkgId = packageIdFromRoute.trim();
          const pkg = arr.find((p: { id?: string }) => p && typeof p === "object" && (p as { id?: string }).id === pkgId) as
            | {
                id: string;
                name?: string;
                price?: number;
                currency?: string;
                discount_percentage?: number | null;
                services?: { id: string }[];
                items?: { type?: string; id?: string }[];
              }
            | undefined;
          if (pkg) {
            const svcItems =
              pkg.services && pkg.services.length > 0
                ? pkg.services
                : (pkg.items ?? []).filter((x) => x.type === "service" || !x.type);
            const ids = svcItems.map((it) => it.id).filter(Boolean) as string[];
            const applied = applyMultiFromIds(ids, "strict");
            if (applied) {
              const rawProd = !prodRes.error && prodRes.data != null ? prodRes.data : [];
              const prodList = Array.isArray(rawProd) ? rawProd : [];
              const retail = buildRetailCartRowsFromPublicPackage(
                pkg as { items?: { type?: string; id?: string; quantity?: number }[] },
                prodList as PublicProductCatalogRow[],
                applied[0]?.currency ?? getTenantDefaultCurrency()
              );
              const shape = { items: pkg.items, services: pkg.services };
              resolvedPackageShapeRef.current = shape;
              setSelectedPackageProducts(retail);
              const bundleOk = cartMatchesPublicCatalogPackage(
                applied.map((s) => s.offeringId),
                retail.map((r) => ({ id: r.id, quantity: r.quantity })),
                shape
              );
              if (bundleOk) {
                setPackageIdForCheckout(pkgId);
                autoExpandPreselectedCategory(applied, (svcRes.data as ProviderServicesResponse).categories);
                setActivePackage({
                  id: pkgId,
                  name: pkg.name ?? packageNameParam ?? "",
                  price: pkg.price ?? parseFloat(packagePriceParam ?? "0") ?? 0,
                  currency: pkg.currency ?? packageCurrencyParam ?? "",
                  discount_percentage: pkg.discount_percentage ?? (packageDiscountParam ? parseFloat(packageDiscountParam) : null),
                });
              } else {
                resolvedPackageShapeRef.current = null;
                setSelectedPackageProducts([]);
                setPackageIdForCheckout(null);
                setActivePackage(null);
              }
            }
          }
        }
      }

      const staffRaw = staffRes.data;
      const staffList: StaffMember[] = Array.isArray(staffRaw) ? staffRaw : (staffRaw as { data: StaffMember[] })?.data || [];
      setStaff(staffList);
      if (staffIdParam) {
        const pick = staffList.find((m) => m.id === staffIdParam);
        if (pick) setSelectedStaff(pick);
        else if (staffList.length === 1) setSelectedStaff(staffList[0]);
      } else if (staffList.length === 1) {
        setSelectedStaff(staffList[0]);
      }

      /* api client unwraps JSON `data` — settings object is obRes.data directly */
      const merged = !obRes.error && obRes.data
        ? (obRes.data as { min_notice_minutes?: number; max_advance_days?: number })
        : null;
      setOnlineBookingSettings(
        merged
          ? {
              min_notice_minutes: merged.min_notice_minutes ?? 60,
              max_advance_days: merged.max_advance_days ?? 90,
            }
          : { min_notice_minutes: 60, max_advance_days: 90 },
      );
    } catch (e) {
      setError(getApiErrorMessage(e, t("booking.failedToLoad")));
      setOnlineBookingSettings({ min_notice_minutes: 60, max_advance_days: 90 });
    } finally {
      setLoading(false);
    }
  }, [
    slug,
    service_id,
    service_ids,
    servicesQueryParam,
    packageIdFromRoute,
    packageNameParam,
    packagePriceParam,
    packageCurrencyParam,
    packageDiscountParam,
    locationTypeParam,
    locationIdParam,
    staffIdParam,
    t,
  ]);

  useEffect(() => { loadProviderAndServices(); }, [loadProviderAndServices]);

  useEffect(() => {
    if (!packageIdForCheckout) return;
    const shape = resolvedPackageShapeRef.current;
    if (!shape) return;
    const ok = cartMatchesPublicCatalogPackage(
      selectedServices.map((s) => s.offeringId),
      selectedPackageProducts.map((p) => ({ id: p.id, quantity: p.quantity })),
      shape
    );
    if (!ok) {
      resolvedPackageShapeRef.current = null;
      setPackageIdForCheckout(null);
      setActivePackage(null);
      setSelectedPackageProducts([]);
    }
  }, [selectedServices, selectedPackageProducts, packageIdForCheckout]);

  // Auto-advance past the service step when a package has been fully preloaded —
  // the user's intent (book this package) is already clear, no need to linger on service selection.
  useEffect(() => {
    if (!loading && packageIdForCheckout && activePackage && selectedServices.length > 0 && step === "service") {
      setStep("venue");
    }
  }, [loading, packageIdForCheckout, activePackage, selectedServices.length, step]);

  useEffect(() => {
    if (!dateParam?.trim()) return;
    const d = coerceSelectedDate(dateParam.trim());
    if (d) setSelectedDate(d);
  }, [dateParam]);

  useEffect(() => {
    if (selectedLocation && !salonLocations.some((loc) => loc.id === selectedLocation.id)) {
      setSelectedLocation(null);
    }
  }, [salonLocations, selectedLocation]);

  const bookingStartedProviderId = provider?.id;
  const bookingStartedBusinessName = provider?.business_name ?? "";
  useEffect(() => {
    if (!bookingStartedProviderId) return;
    trackBookingStarted(bookingStartedProviderId, bookingStartedBusinessName);
  }, [bookingStartedProviderId, bookingStartedBusinessName]);

  // Sum duration of all selected add-ons to include in slot requests
  const selectedAddonDuration = useMemo(
    () =>
      selectedAddonIds.reduce((sum, addonId) => {
        const ao = addonsList.find((a) => a.id === addonId);
        return sum + (ao?.duration_minutes || 0);
      }, 0),
    [selectedAddonIds, addonsList]
  );

  const effectiveDuration =
    (selectedServices.length > 0
      ? selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0)
      : selectedVariant
      ? selectedVariant.duration_minutes
      : selectedService
      ? selectedService.variants?.[0]?.duration_minutes ?? selectedService.duration_minutes
      : parseInt(duration_minutes || "60", 10)) + selectedAddonDuration;

  const slotParams = useMemo(() => {
    if (selectedServices.length > 0) {
      const base = buildSlotParamsFromSelectedServices(selectedServices);
      return { ...base, durationMinutes: base.durationMinutes + selectedAddonDuration };
    }
    if (!selectedService) {
      const dur = parseInt(duration_minutes || "60", 10);
      return {
        durationMinutes: (Number.isFinite(dur) && dur > 0 ? dur : 60) + selectedAddonDuration,
        bufferMinutes: DEFAULT_SLOT_BUFFER_MINUTES,
      };
    }
    const dur =
      selectedVariant?.duration_minutes ??
      selectedService.variants?.[0]?.duration_minutes ??
      selectedService.duration_minutes ??
      60;
    const buf = selectedVariant
      ? resolveOfferingBufferMinutes(selectedService, selectedVariant.id)
      : resolveOfferingBufferMinutes(selectedService, null);
    return { durationMinutes: (dur || 60) + selectedAddonDuration, bufferMinutes: buf };
  }, [selectedServices, selectedVariant, selectedService, duration_minutes, selectedAddonDuration]);

  const effectiveOfferingId = selectedServices.length > 0
    ? selectedServices[0].offeringId
    : selectedVariant
      ? selectedVariant.id
      : selectedService
        ? selectedService.variants?.[0]?.id || selectedService.id
        : service_id;

  const { todayStart, lastSelectableDay, weekStart, weekDays, maxWeekOffset } = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const last = addDays(t, maxAdvanceDays);
    last.setHours(0, 0, 0, 0);
    const ws = addDays(t, weekOffset * 7);
    const rawDays = [...Array(7)].map((_, i) => addDays(ws, i));
    const days = rawDays.filter((d) => {
      const ds = startOfLocalDay(d);
      return ds.getTime() >= t.getTime() && ds.getTime() <= last.getTime();
    });
    const mwo = Math.max(0, Math.floor(maxAdvanceDays / 7));
    return { todayStart: t, lastSelectableDay: last, weekStart: ws, weekDays: days, maxWeekOffset: mwo };
  }, [weekOffset, maxAdvanceDays]);

  const loadSlots = useCallback(async () => {
    if (!slug || !effectiveOfferingId || !selectedDay || !selectedStaff) return;
    const requestId = ++loadSlotsCounterRef.current;
    setLoadingSlots(true);
    setSlotLoadError(null);
    try {
      const dateStr = formatLocalDateYYYYMMDD(selectedDay);
      const staffQ = staffIdForPublicAvailabilityApi(selectedStaff);
      if (!staffQ) return;
      const params = new URLSearchParams({
        date: dateStr,
        service_id: effectiveOfferingId,
        staff_id: staffQ,
        duration_minutes: String(slotParams.durationMinutes),
        buffer_minutes: String(slotParams.bufferMinutes),
        min_notice_minutes: String(minNoticeMinutes),
        max_advance_days: String(maxAdvanceDays),
      });
      if (locationType === "at_salon" && selectedLocation?.id) {
        params.set("location_id", selectedLocation.id);
      }
      if (selectedServices.length >= 2) {
        params.set("service_ids", selectedServices.map((s) => s.offeringId).join(","));
      }
      if (excludeHoldIdForSlots) {
        params.set("excludeHoldId", excludeHoldIdForSlots);
      }
      if (locationType === "at_home") {
        const dynamicTravel =
          travelFeePreview.status === "success"
            ? (travelFeePreview as { travelTimeMinutes?: number }).travelTimeMinutes
            : undefined;
        params.set("travel_buffer_minutes", String(dynamicTravel ? Math.ceil(dynamicTravel) : 30));
      }
      if (reschedule_booking_id) {
        params.set("exclude_booking_id", reschedule_booking_id);
      }
      const res = await api.get<{ slots?: AvailabilitySlot[]; data?: AvailabilitySlot[] }>(
        `/api/public/providers/${encodeURIComponent(slug)}/availability?${params}`
      );
      if (loadSlotsCounterRef.current !== requestId) return;
      if (res.error) {
        setSlotLoadError((res.error as { message?: string })?.message ?? "Failed to load available times");
        setSlots([]);
        return;
      }
      const data = (res.data ?? {}) as { slots?: AvailabilitySlot[]; data?: AvailabilitySlot[] };
      setSlots(data.slots ?? data.data ?? []);
      setSelectedSlot(null);
    } catch {
      if (loadSlotsCounterRef.current !== requestId) return;
      setSlotLoadError("Failed to load available times");
      setSlots([]);
    } finally {
      if (loadSlotsCounterRef.current === requestId) setLoadingSlots(false);
    }
  }, [
    slug,
    effectiveOfferingId,
    slotParams.durationMinutes,
    slotParams.bufferMinutes,
    selectedDay,
    selectedStaff,
    locationType,
    selectedLocation,
    minNoticeMinutes,
    maxAdvanceDays,
    selectedServices,
    excludeHoldIdForSlots,
    travelFeePreview,
    reschedule_booking_id,
  ]);

  // Restore snapshot and reload stale data when screen regains focus (handles tab switching)
  useFocusEffect(
    useCallback(() => {
      const snap = flowSnapshotRef.current;
      if (!snap || !provider) return;

      // Restore all key state from snapshot so navigating back to home tab and
      // returning to the booking flow preserves progress through the steps.
      setStep(snap.step);
      setSelectedServices(snap.selectedServices);
      setSelectedStaff(snap.selectedStaff);
      setSelectedDate(snap.selectedDate);
      setSelectedSlot(snap.selectedSlot);
      setLocationType(snap.locationType);

      // If the user is on the time step with a date but has no slots (e.g. the
      // background fetch timed out), trigger a reload immediately.
      if (snap.step === "time" && snap.selectedDate && !loadingSlots && slots.length === 0) {
        loadSlots();
      }
    }, [provider, loadingSlots, slots.length, loadSlots])
  );

  useEffect(() => {
    if (!selectedSlot || !selectedDay) return;
    if (isSlotStartStillSelectable(selectedSlot.start, selectedDay, minNoticeMinutes)) return;
    setSelectedSlot(null);
  }, [selectedSlot, selectedDay, slots, minNoticeMinutes]);

  useEffect(() => {
    const getPeriod = (iso: string) => {
      const h = slotHourInTimeZone(iso, provider?.timezone ?? null);
      if (h < 12) return "Morning";
      if (h < 17) return "Afternoon";
      return "Evening";
    };
    const byPeriod: Record<"Morning" | "Afternoon" | "Evening", AvailabilitySlot[]> = {
      Morning: [],
      Afternoon: [],
      Evening: [],
    };
    selectableSlots.forEach((s) => {
      byPeriod[getPeriod(s.start)].push(s);
    });
    const first: "Morning" | "Afternoon" | "Evening" | null =
      byPeriod.Morning.length > 0
        ? "Morning"
        : byPeriod.Afternoon.length > 0
          ? "Afternoon"
          : byPeriod.Evening.length > 0
            ? "Evening"
            : null;
    setOpenTimePeriod((prev) => {
      if (prev && byPeriod[prev].length > 0) return prev;
      return first;
    });
  }, [selectableSlots, provider?.timezone]);

  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = step;
    if (step !== "date") return;
    if (selectedDate != null) return;
    if (!slug || !effectiveOfferingId || !selectedStaff) return;
    const enteredDate = prev !== "date";
    if (!enteredDate) return;

    let cancelled = false;
    (async () => {
      const now = new Date();
      for (let offset = 0; offset < Math.min(14, maxAdvanceDays); offset++) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + offset);
        const dateStr = formatLocalDateYYYYMMDD(d);
        const staffQ = staffIdForPublicAvailabilityApi(selectedStaff);
        if (!staffQ) return;
        const params = new URLSearchParams({
          date: dateStr,
          service_id: effectiveOfferingId,
          staff_id: staffQ,
          duration_minutes: String(slotParams.durationMinutes),
          buffer_minutes: String(slotParams.bufferMinutes),
          min_notice_minutes: String(minNoticeMinutes),
          max_advance_days: String(maxAdvanceDays),
        });
        if (locationType === "at_salon" && selectedLocation?.id) {
          params.set("location_id", selectedLocation.id);
        }
        if (selectedServices.length >= 2) {
          params.set("service_ids", selectedServices.map((s) => s.offeringId).join(","));
        }
        if (excludeHoldIdForSlots) {
          params.set("excludeHoldId", excludeHoldIdForSlots);
        }
        if (locationType === "at_home") {
          params.set("travel_buffer_minutes", "30");
        }
        if (reschedule_booking_id) {
          params.set("exclude_booking_id", reschedule_booking_id);
        }
        try {
          const res = await api.get<{ slots?: AvailabilitySlot[]; data?: AvailabilitySlot[] }>(
            `/api/public/providers/${encodeURIComponent(slug)}/availability?${params}`
          );
          if (cancelled) return;
          const data = (res.data ?? {}) as { slots?: AvailabilitySlot[]; data?: AvailabilitySlot[] };
          const list = data.slots ?? data.data ?? [];
          const isToday = offset === 0;
          const hasBookable = list.some((s) => {
            const start = s.start;
            if (!start) return false;
            if (s.is_available === false) return false;
            if (isToday) return new Date(start).getTime() > now.getTime();
            return true;
          });
          if (hasBookable) {
            setSelectedDate(d);
            return;
          }
        } catch {
          // try next day
        }
      }
      if (!cancelled) {
        const fallback = new Date();
        fallback.setHours(0, 0, 0, 0);
        setSelectedDate(fallback);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    step,
    selectedDate,
    slug,
    effectiveOfferingId,
    selectedStaff,
    slotParams.durationMinutes,
    slotParams.bufferMinutes,
    locationType,
    selectedLocation,
    minNoticeMinutes,
    maxAdvanceDays,
    selectedServices,
    excludeHoldIdForSlots,
    reschedule_booking_id,
  ]);

  const joinWaitlist = useCallback(async () => {
    if (!provider?.id || !selectedDay) return;
    const displayName =
      user?.user_metadata?.full_name ||
      [user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter(Boolean).join(" ") ||
      user?.email?.split("@")[0] ||
      "";
    if (!displayName.trim()) {
      Alert.alert(t("booking.waitlistNameRequired"), t("booking.waitlistNameRequiredMessage"));
      return;
    }
    setWaitlistJoining(true);
    try {
      const preferredDate = formatLocalDateYYYYMMDD(selectedDay);
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
      if (selectedStaff?.id && isPublicStaffIdForBooking(selectedStaff.id)) body.staff_id = selectedStaff.id;
      const res = await api.post<{ entry?: { id: string } }>("/api/public/waitlist", body);
      if (res.error) {
        const msg = (res.error as { message?: string })?.message || t("booking.couldNotJoinWaitlist");
        const code = (res.error as { code?: string })?.code;
        if (code === "FEATURE_DISABLED" || code === "NOT_FOUND") {
          Alert.alert(t("booking.waitlistNotAvailable"), t("booking.waitlistNotAvailableMessage"));
        } else if (code === "WAITLIST_FULL") {
          Alert.alert(t("booking.waitlistFull"), t("booking.waitlistFullMessage"));
        } else {
          Alert.alert(t("common.error"), msg);
        }
      } else {
        haptic.light();
        Alert.alert(
          t("booking.youreOnTheList"),
          t("booking.notifyWhenSlotOpens"),
          [
            { text: t("common.ok") },
            { text: t("booking.viewMyWaitlist"), onPress: () => router.push("/(app)/account-settings/waitlist") },
          ]
        );
      }
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : t("booking.couldNotJoinWaitlist"));
    } finally {
      setWaitlistJoining(false);
    }
  }, [provider?.id, selectedDay, user, effectiveOfferingId, selectedStaff?.id, t]);

  useEffect(() => {
    if (step === "time" && selectedDay && selectedStaff) loadSlots();
  }, [step, selectedDay, selectedStaff, loadSlots]);

  // Fetch addons for ALL selected services and union the results
  const allOfferingIds = useMemo(
    () => selectedServices.map((s) => s.offeringId).filter(Boolean),
    [selectedServices],
  );
  useEffect(() => {
    if (!slug || allOfferingIds.length === 0) {
      setAddonsList([]);
      return;
    }
    const wantPrefillAddons = Boolean(addonsParam?.trim());
    if (step !== "addons" && !wantPrefillAddons) {
      setAddonsList([]);
      return;
    }
    Promise.all(
      allOfferingIds.map((oid) =>
        api
          .get<any>(`/api/public/providers/${encodeURIComponent(slug)}/services/${oid}/addons`)
          .then((res) => {
            const data = (res.data ?? res) as any;
            const raw = data?.data?.all_addons ?? data?.all_addons ?? [];
            return Array.isArray(raw) ? raw : [];
          })
          .catch(() => [] as any[]),
      ),
    ).then((results) => {
      const seen = new Set<string>();
      const merged: typeof addonsList = [];
      for (const list of results) {
        for (const addon of list) {
          if (!seen.has(addon.id)) {
            seen.add(addon.id);
            merged.push(addon);
          }
        }
      }
      setAddonsList(merged);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, slug, allOfferingIds.join(","), addonsParam]);

  useEffect(() => {
    if (appliedPrefillAddonsRef.current) return;
    const raw = addonsParam?.trim();
    if (!raw || addonsList.length === 0) return;
    const want = raw.split(",").map((x) => x.trim()).filter(Boolean);
    const valid = want.filter((id) => addonsList.some((a) => a.id === id));
    if (valid.length === 0) return;
    appliedPrefillAddonsRef.current = true;
    setSelectedAddonIds(valid);
  }, [addonsParam, addonsList]);

  // Debounced travel fee preview when at-home address is entered
  const atHomeAddressString = useMemo(
    () =>
      [atHomeAddress.line1.trim(), atHomeAddress.city.trim(), atHomeAddress.country].filter(Boolean).join(", ") || "",
    [atHomeAddress.line1, atHomeAddress.city, atHomeAddress.country]
  );
  useEffect(() => {
    if (locationType !== "at_home" || !provider) {
      setTravelFeePreview({ status: "idle" });
      return;
    }
    if (!atHomeAddress.line1.trim() || !atHomeAddress.city.trim()) {
      setTravelFeePreview({ status: "idle" });
      return;
    }
    setTravelFeePreview({ status: "loading" });
    const timeoutId = setTimeout(async () => {
      const address = atHomeAddressString || [atHomeAddress.line1, atHomeAddress.city, atHomeAddress.country].filter(Boolean).join(", ");
      if (!address) {
        setTravelFeePreview({ status: "idle" });
        return;
      }
      const res = await api.post<{
        valid?: boolean;
        travelFee?: number;
        distanceKm?: number;
        travelTimeMinutes?: number;
        reason?: string;
      }>("/api/location/validate", {
        address,
        provider_id: provider.id,
        latitude: atHomeCoords?.latitude,
        longitude: atHomeCoords?.longitude,
      });
      const data = res.data as { valid?: boolean; travelFee?: number; distanceKm?: number; travelTimeMinutes?: number; reason?: string } | undefined;
      if (res.error || !data) {
        setTravelFeePreview({
          status: "error",
          reason: (res.error as { message?: string })?.message ?? data?.reason ?? t("booking.travelFeePreview.errorGeneric"),
          distanceKm: data?.distanceKm,
        });
        return;
      }
      if (data.valid && typeof data.travelFee === "number") {
        setTravelFeePreview({
          status: "success",
          travelFee: data.travelFee,
          distanceKm: data.distanceKm,
          travelTimeMinutes: data.travelTimeMinutes,
        });
      } else {
        setTravelFeePreview({
          status: "error",
          reason: data.reason ?? t("booking.travelFeePreview.outsideServiceArea"),
          distanceKm: data.distanceKm,
        });
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [
    locationType,
    provider,
    atHomeAddressString,
    atHomeAddress.line1,
    atHomeAddress.city,
    atHomeAddress.country,
    atHomeCoords?.latitude,
    atHomeCoords?.longitude,
    t,
  ]);

  const createHold = useCallback(async () => {
    const servicesForHold = selectedServices.length > 0
      ? selectedServices
      : selectedService
        ? [
            {
              offeringId: effectiveOfferingId,
              title: selectedVariant?.title ?? selectedService.title ?? "",
              duration_minutes: effectiveDuration,
              buffer_minutes: selectedVariant
                ? resolveOfferingBufferMinutes(selectedService, selectedVariant.id)
                : resolveOfferingBufferMinutes(selectedService, null),
              price: selectedVariant?.price ?? selectedService.price ?? 0,
              currency: selectedService.currency ?? getTenantDefaultCurrency(),
            },
          ]
        : [];
    if (!provider || servicesForHold.length === 0) return;
    if (!selectedStaff) {
      Alert.alert("Select a stylist", "Please choose a staff member before continuing.");
      return;
    }
    if (!selectedSlot) {
      Alert.alert("Select a time", "Please pick an available time slot before continuing.");
      return;
    }
    setCreatingHold(true);
    try {
      const latLng = atHomeCoords;
      const address =
        locationType === "at_home"
          ? (() => {
              const ac: Record<string, string> = {};
              if (atHomeAddress.gate_code.trim()) ac.gate = atHomeAddress.gate_code.trim();
              if (atHomeAddress.buzzer_code.trim()) ac.buzzer = atHomeAddress.buzzer_code.trim();
              if (atHomeAddress.door_code.trim()) ac.door = atHomeAddress.door_code.trim();
              return {
                line1: atHomeAddress.line1.trim(),
                line2: atHomeAddress.line2.trim() || undefined,
                city: atHomeAddress.city.trim(),
                country: atHomeAddress.country,
                postal_code: atHomeAddress.postal_code.trim() || undefined,
                latitude: latLng?.latitude,
                longitude: latLng?.longitude,
                apartment_unit: atHomeAddress.apartment_unit.trim() || null,
                building_name: atHomeAddress.building_name.trim() || null,
                floor_number: atHomeAddress.floor_number.trim() || null,
                access_codes: Object.keys(ac).length > 0 ? ac : null,
                parking_instructions: atHomeAddress.parking_instructions.trim() || null,
                location_landmarks: atHomeAddress.location_landmarks.trim() || null,
              };
            })()
          : undefined;

      const startAt = toIsoUtcTimestamp(selectedSlot.start);
      const endAt = toIsoUtcTimestamp(selectedSlot.end);
      const holdStaffId = holdStaffIdFromSlotAndSelection(selectedStaff, selectedSlot);

      // Release any existing hold before creating a new one
      if (excludeHoldIdForSlots) {
        api.post(`/api/public/booking-holds/${excludeHoldIdForSlots}/release`, {}).catch((err) => {
          console.warn("Failed to release booking hold:", err);
        });
      }

      const fingerprint = await getGuestFingerprintHash();

      // §Final-audit 2026-04: forward the engine's `available_staff_ids`
      // when the slot came from an any-staff union so the hold resolver
      // prefers the exact staff the calendar surfaced. Mirrors the web
      // canonical flow (see apps/web/src/app/booking/components/booking-flow.tsx).
      const preferredStaffIds =
        selectedSlot?.available_staff_ids && selectedSlot.available_staff_ids.length > 0
          ? selectedSlot.available_staff_ids
          : null;

      // Wave 2.1 (audit 2026-04 final 100/100): UUIDv4 idempotency key per
      // user-initiated hold attempt. Any internal retry (network blip,
      // session refresh) re-sends the same key so the server returns the
      // cached response instead of creating a second hold and double-
      // contending the slot. Generate inline using crypto.randomUUID with
      // a Math.random fallback to avoid pulling a new dependency.
      const holdIdempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === "x" ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

      const res = await api.post<{ hold_id?: string; id?: string }>(
        "/api/public/booking-holds",
        {
          provider_id: provider.id,
          staff_id: holdStaffId,
          services: servicesForHold.map((s) => ({ offering_id: s.offeringId, staff_id: holdStaffId })),
          start_at: startAt,
          end_at: endAt,
          location_type: locationType,
          location_id: locationType === "at_salon" ? selectedLocation?.id : null,
          address,
          previous_hold_id: excludeHoldIdForSlots || null,
          guest_fingerprint_hash: fingerprint,
          preferred_staff_ids: preferredStaffIds,
          ...(packageIdForCheckout
            ? { package_id: packageIdForCheckout, primary_package_id: packageIdForCheckout }
            : {}),
        },
        {
          timeout: 120_000,
          headers: { "Idempotency-Key": holdIdempotencyKey },
        }
      );

      const holdData = (res.data ?? {}) as { hold_id?: string; id?: string };
      const holdId = holdData.hold_id ?? holdData.id;
      if (res.error || !holdId) {
        setError(getApiErrorMessage(res.error, t("booking.failedToReserveSlot")));
        return;
      }

      haptic.success();
      trackBookingHoldCreated(holdId);
      setExcludeHoldIdForSlots(holdId);
      await setPendingExcludeHoldId(holdId, slug);
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
      if (packageIdForCheckout) {
        params.package_id = packageIdForCheckout;
        params.primary_package_id = packageIdForCheckout;
      }
      await AsyncStorage.setItem("beautonomi_booking_addons", JSON.stringify(selectedAddonIds));
      if (promoParam?.trim()) {
        await AsyncStorage.setItem("beautonomi_booking_promotion_code", promoParam.trim());
        await AsyncStorage.setItem("beautonomi_booking_promotion_prefill", "1");
      }
      if (giftCardParam?.trim()) {
        await AsyncStorage.setItem("beautonomi_booking_gift_card_code", giftCardParam.trim());
      }
      const fromUrl = parseExpressProductCartParam(productsParam);
      const fromPackage = selectedPackageProducts.map((p) => {
        const colon = p.id.indexOf(":");
        const product_id = colon !== -1 ? p.id.slice(0, colon) : p.id;
        const vid = colon !== -1 ? p.id.slice(colon + 1) : undefined;
        return {
          product_id,
          quantity: p.quantity,
          ...(vid ? { product_variant_id: vid } : {}),
        };
      });
      const mergedLines = mergeExpressProductCartLines(fromUrl, fromPackage);
      if (mergedLines.length > 0) {
        await AsyncStorage.setItem("beautonomi_booking_product_cart", JSON.stringify(mergedLines));
      } else {
        await AsyncStorage.removeItem("beautonomi_booking_product_cart");
      }
      try {
        const hci = atHomeAddress.house_call_instructions.trim();
        if (hci) await AsyncStorage.setItem("beautonomi_booking_house_call_instructions", hci);
        else await AsyncStorage.removeItem("beautonomi_booking_house_call_instructions");
      } catch {
        // ignore
      }
      router.replace({ pathname: "/(app)/book-checkout", params });
    } catch (e) {
      setError(getApiErrorMessage(e as Error, t("booking.failedToCreateBooking")));
} finally {
    setCreatingHold(false);
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [provider, selectedService, selectedServices, selectedStaff, selectedSlot, locationType, atHomeAddress, atHomeCoords, effectiveOfferingId, effectiveDuration, selectedLocation, selectedVariant, reschedule_booking_id, campaign_id, provider_id, selectedAddonIds, promoParam, giftCardParam, productsParam, packageIdForCheckout, selectedPackageProducts, slug, t]);

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
          <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + 12, paddingHorizontal: contentPadding, paddingBottom: 12, backgroundColor: "#fff" }}>
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
            accessibilityLabel={t("common.retry")}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>{t("common.retry")}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (!provider || !servicesData) return null;

  const handleOpenCalendar = () => {
    setCalendarMonth(selectedDate ?? new Date());
    setCalendarModalVisible(true);
  };

  const handleCalendarSelectDay = (d: Date) => {
    const ds = startOfLocalDay(d);
    if (ds.getTime() < todayStart.getTime() || ds.getTime() > lastSelectableDay.getTime()) return;
    const diff = daysBetweenCalendar(todayStart, ds);
    setWeekOffset(Math.max(0, Math.floor(diff / 7)));
    setSelectedDate(d);
    setCalendarModalVisible(false);
    setStep("time");
    haptic.light();
  };

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIdx = calendarMonth.getMonth();
  const firstOfCalMonth = new Date(calendarYear, calendarMonthIdx, 1);
  const padStart = firstOfCalMonth.getDay();
  const daysInCalMonth = new Date(calendarYear, calendarMonthIdx + 1, 0).getDate();
  const calMonthCells: (Date | null)[] = [];
  for (let i = 0; i < padStart; i++) calMonthCells.push(null);
  for (let day = 1; day <= daysInCalMonth; day++) {
    calMonthCells.push(new Date(calendarYear, calendarMonthIdx, day));
  }

  const canGoCalPrev =
    calendarYear > todayStart.getFullYear() ||
    (calendarYear === todayStart.getFullYear() && calendarMonthIdx > todayStart.getMonth());
  const lastMonth = lastSelectableDay.getFullYear() * 12 + lastSelectableDay.getMonth();
  const curMonth = calendarYear * 12 + calendarMonthIdx;
  const canGoCalNext = curMonth < lastMonth;

  const tomorrow = addDays(todayStart, 1);
  const nextWeekStart = addDays(todayStart, 7);
  const chipTodayOk = todayStart.getTime() <= lastSelectableDay.getTime();
  const chipTomorrowOk = startOfLocalDay(tomorrow).getTime() <= lastSelectableDay.getTime();
  const chipNextWeekOk = startOfLocalDay(nextWeekStart).getTime() <= lastSelectableDay.getTime();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: "#fff" }} accessibilityLabel={t("booking.bookAppointment")} accessibilityRole="none">
        {/* ═══ Custom Header ═══ */}
        <View style={{
          flexDirection: "row", alignItems: "center", paddingTop: insets.top + 8, paddingHorizontal: contentPadding, paddingBottom: 8,
          backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#F3F4F6",
        }}>
          <TouchableOpacity
            onPress={goBack}
            style={{
              width: 38, height: 38, borderRadius: 19, backgroundColor: "#F3F4F6",
              alignItems: "center", justifyContent: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
          >
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>
              {activePackage ? activePackage.name : t("booking.bookAppointment")}
            </Text>
            {activePackage && (
              <Text style={{ fontSize: 12, color: "#16A34A", fontWeight: "600", marginTop: 1 }}>
                Package · {activePackage.currency} {activePackage.price.toFixed(2)}
              </Text>
            )}
          </View>
          <Text style={{ fontSize: 12, color: "#9CA3AF", fontWeight: "500" }}>
            {t(STEP_LABEL_KEYS[step])}
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

            {/* ── Step: Service (grouped by category, collapsible) ── */}
            {step === "service" && (
              <View>
                {activePackage ? (
                  /* ── Package mode: locked summary view ── */
                  <View>
                    {/* Package identity card */}
                    <View style={{
                      backgroundColor: "#F0FDF4", borderRadius: 16, borderWidth: 1.5,
                      borderColor: "#BBF7D0", padding: 16, marginBottom: 20,
                    }}>
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                        <Ionicons name="gift" size={18} color="#16A34A" style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#15803D", textTransform: "uppercase", letterSpacing: 0.8 }}>
                          Package
                        </Text>
                      </View>
                      <Text style={{ fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 6 }}>
                        {activePackage.name}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={{ fontSize: 17, fontWeight: "700", color: Colors.primary }}>
                          {activePackage.currency} {activePackage.price.toFixed(2)}
                        </Text>
                        {activePackage.discount_percentage != null && activePackage.discount_percentage > 0 && (
                          <Text style={{ fontSize: 13, fontWeight: "600", color: "#16A34A", marginLeft: 8 }}>
                            · Save {activePackage.discount_percentage}%
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Included services — locked, no remove button */}
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#374151", marginBottom: 10 }}>
                      What&apos;s included
                    </Text>
                    {selectedServices.map((item, idx) => (
                      <View
                        key={`${item.offeringId}-${idx}`}
                        style={{
                          flexDirection: "row", alignItems: "center",
                          paddingVertical: 12, paddingHorizontal: 14,
                          backgroundColor: "#fff", borderRadius: 12,
                          borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 8,
                        }}
                      >
                        <Ionicons name="checkmark-circle" size={18} color="#16A34A" style={{ marginRight: 10 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{item.title}</Text>
                          <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{item.duration_minutes} min</Text>
                        </View>
                      </View>
                    ))}
                    {selectedPackageProducts.length > 0 && (
                      <>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: "#374151", marginBottom: 10, marginTop: 16 }}>
                          Retail included
                        </Text>
                        {selectedPackageProducts.map((p) => (
                          <View
                            key={p.id}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              paddingVertical: 12,
                              paddingHorizontal: 14,
                              backgroundColor: "#fff",
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: "#E5E7EB",
                              marginBottom: 8,
                            }}
                          >
                            <Ionicons name="cube-outline" size={18} color="#6B7280" style={{ marginRight: 10 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{p.name}</Text>
                              <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                                ×{p.quantity} · {p.currency} {(p.price * p.quantity).toFixed(2)}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </>
                    )}
                  </View>
                ) : (
                  /* ── Regular mode: full editable service selection ── */
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 }}>Select service(s)</Text>
                    <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 12 }}>Tap a category to expand or collapse. Add one or more services for yourself or your group.</Text>
                    {selectedServices.length > 0 && (
                      <View style={{ marginBottom: 16, padding: 14, backgroundColor: "#F0FDF4", borderRadius: 12, borderWidth: 1, borderColor: "#BBF7D0" }}>
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
                {showCategorySearch && (servicesData?.categories?.length ?? 0) > 1 && (
                  <TextInput
                    value={categoryFilterText}
                    onChangeText={setCategoryFilterText}
                    placeholder={t("booking.filterCategoriesPlaceholder")}
                    style={{
                      borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                      fontSize: 15, color: "#111827", backgroundColor: "#fff", marginBottom: 12,
                    }}
                    placeholderTextColor="#9CA3AF"
                    accessibilityLabel={t("booking.filterCategoriesPlaceholder")}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                )}
                {showServiceSearch && (
                  <TextInput
                    value={serviceFilterText}
                    onChangeText={setServiceFilterText}
                    placeholder={t("booking.searchServicesPlaceholder")}
                    style={{
                      borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                      fontSize: 15, color: "#111827", backgroundColor: "#fff", marginBottom: 12,
                    }}
                    placeholderTextColor="#9CA3AF"
                    accessibilityLabel={t("booking.searchServicesPlaceholder")}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                )}
                {categoriesToRender.map((cat) => {
                  const rawServices = cat.services ?? [];
                  const filteredBySearch = rawServices.filter((s) => serviceMatchesSearchFilter(s, serviceFilterText));
                  const isCollapsed = !!collapsedCategoryIds[cat.id];
                  const serviceCount = serviceFilterText.trim() ? filteredBySearch.length : rawServices.length;
                  const limit = visibleLimitByCategoryId[cat.id] ?? SERVICE_PAGE_SIZE_MOBILE;
                  const visibleServices = filteredBySearch.slice(0, limit);
                  const hasMoreInCategory = filteredBySearch.length > limit;
                  const categoryColor = (cat.color && /^#?[0-9A-Fa-f]{6}$/.test(cat.color)) ? cat.color : Colors.primary;
                  return (
                    <View key={cat.id} style={{ marginBottom: 20 }}>
                      <Pressable
                        onPress={() => {
                          haptic.light();
                          setCollapsedCategoryIds((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }));
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          borderRadius: 12,
                          backgroundColor: "#F9FAFB",
                          borderLeftWidth: 4,
                          borderLeftColor: categoryColor,
                          marginBottom: 8,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${cat.name}, ${serviceCount} services, ${isCollapsed ? "Expand" : "Collapse"}`}
                        accessibilityState={{ expanded: !isCollapsed }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>{cat.name}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ fontSize: 13, color: "#6B7280", marginRight: 8 }}>{serviceCount} {serviceCount === 1 ? "service" : "services"}</Text>
                          <Ionicons name={isCollapsed ? "chevron-down" : "chevron-up"} size={20} color="#6B7280" />
                        </View>
                      </Pressable>
                      {!isCollapsed && visibleServices.map((svc) => {
                        const hasVariants = svc.has_variants && svc.variants && svc.variants.length > 0;
                        const currency = svc.currency ?? getTenantDefaultCurrency();
                        // Variants default to expanded (open) unless user has explicitly collapsed them
                        const variantsExpanded = expandedVariantSvcIds[svc.id] !== false;
                        const isAnyVariantSelected = hasVariants && svc.variants!.some(
                          (v) => selectedServices.some((s) => s.offeringId === v.id)
                        );
                        return (
                          <View key={svc.id} style={{ marginBottom: 6, marginLeft: 4 }}>
                            <Pressable
                              onPress={() => {
                                haptic.light();
                                if (hasVariants) {
                                  // Toggle variant expansion
                                  setExpandedVariantSvcIds((prev) => ({ ...prev, [svc.id]: !variantsExpanded }));
                                } else {
                                  setSelectedService(svc);
                                  setSelectedVariant(null);
                                  const offeringId = svc.id;
                                  const dur = svc.duration_minutes ?? 60;
                                  const price = svc.price ?? 0;
                                  const buf = resolveOfferingBufferMinutes(svc, null);
                                  setSelectedServices((prev) => [
                                    ...prev,
                                    { offeringId, title: svc.title ?? "", duration_minutes: dur, buffer_minutes: buf, price, currency },
                                  ]);
                                }
                              }}
                              style={{
                                flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                                paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12,
                                backgroundColor: isAnyVariantSelected ? "#F0FDF4" : "#fff",
                                borderWidth: 1,
                                borderColor: isAnyVariantSelected ? "#BBF7D0" : hasVariants ? "#E5E7EB" : "#E5E7EB",
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={
                                hasVariants
                                  ? `${svc.title}, ${svc.variants!.length} options, ${variantsExpanded ? "tap to hide" : "tap to show"}`
                                  : `Add ${svc.title}, ${svc.duration_minutes} minutes`
                              }
                              accessibilityState={hasVariants ? { expanded: variantsExpanded } : undefined}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontWeight: "600", color: "#111827", fontSize: 15 }}>{svc.title}</Text>
                                <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                                  {hasVariants
                                    ? `${svc.variants!.length} option${svc.variants!.length === 1 ? "" : "s"} · tap to ${variantsExpanded ? "hide" : "choose"}`
                                    : `${svc.duration_minutes} min · ${currency} ${svc.price.toFixed(2)}`}
                                </Text>
                              </View>
                              {!hasVariants && <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />}
                              {hasVariants && (
                                <Ionicons
                                  name={variantsExpanded ? "chevron-up" : "chevron-down"}
                                  size={20}
                                  color="#6B7280"
                                />
                              )}
                            </Pressable>
                            {hasVariants && variantsExpanded && (
                              <View style={{ paddingLeft: 8, marginTop: 6 }}>
                                {svc.variants!.map((v, vi) => {
                                  const isVariantSelected = selectedServices.some((s) => s.offeringId === v.id);
                                  return (
                                    <Pressable
                                      key={v.id}
                                      onPress={() => {
                                        haptic.light();
                                        setSelectedService(svc);
                                        setSelectedVariant(v);
                                        if (isVariantSelected) {
                                          // Deselect this variant
                                          setSelectedServices((prev) => prev.filter((s) => s.offeringId !== v.id));
                                        } else {
                                          setSelectedServices((prev) => [
                                            ...prev,
                                            {
                                              offeringId: v.id,
                                              title: v.title ?? svc.title ?? "",
                                              duration_minutes: v.duration_minutes,
                                              buffer_minutes: resolveOfferingBufferMinutes(svc, v.id),
                                              price: v.price,
                                              currency,
                                            },
                                          ]);
                                        }
                                      }}
                                      style={{
                                        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                                        borderRadius: 10, borderWidth: 2, paddingHorizontal: 14, paddingVertical: 12,
                                        backgroundColor: isVariantSelected ? Colors.primaryLight : "#F9FAFB",
                                        borderColor: isVariantSelected ? Colors.primary : "#E5E7EB",
                                        marginTop: vi === 0 ? 0 : 6,
                                      }}
                                      accessibilityRole="button"
                                      accessibilityLabel={`${isVariantSelected ? "Remove" : "Add"} ${v.title ?? svc.title} ${v.duration_minutes} minutes`}
                                      accessibilityState={{ selected: isVariantSelected }}
                                    >
                                      <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>
                                          {v.title || v.variant_name || `${v.duration_minutes} min`}
                                        </Text>
                                        <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{v.duration_minutes} min</Text>
                                      </View>
                                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                                        <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.primary, marginRight: 6 }}>
                                          {currency} {v.price.toFixed(2)}
                                        </Text>
                                        <Ionicons
                                          name={isVariantSelected ? "checkmark-circle" : "add-circle-outline"}
                                          size={20}
                                          color={isVariantSelected ? Colors.primary : Colors.primary}
                                        />
                                      </View>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        );
                      })}
                      {!isCollapsed && hasMoreInCategory && (
                        <TouchableOpacity
                          onPress={() => {
                            haptic.light();
                            setVisibleLimitByCategoryId((prev) => ({
                              ...prev,
                              [cat.id]: Math.min(
                                filteredBySearch.length,
                                (prev[cat.id] ?? SERVICE_PAGE_SIZE_MOBILE) + SERVICE_PAGE_SIZE_MOBILE,
                              ),
                            }));
                          }}
                          style={{ paddingVertical: 12, paddingHorizontal: 14, marginTop: 4, marginLeft: 4 }}
                          accessibilityRole="button"
                          accessibilityLabel={t("booking.loadMoreServices")}
                        >
                          <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.primary }}>
                            {t("booking.loadMoreServices")}
                          </Text>
                          <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                            {t("booking.servicesPaginationSummary", {
                              shown: visibleServices.length,
                              total: filteredBySearch.length,
                            })}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                  </View>
                )}
              </View>
            )}

            {/* ── Step: Venue ── */}
            {step === "venue" && (selectedService || selectedServices.length > 0) && (
              <View>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 }}>{t("booking.selectVenue")}</Text>
                {provider.supports_salon && (salonLocations.length ? (
                  (salonLocations.length === 1 ? (
                    <Pressable
                      onPress={() => {
                        haptic.light();
                        setLocationType("at_salon");
                        setSelectedLocation(salonLocations[0]!);
                        setStep(staff.length ? "staff" : "date");
                      }}
                      style={{
                        flexDirection: "row", alignItems: "center",
                        padding: contentPadding, borderRadius: 16, marginBottom: 10,
                        borderWidth: 1.5, borderColor: locationType === "at_salon" ? Colors.primary : "#E5E7EB",
                        backgroundColor: locationType === "at_salon" ? Colors.primaryLight : "#fff",
                      }}
                      accessibilityRole="button" accessibilityLabel={t("booking.atSalon")}
                    >
                      <View style={{
                        width: 48, height: 48, borderRadius: 12, backgroundColor: "#EDE9FE",
                        alignItems: "center", justifyContent: "center", marginRight: 14,
                      }}>
                        <Ionicons name="business-outline" size={24} color="#7C3AED" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "600", color: "#111827", fontSize: 15 }}>{t("booking.atSalon")}</Text>
                        <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{salonLocations[0]!.name}</Text>
                      </View>
                      {locationType === "at_salon" && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                    </Pressable>
                  ) : (
                    salonLocations.map((loc) => {
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
                          accessibilityLabel={`${t("booking.atSalon")} ${loc.name}`}
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
                    accessibilityRole="button" accessibilityLabel={t("booking.atSalon")}
                  >
                    <View style={{
                      width: 48, height: 48, borderRadius: 12, backgroundColor: "#EDE9FE",
                      alignItems: "center", justifyContent: "center", marginRight: 14,
                    }}>
                      <Ionicons name="business-outline" size={24} color="#7C3AED" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "600", color: "#111827", fontSize: 15 }}>{t("booking.atSalon")}</Text>
                    </View>
                    {locationType === "at_salon" && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                  </Pressable>
                ))}
                {provider.supports_house_calls && (selectedServices.length > 0 ? selectedServices.every((s) => s.supports_at_home !== false) : selectedService?.supports_at_home) && (
                  <Pressable
                    onPress={() => {
                      haptic.light();
                      setLocationType("at_home");
                      if (user) void reloadSavedAddresses();
                      if (primaryAddress) {
                        setAtHomeAddress({
                          line1: primaryAddress.displayName || primaryAddress.label || "",
                          line2: "",
                          city: "",
                          country: getDeviceRegionCountryIso(),
                          postal_code: "",
                          apartment_unit: "",
                          building_name: "",
                          floor_number: "",
                          gate_code: "",
                          buzzer_code: "",
                          door_code: "",
                          parking_instructions: "",
                          location_landmarks: "",
                          house_call_instructions: "",
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
                    accessibilityRole="button" accessibilityLabel={t("booking.atHome")}
                  >
                    <View style={{
                      width: 48, height: 48, borderRadius: 12, backgroundColor: "#ECFDF5",
                      alignItems: "center", justifyContent: "center", marginRight: 14,
                    }}>
                      <Ionicons name="home-outline" size={24} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "600", color: "#111827", fontSize: 15 }}>{t("booking.atHome")}</Text>
                      <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{t("booking.atHomeSubtitle")}</Text>
                    </View>
                    {locationType === "at_home" && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                  </Pressable>
                )}
                {locationType === "at_home" && (
                  <View style={{ marginTop: 8 }}>
                    {user && savedAddressesLoading && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <ActivityIndicator size="small" color={Colors.primary} />
                        <Text style={{ fontSize: 13, color: "#6B7280" }}>{t("booking.loadingSavedAddresses")}</Text>
                      </View>
                    )}
                    {user && savedAddressesError && !savedAddressesLoading && (
                      <View
                        style={{
                          marginBottom: 12,
                          padding: 12,
                          borderRadius: 12,
                          backgroundColor: "#FEF2F2",
                          borderWidth: 1,
                          borderColor: "#FECACA",
                        }}
                      >
                        <Text style={{ fontSize: 13, color: "#991B1B", marginBottom: 8 }}>{savedAddressesError}</Text>
                        <TouchableOpacity onPress={() => void reloadSavedAddresses()} accessibilityRole="button">
                          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>{t("common.retry")}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {user && savedAddresses.length > 0 && (
                      <View style={{ marginBottom: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: "#6B7280", marginBottom: 8 }}>{t("booking.savedAddresses")}</Text>
                        {savedAddresses.map((addr: SavedAddress) => {
                          const isSelected = atHomeAddress.line1 === addr.address_line1 && atHomeAddress.city === addr.city;
                          return (
                            <Pressable
                              key={addr.id}
                              onPress={() => {
                                haptic.light();
                                setAtHomeAddress((prev) => ({
                                  ...prev,
                                  line1: addr.address_line1,
                                  line2: addr.address_line2 ?? "",
                                  city: addr.city,
                                  country: addr.country || getDeviceRegionCountryIso(),
                                  postal_code: addr.postal_code ?? "",
                                }));
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
                          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.primary }}>{t("booking.enterDifferentAddress")}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {(!user || (!savedAddressesLoading && savedAddresses.length === 0)) && (
                      <TouchableOpacity
                        onPress={() => { haptic.light(); setAddressPickerVisible(true); }}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, marginBottom: 4, marginTop: 10 }}
                      >
                        <Ionicons name="location-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.primary }}>{t("booking.searchAddress")}</Text>
                      </TouchableOpacity>
                    )}
                    <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 10 }}>{t("booking.orEnterManually")}</Text>
                    <TextInput
                      placeholder={t("booking.streetAddress")}
                      value={atHomeAddress.line1}
                      onChangeText={(text) => { setAtHomeAddress((a) => ({ ...a, line1: text })); if (!atHomeCoords && coords) setAtHomeCoords({ latitude: coords.latitude, longitude: coords.longitude }); }}
                      style={{
                        borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: contentPadding, paddingVertical: 14,
                        fontSize: 15, color: "#111827", backgroundColor: "#F9FAFB", marginTop: 10,
                      }}
                      placeholderTextColor="#9CA3AF"
                      accessibilityLabel={t("booking.streetAddress")}
                    />
                    <TextInput
                      placeholder={t("booking.cityPlaceholder")}
                      value={atHomeAddress.city}
                      onChangeText={(text) => setAtHomeAddress((a) => ({ ...a, city: text }))}
                      style={{
                        borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: contentPadding, paddingVertical: 14,
                        fontSize: 15, color: "#111827", backgroundColor: "#F9FAFB", marginTop: 10,
                      }}
                      placeholderTextColor="#9CA3AF"
                      accessibilityLabel={t("booking.cityPlaceholder")}
                    />
                    <TextInput
                      placeholder={t("booking.postalCodePlaceholder")}
                      value={atHomeAddress.postal_code}
                      onChangeText={(text) => setAtHomeAddress((a) => ({ ...a, postal_code: text }))}
                      style={{
                        borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: contentPadding, paddingVertical: 14,
                        fontSize: 15, color: "#111827", backgroundColor: "#F9FAFB", marginTop: 10,
                      }}
                      placeholderTextColor="#9CA3AF"
                      accessibilityLabel={t("booking.postalCodePlaceholder")}
                    />
                    <View
                      style={{
                        marginTop: 16,
                        padding: contentPadding,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: "#BFDBFE",
                        backgroundColor: "#EFF6FF",
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E3A8A" }}>{t("booking.additionalLocationTitle")}</Text>
                      <Text style={{ fontSize: 12, color: "#1E40AF", marginTop: 4, marginBottom: 10 }}>{t("booking.additionalLocationSubtitle")}</Text>
                      <TextInput
                        placeholder={t("booking.apartmentUnit")}
                        value={atHomeAddress.apartment_unit}
                        onChangeText={(text) => setAtHomeAddress((a) => ({ ...a, apartment_unit: text }))}
                        style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff", marginBottom: 8 }}
                        placeholderTextColor="#9CA3AF"
                      />
                      <TextInput
                        placeholder={t("booking.buildingName")}
                        value={atHomeAddress.building_name}
                        onChangeText={(text) => setAtHomeAddress((a) => ({ ...a, building_name: text }))}
                        style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff", marginBottom: 8 }}
                        placeholderTextColor="#9CA3AF"
                      />
                      <TextInput
                        placeholder={t("booking.floorNumber")}
                        value={atHomeAddress.floor_number}
                        onChangeText={(text) => setAtHomeAddress((a) => ({ ...a, floor_number: text }))}
                        style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff", marginBottom: 8 }}
                        placeholderTextColor="#9CA3AF"
                      />
                      <TextInput
                        placeholder={t("booking.gateCode")}
                        value={atHomeAddress.gate_code}
                        onChangeText={(text) => setAtHomeAddress((a) => ({ ...a, gate_code: text }))}
                        style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff", marginBottom: 8 }}
                        placeholderTextColor="#9CA3AF"
                      />
                      <TextInput
                        placeholder={t("booking.buzzerCode")}
                        value={atHomeAddress.buzzer_code}
                        onChangeText={(text) => setAtHomeAddress((a) => ({ ...a, buzzer_code: text }))}
                        style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff", marginBottom: 8 }}
                        placeholderTextColor="#9CA3AF"
                      />
                      <TextInput
                        placeholder={t("booking.doorCode")}
                        value={atHomeAddress.door_code}
                        onChangeText={(text) => setAtHomeAddress((a) => ({ ...a, door_code: text }))}
                        style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff", marginBottom: 8 }}
                        placeholderTextColor="#9CA3AF"
                      />
                      <TextInput
                        placeholder={t("booking.parkingInstructions")}
                        value={atHomeAddress.parking_instructions}
                        onChangeText={(text) => setAtHomeAddress((a) => ({ ...a, parking_instructions: text }))}
                        multiline
                        style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff", marginBottom: 8, minHeight: 72, textAlignVertical: "top" }}
                        placeholderTextColor="#9CA3AF"
                      />
                      <TextInput
                        placeholder={t("booking.locationLandmarks")}
                        value={atHomeAddress.location_landmarks}
                        onChangeText={(text) => setAtHomeAddress((a) => ({ ...a, location_landmarks: text }))}
                        multiline
                        style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff", marginBottom: 8, minHeight: 72, textAlignVertical: "top" }}
                        placeholderTextColor="#9CA3AF"
                      />
                      <TextInput
                        placeholder={t("booking.houseCallInstructions")}
                        value={atHomeAddress.house_call_instructions}
                        onChangeText={(text) => setAtHomeAddress((a) => ({ ...a, house_call_instructions: text }))}
                        multiline
                        style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff", minHeight: 72, textAlignVertical: "top" }}
                        placeholderTextColor="#9CA3AF"
                      />
                    </View>
                    {/* Travel fee preview — shown when address is entered */}
                    {travelFeePreview.status !== "idle" && (
                      <View
                        style={{
                          marginTop: 16,
                          padding: contentPadding,
                          borderRadius: 16,
                          borderWidth: 1.5,
                          backgroundColor:
                            travelFeePreview.status === "error"
                              ? "#FEF3C7"
                              : travelFeePreview.status === "success"
                                ? Colors.primaryLight
                                : Colors.gray[50],
                          borderColor:
                            travelFeePreview.status === "error"
                              ? Colors.warning
                              : travelFeePreview.status === "success"
                                ? Colors.primary
                                : Colors.gray[200],
                        }}
                        accessibilityLabel={
                          travelFeePreview.status === "success"
                            ? `${t("booking.travelFeePreview.estimatedTravelFee")} ${provider?.currency ?? getTenantDefaultCurrency()} ${(travelFeePreview as { travelFee: number }).travelFee.toFixed(2)}`
                            : travelFeePreview.status === "error"
                              ? (travelFeePreview as { reason: string }).reason
                              : t("booking.travelFeePreview.loading")
                        }
                      >
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <View
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: 24,
                              backgroundColor:
                                travelFeePreview.status === "error"
                                  ? "#FDE68A"
                                  : travelFeePreview.status === "success"
                                    ? "rgba(255, 0, 119, 0.12)"
                                    : Colors.gray[200],
                              alignItems: "center",
                              justifyContent: "center",
                              marginRight: 14,
                            }}
                          >
                            {travelFeePreview.status === "loading" ? (
                              <ActivityIndicator size="small" color={Colors.primary} />
                            ) : (
                              <Ionicons
                                name={travelFeePreview.status === "error" ? "warning-outline" : "car-outline"}
                                size={24}
                                color={travelFeePreview.status === "error" ? Colors.warning : Colors.primary}
                              />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[600], marginBottom: 2 }}>
                              {t("booking.travelFeePreview.estimatedTravelFee")}
                            </Text>
                            {travelFeePreview.status === "loading" && (
                              <View style={{ height: 22, justifyContent: "center" }}>
                                <Skeleton width={80} height={18} borderRadius={6} />
                              </View>
                            )}
                            {travelFeePreview.status === "success" && (
                              <>
                                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>
                                  {provider?.currency ?? getTenantDefaultCurrency()} {(travelFeePreview as { travelFee: number }).travelFee.toFixed(2)}
                                </Text>
                                {((travelFeePreview as { distanceKm?: number; travelTimeMinutes?: number }).distanceKm != null ||
                                  (travelFeePreview as { travelTimeMinutes?: number }).travelTimeMinutes != null) && (
                                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>
                                    {(travelFeePreview as { distanceKm?: number }).distanceKm != null &&
                                      `About ${(travelFeePreview as { distanceKm: number }).distanceKm} km`}
                                    {(travelFeePreview as { distanceKm?: number }).distanceKm != null &&
                                      (travelFeePreview as { travelTimeMinutes?: number }).travelTimeMinutes != null &&
                                      " · "}
                                    {(travelFeePreview as { travelTimeMinutes?: number }).travelTimeMinutes != null &&
                                      `~${(travelFeePreview as { travelTimeMinutes: number }).travelTimeMinutes} min`}
                                  </Text>
                                )}
                              </>
                            )}
                            {travelFeePreview.status === "error" && (
                              <Text style={{ fontSize: 14, color: Colors.gray[700], lineHeight: 20 }}>
                                {(travelFeePreview as { reason: string }).reason}
                              </Text>
                            )}
                          </View>
                        </View>
                        {travelFeePreview.status === "success" && (
                          <Text style={{ fontSize: 11, color: Colors.gray[500], marginTop: 8 }}>
                            {t("booking.travelFeePreview.finalAmountAtCheckout")}
                          </Text>
                        )}
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => { haptic.medium(); setStep(staff.length ? "staff" : "date"); }}
                      disabled={!atHomeAddress.line1.trim() || !atHomeAddress.city.trim()}
                      style={{
                        backgroundColor: (!atHomeAddress.line1.trim() || !atHomeAddress.city.trim()) ? "#D1D5DB" : Colors.primary,
                        borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 10,
                      }}
                      accessibilityRole="button" accessibilityLabel={t("common.continue")}
                    >
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{t("common.continue")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── Step: Staff ── */}
            {step === "staff" && staff.length > 0 && (
              <View>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 }}>{t("booking.chooseProfessional")}</Text>
                {staff.length > 1 ? (
                  <Pressable
                    key="__any_staff__"
                    onPress={() => {
                      haptic.light();
                      setSelectedStaff(anyStaffMember);
                      setStep("date");
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 14,
                      borderRadius: 16,
                      marginBottom: 8,
                      borderWidth: 1.5,
                      borderColor: selectedStaff?.id === ANY_STAFF_BOOKING_ID ? Colors.primary : "#F3F4F6",
                      backgroundColor: selectedStaff?.id === ANY_STAFF_BOOKING_ID ? Colors.primaryLight : "#fff",
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("booking.anyStaff")}
                  >
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                      <Ionicons name="people-outline" size={22} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827" }}>{anyStaffMember.name}</Text>
                      {anyStaffMember.role ? (
                        <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{anyStaffMember.role}</Text>
                      ) : null}
                    </View>
                    {selectedStaff?.id === ANY_STAFF_BOOKING_ID ? (
                      <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                    ) : null}
                  </Pressable>
                ) : null}
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
                  accessibilityRole="button" accessibilityLabel={t("booking.bookInBrowser")}
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Book in Browser</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Step: Date ── */}
            {step === "date" && staff.length > 0 && (
              <View>
                {/* Header row */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 20, fontWeight: "800", color: "#111827", letterSpacing: -0.5 }}>
                      {t("booking.pickDate")}
                    </Text>
                    <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 3 }}>
                      {weekStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleOpenCalendar}
                    style={{
                      width: 44, height: 44, borderRadius: 14,
                      backgroundColor: `${Colors.primary}15`,
                      alignItems: "center", justifyContent: "center",
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("booking.openFullCalendar")}
                  >
                    <Ionicons name="calendar-outline" size={22} color={Colors.primary} />
                  </TouchableOpacity>
                </View>

                {/* Week navigation strip */}
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16, marginBottom: 4 }}>
                  <TouchableOpacity
                    onPress={() => { if (weekOffset > 0) { haptic.light(); setWeekOffset(weekOffset - 1); } }}
                    disabled={weekOffset === 0}
                    style={{
                      width: 40, height: 40, borderRadius: 12,
                      backgroundColor: weekOffset === 0 ? "#F3F4F6" : "#F0F0F5",
                      alignItems: "center", justifyContent: "center",
                    }}
                    accessibilityLabel={t("time.previousWeek")}
                  >
                    <Ionicons name="chevron-back" size={18} color={weekOffset === 0 ? "#D1D5DB" : "#374151"} />
                  </TouchableOpacity>

                  <View style={{ flex: 1, flexDirection: "row", marginHorizontal: 6 }}>
                    {weekDays.map((d) => (
                      <DateCell
                        key={d.toISOString()}
                        date={d}
                        isSelected={selectedDay ? isSameDay(d, selectedDay) : false}
                        isToday={isSameDay(d, todayStart)}
                        onPress={() => {
                          haptic.medium();
                          setSelectedDate(d);
                          setStep("time");
                        }}
                      />
                    ))}
                  </View>

                  <TouchableOpacity
                    onPress={() => { if (weekOffset < maxWeekOffset) { haptic.light(); setWeekOffset(weekOffset + 1); } }}
                    disabled={weekOffset >= maxWeekOffset}
                    style={{
                      width: 40, height: 40, borderRadius: 12,
                      backgroundColor: weekOffset >= maxWeekOffset ? "#F3F4F6" : "#F0F0F5",
                      alignItems: "center", justifyContent: "center",
                    }}
                    accessibilityLabel={t("time.nextWeek")}
                  >
                    <Ionicons name="chevron-forward" size={18} color={weekOffset >= maxWeekOffset ? "#D1D5DB" : "#374151"} />
                  </TouchableOpacity>
                </View>

                {/* Quick jump chips */}
                <View style={{ flexDirection: "row", marginTop: 16, gap: 8 }}>
                  {[
                    { label: t("time.today"), date: todayStart, ok: chipTodayOk, weekIdx: 0 },
                    { label: t("time.tomorrow"), date: tomorrow, ok: chipTomorrowOk, weekIdx: 0 },
                    { label: t("time.nextWeek"), date: nextWeekStart, ok: chipNextWeekOk, weekIdx: 1 },
                  ].map(({ label, date: targetDate, ok, weekIdx }) => (
                    <TouchableOpacity
                      key={label}
                      disabled={!ok}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (!ok) return;
                        haptic.medium();
                        setSelectedDate(targetDate);
                        setWeekOffset(weekIdx);
                        setStep("time");
                      }}
                      style={{
                        backgroundColor: ok ? `${Colors.primary}12` : "#F9FAFB",
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        opacity: ok ? 1 : 0.45,
                        borderWidth: 1,
                        borderColor: ok ? `${Colors.primary}25` : "transparent",
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: ok ? Colors.primary : "#9CA3AF" }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* ── Step: Time ── */}
            {step === "time" && selectedDay && (
              <View>
                {/* Date context header */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: "#111827", letterSpacing: -0.5 }}>
                    Pick a time
                  </Text>
                  <TouchableOpacity
                    onPress={() => setStep("date")}
                    style={{ flexDirection: "row", alignItems: "center", marginTop: 6, alignSelf: "flex-start" }}
                    accessibilityRole="button"
                    accessibilityLabel="Change date"
                  >
                    <View style={{
                      flexDirection: "row", alignItems: "center", gap: 6,
                      backgroundColor: `${Colors.primary}12`, borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 6,
                      borderWidth: 1, borderColor: `${Colors.primary}25`,
                    }}>
                      <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.primary }}>
                        {selectedDay.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </Text>
                      <Ionicons name="pencil-outline" size={12} color={Colors.primary} />
                    </View>
                  </TouchableOpacity>
                </View>

                {loadingSlots ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <Skeleton key={i} width={80} height={44} borderRadius={12} style={{ marginRight: 8, marginBottom: 8 }} />
                    ))}
                  </View>
                ) : slotLoadError ? (
                  <View style={{ alignItems: "center", paddingVertical: 24 }}>
                    <Ionicons name="cloud-offline-outline" size={36} color="#D1D5DB" />
                    <Text style={{ color: "#6B7280", marginTop: 8, fontSize: 14, textAlign: "center" }}>
                      {slotLoadError}
                    </Text>
                    <TouchableOpacity
                      onPress={() => loadSlots()}
                      style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: contentPadding, paddingVertical: 10, marginTop: 12 }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : slots.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 24 }}>
                    <Ionicons name="time-outline" size={36} color="#D1D5DB" />
                    <Text style={{ color: "#6B7280", marginTop: 8, fontSize: 14, textAlign: "center" }}>
                      {t("booking.noSlotsDescription")}
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
                          {user ? (waitlistJoining ? t("booking.joiningWaitlist") : t("booking.joinWaitlist")) : t("booking.signInToJoinWaitlist")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : selectableSlots.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 24 }}>
                    <Ionicons name="time-outline" size={36} color="#D1D5DB" />
                    <Text style={{ color: "#6B7280", marginTop: 8, fontSize: 14, textAlign: "center" }}>
                      {t("booking.noSlotsTryAnother")}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setStep("date")}
                      style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: contentPadding, paddingVertical: 10, marginTop: 12 }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600" }}>Try Another Date</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  (() => {
                    const getPeriod = (iso: string) => {
                      const h = slotHourInTimeZone(iso, provider?.timezone ?? null);
                      if (h < 12) return "Morning";
                      if (h < 17) return "Afternoon";
                      return "Evening";
                    };
                    const periodMeta: Record<string, { icon: string; bgColor: string; iconColor: string }> = {
                      Morning: { icon: "sunny-outline", bgColor: "#FFF7ED", iconColor: "#F59E0B" },
                      Afternoon: { icon: "partly-sunny-outline", bgColor: "#FFF7ED", iconColor: "#F97316" },
                      Evening: { icon: "moon-outline", bgColor: "#EEF2FF", iconColor: "#6366F1" },
                    };
                    const byPeriod = { Morning: [] as AvailabilitySlot[], Afternoon: [] as AvailabilitySlot[], Evening: [] as AvailabilitySlot[] };
                    displaySlots.forEach((s) => {
                      const p = getPeriod(s.start);
                      byPeriod[p].push(s);
                    });
                    const order: ("Morning" | "Afternoon" | "Evening")[] = ["Morning", "Afternoon", "Evening"];
                    return (
                      <View style={{ gap: 10 }}>
                        {order.map((period) => {
                          const list = byPeriod[period];
                          if (list.length === 0) return null;
                          const isOpen = openTimePeriod === period;
                          const meta = periodMeta[period];
                          const periodLabel = period === "Morning" ? t("booking.morning") : period === "Afternoon" ? t("booking.afternoon") : t("booking.evening");
                          return (
                            <View
                              key={period}
                              style={{
                                borderRadius: 18,
                                overflow: "hidden",
                                backgroundColor: "#fff",
                                borderWidth: 1,
                                borderColor: isOpen ? `${meta.iconColor}30` : "#F0F0F0",
                                shadowColor: "#000",
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: 0.05,
                                shadowRadius: 4,
                                elevation: 1,
                              }}
                            >
                              <Pressable
                                onPress={() => {
                                  haptic.light();
                                  setOpenTimePeriod((p) => (p === period ? null : period));
                                }}
                                style={{
                                  flexDirection: "row", alignItems: "center",
                                  paddingHorizontal: 16, paddingVertical: 14,
                                  backgroundColor: isOpen ? meta.bgColor : "transparent",
                                  gap: 12,
                                }}
                                accessibilityRole="button"
                                accessibilityLabel={periodLabel}
                                accessibilityState={{ expanded: isOpen }}
                              >
                                <View style={{
                                  width: 36, height: 36, borderRadius: 10,
                                  backgroundColor: `${meta.iconColor}18`,
                                  alignItems: "center", justifyContent: "center",
                                }}>
                                  <Ionicons name={meta.icon as any} size={18} color={meta.iconColor} />
                                </View>
                                <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: "#111827" }}>
                                  {periodLabel}
                                </Text>
                                <View style={{
                                  backgroundColor: `${meta.iconColor}18`,
                                  borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
                                }}>
                                  <Text style={{ fontSize: 12, fontWeight: "700", color: meta.iconColor }}>
                                    {list.filter((s) => s.is_available !== false).length}
                                  </Text>
                                </View>
                                <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color="#9CA3AF" />
                              </Pressable>
                              {isOpen && (
                                <View style={{ padding: 12 }}>
                                  {/* Legend */}
                                  <View style={{ flexDirection: "row", gap: 14, marginBottom: 10 }}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                                      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: "#dcfce7", borderWidth: 1.5, borderColor: "#4ade80" }} />
                                      <Text style={{ fontSize: 10, color: "#6B7280" }}>Available</Text>
                                    </View>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                                      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: "#fee2e2", borderWidth: 1.5, borderColor: "#fca5a5" }} />
                                      <Text style={{ fontSize: 10, color: "#6B7280" }}>Unavailable</Text>
                                    </View>
                                  </View>
                                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                                  {list.map((slot) => {
                                    const timeStr = formatTimeSafe(slot.start, provider?.timezone ?? null);
                                    const isSelected = selectedSlot?.start === slot.start;
                                    const isUnavailable = slot.is_available === false;
                                    return (
                                      <TouchableOpacity
                                        key={slot.start}
                                        onPress={() => {
                                          if (isUnavailable) return;
                                          haptic.medium();
                                          setSelectedSlot(slot);
                                        }}
                                        activeOpacity={isUnavailable ? 1 : 0.75}
                                        disabled={isUnavailable}
                                        style={{
                                          alignItems: "center",
                                          paddingHorizontal: 14,
                                          paddingVertical: 11,
                                          borderRadius: 14,
                                          backgroundColor: isSelected
                                            ? Colors.primary
                                            : isUnavailable
                                              ? "#fee2e2"
                                              : "#f0fdf4",
                                          borderWidth: 1.5,
                                          borderColor: isSelected
                                            ? Colors.primary
                                            : isUnavailable
                                              ? "#fca5a5"
                                              : "#4ade80",
                                          minWidth: 78,
                                          opacity: isUnavailable ? 0.65 : 1,
                                          shadowColor: Colors.primary,
                                          shadowOffset: { width: 0, height: 4 },
                                          shadowOpacity: isSelected ? 0.3 : 0,
                                          shadowRadius: 8,
                                          elevation: isSelected ? 3 : 0,
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={isUnavailable ? `${timeStr} — unavailable` : `Select time ${timeStr}`}
                                        accessibilityState={{ selected: isSelected, disabled: isUnavailable }}
                                      >
                                        <Text style={{ fontWeight: "700", fontSize: 14, color: isSelected ? "#fff" : isUnavailable ? "#ef4444" : "#15803d" }}>
                                          {timeStr}
                                        </Text>
                                        <Text style={{ fontSize: 9, fontWeight: "700", color: isSelected ? "rgba(255,255,255,0.8)" : isUnavailable ? "#fca5a5" : "#16a34a", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 }}>
                                          {isUnavailable ? "Taken" : "Open"}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                  </View>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()
                )}
              </View>
            )}

            {/* ── Step: Add-ons (optional extras before checkout) ── */}
            {step === "addons" && (
              <View>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 }}>{t("booking.addExtrasOptional")}</Text>
                <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>
                  {t("booking.addExtrasDescription")}
                </Text>
                {addonsList.length === 0 ? (
                  <View style={{ paddingVertical: 16, paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#F9FAFB", marginBottom: 12 }}>
                    <Text style={{ fontSize: 14, color: "#6B7280" }}>{t("booking.noAddonsAvailable")}</Text>
                  </View>
                ) : (
                  addonsList.map((addon) => {
                    const isSelected = selectedAddonIds.includes(addon.id);
                    const label = addon.title ?? addon.name ?? t("booking.addonLabel");
                    const price = Number(addon.price) || 0;
                    const currency = provider?.currency ?? getTenantDefaultCurrency();
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
          </ScrollView>

          <Modal
            visible={calendarModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setCalendarModalVisible(false)}
          >
            <View style={{ flex: 1, justifyContent: "center", padding: contentPadding }}>
              <Pressable
                style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.45)" }]}
                onPress={() => setCalendarModalVisible(false)}
              />
              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 20,
                  padding: 18,
                  maxWidth: 400,
                  alignSelf: "center",
                  width: "100%",
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  zIndex: 1,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <TouchableOpacity
                    disabled={!canGoCalPrev}
                    onPress={() => {
                      if (canGoCalPrev) setCalendarMonth(new Date(calendarYear, calendarMonthIdx - 1, 1));
                    }}
                    style={{ padding: 8, opacity: canGoCalPrev ? 1 : 0.35 }}
                    accessibilityLabel="Previous month"
                  >
                    <Ionicons name="chevron-back" size={22} color="#111827" />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "#111827" }}>
                    {CAL_MONTHS[calendarMonthIdx]} {calendarYear}
                  </Text>
                  <TouchableOpacity
                    disabled={!canGoCalNext}
                    onPress={() => {
                      if (canGoCalNext) setCalendarMonth(new Date(calendarYear, calendarMonthIdx + 1, 1));
                    }}
                    style={{ padding: 8, opacity: canGoCalNext ? 1 : 0.35 }}
                    accessibilityLabel="Next month"
                  >
                    <Ionicons name="chevron-forward" size={22} color="#111827" />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: "row", marginBottom: 6 }}>
                  {CAL_WEEKDAYS.map((w) => (
                    <Text key={w} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600", color: "#6B7280" }}>
                      {w}
                    </Text>
                  ))}
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {calMonthCells.map((cell, idx) => {
                    if (!cell) {
                      return <View key={`pad-${idx}`} style={{ width: `${100 / 7}%`, minHeight: 40 }} />;
                    }
                    const ds = startOfLocalDay(cell);
                    const outOfRange = ds.getTime() < todayStart.getTime() || ds.getTime() > lastSelectableDay.getTime();
                    const sel = selectedDay ? isSameDay(cell, selectedDay) : false;
                    return (
                      <TouchableOpacity
                        key={cell.toISOString()}
                        disabled={outOfRange}
                        onPress={() => handleCalendarSelectDay(cell)}
                        style={{
                          width: `${100 / 7}%`,
                          minHeight: 40,
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 4,
                          borderRadius: 10,
                          backgroundColor: sel ? Colors.primary : "transparent",
                        }}
                        accessibilityLabel={`${cell.toDateString()}`}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "600",
                            color: outOfRange ? "#D1D5DB" : sel ? "#fff" : "#111827",
                          }}
                        >
                          {cell.getDate()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  onPress={() => setCalendarModalVisible(false)}
                  style={{ marginTop: 12, alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16 }}
                >
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "#6B7280" }}>{t("common.cancel")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* ═══ Sticky Bottom CTA ═══ */}
          {step === "service" && (
            <View style={{
              paddingHorizontal: contentPadding, paddingTop: 12, paddingBottom: 12 + Math.max(insets.bottom, 8),
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
                accessibilityLabel={activePackage ? `Book ${activePackage.name}` : "Next"}
                accessibilityState={{ disabled: selectedServices.length === 0 }}
              >
                {activePackage ? (
                  <>
                    <Ionicons name="gift-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Book {activePackage.name}</Text>
                  </>
                ) : (
                  <>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Next</Text>
                    <Ionicons name="chevron-forward" size={20} color="#fff" style={{ marginLeft: 6 }} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
          {step === "venue" && (selectedService || selectedServices.length > 0) && (
            <View style={{
              paddingHorizontal: contentPadding, paddingTop: 12, paddingBottom: 12 + Math.max(insets.bottom, 8),
              borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
            }}>
              {(() => {
                const venueValid = locationType === "at_salon"
                  ? selectedLocation != null
                  : (Boolean(atHomeAddress.line1.trim()) && Boolean(atHomeAddress.city.trim()));
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
              paddingHorizontal: contentPadding, paddingTop: 12, paddingBottom: 12 + Math.max(insets.bottom, 8),
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
          {step === "date" && staff.length > 0 && selectedStaff && (
            <View style={{
              paddingHorizontal: contentPadding, paddingTop: 12, paddingBottom: 12 + Math.max(insets.bottom, 8),
              borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
            }}>
              <TouchableOpacity
                onPress={() => { haptic.medium(); setStep("time"); }}
                disabled={!selectedDay}
                style={{
                  backgroundColor: selectedDay ? Colors.primary : "#D1D5DB",
                  borderRadius: 14, paddingVertical: 16,
                  alignItems: "center", flexDirection: "row", justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Next"
                accessibilityState={{ disabled: !selectedDay }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Next</Text>
                <Ionicons name="chevron-forward" size={20} color="#fff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          )}
          {step === "time" && selectedSlot && (
            <View style={{
              paddingHorizontal: contentPadding, paddingTop: 12, paddingBottom: 12 + Math.max(insets.bottom, 8),
              borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
            }}>
              <TouchableOpacity
                onPress={() => { haptic.medium(); setStep("addons"); }}
                style={{
                  backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
                  alignItems: "center", flexDirection: "row", justifyContent: "center",
                }}
                accessibilityRole="button"
accessibilityLabel={t("booking.nextAddExtras")}
                >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{t("booking.nextAddExtras")}</Text>
                <Ionicons name="chevron-forward" size={20} color="#fff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          )}
          {step === "addons" && (
            <View style={{
              paddingHorizontal: contentPadding, paddingTop: 12, paddingBottom: 12 + Math.max(insets.bottom, 8),
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
                accessibilityLabel={user ? t("booking.continueToPayment") : t("booking.signInToContinue")}
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
                      {user ? t("booking.continueToPayment") : t("booking.signInToContinue")}
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
            setAtHomeAddress((prev) => ({
              ...prev,
              line1: addr.structured!.address_line1,
              line2: addr.structured!.address_line2 ?? "",
              city: addr.structured!.city,
              country: addr.structured!.country || getDeviceRegionCountryIso(),
              postal_code: addr.structured!.postal_code ?? "",
            }));
          } else {
            const display = addr.displayName || addr.label || "";
            const parts = display.split(",").map((s) => s.trim()).filter(Boolean);
            setAtHomeAddress((prev) => ({
              ...prev,
              line1: parts[0] || display || "",
              city: parts[1] || parts[0] || "",
              country: getDeviceRegionCountryIso(),
            }));
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
