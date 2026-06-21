import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import {
  Platform,
  View,
  Text,
  ScrollView,
  InteractionManager,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  Share,
} from "react-native";
import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format, parseISO } from "date-fns";
import * as Location from "expo-location";
import { useApi, useApiMutation, useApiPost } from "@/hooks/useApi";
import { useYocoIntegration } from "@/hooks/useYoco";
import { YocoPaymentSheet } from "@/components/YocoPaymentSheet";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { ActionButton } from "@/components/ui/ActionButton";
import { SafetyPanicButton } from "@/components/SafetyPanicButton";
import { APP_URL, webApiTenantHeaders } from "@/config/public-env";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { ArrivalQrScannerModal } from "@/components/ArrivalQrScannerModal";
import * as Haptics from "expo-haptics";
import { api, getApiBaseUrl } from "@/lib/api-client";
import { emitNotificationBadgeRefresh } from "@/lib/notification-badge-events";
import {
  PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH,
  paystackTerminalCollectionIntentPayload,
} from "@/lib/paystack-terminal-api";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";
import { twStyle } from "@/lib/twStyle";
import { buildZonedIsoForWallClock } from "@/lib/tz";
import { useProvider } from "@/providers/ProviderContext";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import {
  appendFormDataFileNative,
  ARRIVAL_PIN_LENGTH_HINT,
  ARRIVAL_PIN_PLACEHOLDER,
  ARRIVAL_PIN_PROVIDER_HEADING,
  ARRIVAL_PIN_PROVIDER_SUBTEXT,
  ARRIVAL_PIN_TOAST_PROVIDER_INCOMPLETE,
  PROVIDER_EXCELLENCE_DASHBOARD_CTA,
  PROVIDER_HOUSE_CALL_EXCELLENCE_NUDGE,
  PROVIDER_ON_PLATFORM_PAYMENT_NUDGE,
  PROVIDER_SALON_CHECKIN_EXCELLENCE_NUDGE,
  PROVIDER_SALON_VISIT_FLOW_EXPLAINER,
} from "@beautonomi/utils";
import {
  ensureForegroundLocationPermission,
  launchImageLibraryWithPermission,
} from "@/lib/native-permissions";
import { buildSaleItemsFromBookingDetail } from "@/lib/build-sale-items-from-booking";
import {
  dbTargetToPatchStatusField,
  labelForDbStatus,
  optimisticBookingFieldsForDbTarget,
} from "@/lib/provider-booking-status-transitions";
import {
  buildProviderBookingActionModel,
  mapProviderBookingActionError,
} from "@/lib/provider-booking-action-policy";
import { getBookingNextStepCard } from "@/lib/provider-booking-next-step-card";
import { BookingEditSheet } from "@/components/bookings/BookingEditSheet";
import { BookingDateStrip, BookingTimeSlotGrid } from "@/components/bookings/BookingDateTimePicker";
import { BookingLiveSyncIndicator } from "@/components/bookings/BookingLiveSyncIndicator";
import { useBookingAvailableSlots } from "@/hooks/useBookingAvailableSlots";
import { formatBookingLiveStageLabel, formatBookingEtaLabel } from "@/lib/booking-live-stage";
import type { BookingEditPatchPayload } from "@/lib/booking-edit-types";

function extractIsoDatePart(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const [datePart] = value.split("T");
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  return datePart;
}

function extractIsoTimePart(value: unknown): string {
  if (typeof value !== "string" || value.length < 16) return "";
  const timePart = value.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(timePart) ? timePart : "";
}

const DEFAULT_TZ = "Africa/Johannesburg";

function formatDateTimeSafe(value: unknown, tz?: string | null): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  try {
    return parsed.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: tz || DEFAULT_TZ,
    });
  } catch {
    return parsed.toLocaleString();
  }
}

function formatTimeSafe(value: unknown, tz?: string | null): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  try {
    return parsed.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: tz || DEFAULT_TZ,
    });
  } catch {
    return parsed.toLocaleTimeString();
  }
}

function formatProductVariantLabel(variant: unknown): string | null {
  if (variant == null || typeof variant !== "object") return null;
  const ov = (variant as { option_values?: unknown }).option_values;
  if (ov == null) return null;
  if (typeof ov === "string") return ov;
  try {
    return JSON.stringify(ov);
  } catch {
    return null;
  }
}

function formatSeriesDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function recurrencePatternLabel(rule: unknown, fallbackFrequency?: unknown): string {
  const frequency = typeof fallbackFrequency === "string" ? fallbackFrequency.toLowerCase() : "";
  const normalizedRule = typeof rule === "string" ? rule.toUpperCase() : "";
  const interval = Math.max(1, Number(normalizedRule.match(/INTERVAL=(\d+)/)?.[1] ?? 1));
  if (frequency === "daily" || normalizedRule.includes("FREQ=DAILY")) return interval > 1 ? `Every ${interval} days` : "Daily";
  if (frequency === "biweekly" || (normalizedRule.includes("FREQ=WEEKLY") && interval === 2)) return "Every 2 weeks";
  if (frequency === "weekly" || normalizedRule.includes("FREQ=WEEKLY")) return interval > 1 ? `Every ${interval} weeks` : "Weekly";
  if (frequency === "monthly" || normalizedRule.includes("FREQ=MONTHLY")) return interval > 1 ? `Every ${interval} months` : "Monthly";
  return "Repeating visit";
}

function getRecurringDetails(booking: BookingDetail | null | undefined) {
  if (!booking) return null;
  const series = booking.recurring_series ?? {};
  const seriesId = booking.recurring_series_id ?? series.id;
  if (!booking.is_recurring && !seriesId) return null;
  const rule = booking.recurrence_rule ?? series.recurrence_rule ?? null;
  const generatedThrough = formatSeriesDate(booking.recurrence_last_booking_date ?? series.last_booking_date);
  const pieces = [
    formatSeriesDate(booking.recurrence_start_date ?? series.start_date)
      ? `Starts ${formatSeriesDate(booking.recurrence_start_date ?? series.start_date)}`
      : null,
    booking.recurrence_end_date ?? series.end_date
      ? `ends ${formatSeriesDate(booking.recurrence_end_date ?? series.end_date)}`
      : booking.recurrence_occurrences ?? series.occurrences
        ? `${booking.recurrence_occurrences ?? series.occurrences} visits planned`
        : "no end date",
    generatedThrough ? `generated through ${generatedThrough}` : null,
  ].filter(Boolean);
  return {
    label: recurrencePatternLabel(rule, booking.recurrence_frequency ?? series.frequency),
    status: series.is_active === false ? "Paused series" : "Active series",
    rule: typeof rule === "string" ? rule : null,
    timeline: pieces.join(" · "),
  };
}

type BookingDetail = {
  id: string;
  booking_number?: string | null;
  status: string;
  /** Raw DB status when API sends it (pending vs confirmed). */
  db_status?: string;
  scheduled_at: string;
  total_amount?: number;
  currency?: string;
  location_type?: "at_salon" | "at_home";
  current_stage?: string | null;
  arrival_otp_verified?: boolean;
  qr_code_verified?: boolean;
  /** From GET /api/provider/bookings/[id] — whether customer still has an active OTP to read out */
  arrival_otp_pending?: boolean;
  /** Whether customer should show QR / 8-char code for this booking */
  qr_arrival_pending?: boolean;
  customer_id?: string | null;
  customers?: {
    id?: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    rating_average?: number | null;
    review_count?: number | null;
  } | null;
  locations?: { name?: string | null } | null;
  location_id?: string | null;
  custom_field_values?: Record<string, string | number | boolean | null>;
  provider_form_responses?: Record<string, Record<string, unknown>> | null;
  address?: {
    line1?: string;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    apartment_unit?: string | null;
    building_name?: string | null;
    floor_number?: string | null;
    access_codes?: { gate?: string; buzzer?: string; door?: string } | null;
    parking_instructions?: string | null;
    location_landmarks?: string | null;
  } | null;
  special_requests?: string | null;
  house_call_instructions?: string | null;
  version?: number;
  total_paid?: number;
  total_refunded?: number;
  /** Applied wallet balance toward this booking (GET detail). */
  wallet_amount?: number | null;
  /** Applied gift card toward this booking (GET detail). */
  gift_card_amount?: number | null;
  payment_status?: string;
  /** Server-computed balance due (includes unpaid additional charges); prefer over local math. */
  outstanding_balance?: number | null;
  /** IANA TZ for customer-facing wall times when API sends it. */
  display_time_zone?: string | null;
  subtotal?: number;
  discount_amount?: number;
  promotion_discount_amount?: number;
  membership_discount_amount?: number;
  loyalty_discount_amount?: number;
  discount_code?: string | null;
  discount_reason?: string | null;
  tax_amount?: number;
  tax_rate?: number;
  service_fee_amount?: number;
  tip_amount?: number;
  travel_fee_amount?: number;
  deposit_required?: boolean;
  deposit_percentage?: number | null;
  deposit_amount?: number | null;
  payment_option?: string | null;
  package_id?: string | null;
  package_name?: string | null;
  recurring_series_id?: string | null;
  is_recurring?: boolean;
  recurring_series?: {
    id?: string | null;
    recurrence_rule?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    frequency?: string | null;
    last_booking_date?: string | null;
    occurrences?: number | null;
    is_active?: boolean | null;
  } | null;
  recurrence_rule?: string | null;
  recurrence_start_date?: string | null;
  recurrence_end_date?: string | null;
  recurrence_frequency?: string | null;
  recurrence_last_booking_date?: string | null;
  recurrence_occurrences?: number | null;
  is_group_booking?: boolean;
  group_booking_id?: string | null;
  group_booking_ref?: string | null;
  participants?: {
    id?: string;
    participant_name?: string | null;
    participant_email?: string | null;
    participant_phone?: string | null;
    is_primary_contact?: boolean | null;
  }[];
  products?: {
    id?: string;
    product_id?: string;
    product_name?: string;
    quantity?: number;
    unit_price?: number;
    total_price?: number;
    product_variant?: { option_values?: unknown } | unknown;
  }[];
  services?: {
    offering_id?: string;
    service_id?: string;
    offering_name?: string;
    staff_id?: string | null;
    staff_name?: string | null;
    scheduled_start_at?: string;
    scheduled_end_at?: string;
    duration_minutes?: number;
    price?: number;
    guest_name?: string | null;
  }[];
  booking_source?: string | null;
  /** Points earned for this booking (when completed); from provider_point_transactions */
  provider_points_earned?: number | null;
  custom_offer?: {
    id?: string;
    notes?: string | null;
    request?: { id?: string; description?: string | null } | null;
  } | null;
};

type AppointmentProductOrder = {
  id: string;
  order_number?: string | null;
  status?: string | null;
  payment_status?: string | null;
  order_source?: string | null;
  fulfillment_type?: string | null;
  payment_method?: string | null;
};

type AppointmentProductOrderResponse = {
  orders?: AppointmentProductOrder[];
};

function isCollectionFulfillment(fulfillmentType?: string | null): boolean {
  const ft = (fulfillmentType ?? "").toLowerCase();
  return ft === "collection" || ft === "pickup" || ft === "";
}

function appointmentProductFulfillmentLabel(status?: string | null): string {
  const s = (status ?? "confirmed").toLowerCase();
  if (s === "delivered") return "Collected";
  if (s === "cancelled") return "Cancelled";
  if (s === "refunded") return "Refunded";
  return "Awaiting collection";
}

function isTerminalProductOrderStatus(status?: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "delivered" || s === "cancelled" || s === "refunded";
}

type ProviderPermissionsResponse = {
  permissions?: {
    edit_appointments?: boolean;
    cancel_appointments?: boolean;
    create_sales?: boolean;
    process_payments?: boolean;
    rate_clients?: boolean;
    view_client_ratings?: boolean;
  };
};

type BookingResourceRow = {
  id: string;
  resource_id: string;
  resource_name: string;
  resource_group_name: string | null;
};

type AdditionalCharge = {
  id: string;
  booking_id: string;
  description: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected" | "paid";
  requested_at?: string;
  paid_at?: string | null;
};

type AuditLogEntry = {
  id: string;
  booking_id: string;
  event_type: string;
  event_data: {
    previous_status?: string;
    new_status?: string;
    field?: string;
    old_value?: unknown;
    new_value?: unknown;
    reason?: string;
    previous_scheduled_at?: string;
    new_scheduled_at?: string;
    amount?: number;
    payment_method?: string;
    payment_id?: string;
    source?: string;
  } | null;
  created_by: string;
  created_by_name?: string;
  created_at: string;
};

function formatTimelineDateTime(value: unknown, tz?: string | null): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  try {
    return parsed.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: tz || DEFAULT_TZ,
    });
  } catch {
    return parsed.toLocaleString();
  }
}

function humanizeBookingStatusKey(raw: string | undefined | null): string {
  if (!raw) return "—";
  const map: Record<string, string> = {
    pending: "Pending",
    pending_payment: "Pending payment",
    confirmed: "Confirmed",
    booked: "Booked",
    waiting: "Waiting",
    checked_in: "Checked in",
    in_progress: "In progress",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No show",
  };
  if (map[raw]) return map[raw];
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildAuditEntryDescription(entry: AuditLogEntry, currency: string): string | null {
  const d = entry.event_data;
  if (!d || typeof d !== "object") return null;
  if (entry.event_type === "payment_received" || entry.event_type === "refunded") {
    const amt = typeof d.amount === "number" ? d.amount : null;
    const method = typeof d.payment_method === "string" ? d.payment_method : null;
    if (amt != null && Number.isFinite(amt)) {
      const money = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency?.trim() || "ZAR",
      }).format(amt);
      return method ? `${money} · ${method}` : money;
    }
  }
  if (d.previous_status != null && d.new_status != null) {
    return `${humanizeBookingStatusKey(String(d.previous_status))} → ${humanizeBookingStatusKey(String(d.new_status))}`;
  }
  if (typeof d.previous_scheduled_at === "string" && typeof d.new_scheduled_at === "string") {
    return "Appointment time was changed.";
  }
  if (typeof d.reason === "string" && d.reason.trim()) {
    return d.reason.trim();
  }
  if (entry.event_type === "updated" && d.field === "cancellation_reason") {
    return typeof d.reason === "string" && d.reason.trim() ? `Reason: ${d.reason.trim()}` : "Cancellation details updated";
  }
  return null;
}

function statusColor(status: string): string {
  switch (status) {
    case "confirmed":
    case "booked":
      return "bg-blue-100";
    case "in_progress":
    case "started":
      return "bg-amber-100";
    case "waiting":
    case "pending":
    case "pending_payment":
      return "bg-amber-100";
    case "checked_in":
      return "bg-primary/10";
    case "completed":
      return "bg-green-100";
    case "cancelled":
      return "bg-gray-100";
    case "no_show":
      return "bg-red-100";
    default:
      return "bg-gray-100";
  }
}

function statusTextColor(status: string): string {
  switch (status) {
    case "confirmed":
    case "booked":
      return "text-blue-800";
    case "in_progress":
    case "started":
      return "text-amber-800";
    case "waiting":
    case "pending":
    case "pending_payment":
      return "text-amber-800";
    case "checked_in":
      return "text-primary";
    case "completed":
      return "text-green-800";
    case "cancelled":
      return "text-gray-700";
    case "no_show":
      return "text-red-800";
    default:
      return "text-gray-700";
  }
}

const ETA_OPTIONS = [15, 30, 45] as const;

/** At-home reschedule slot queries: matches `new.tsx` fallback before /api/location/validate returns. */
const DEFAULT_RESCHEDULE_TRAVEL_BUFFER_MINUTES = 30;

type MarkPaidPaymentMethod = "cash" | "card" | "bank_transfer" | "other" | "paystack_terminal";

function buildMarkPaidPaymentMethods(paystackTerminalEnabled: boolean, yocoEnabled: boolean) {
  const methods: { label: string; value: MarkPaidPaymentMethod }[] = [
    { label: "Cash", value: "cash" },
    {
      label: yocoEnabled ? "Card (Yoco / terminal)" : "Card (terminal)",
      value: "card",
    },
    { label: "EFT", value: "bank_transfer" },
    { label: "Other", value: "other" },
  ];
  if (paystackTerminalEnabled) {
    methods.splice(2, 0, { label: "Paystack Terminal", value: "paystack_terminal" });
  }
  return methods;
}

const PAYMENT_METHODS_CHARGE = [
  { label: "Cash", value: "cash" as const },
  { label: "Card", value: "card" as const },
  { label: "Mobile", value: "mobile" as const },
  { label: "EFT", value: "bank_transfer" as const },
  { label: "Other", value: "other" as const },
];

const SEND_LINK_OPTIONS = [
  { label: "Email", value: "email" as const },
  { label: "SMS", value: "sms" as const },
  { label: "Email & SMS", value: "both" as const },
];

const PROVIDER_COMPLETION_MODAL_STORAGE_KEY = "provider_booking_completion_modal_seen_";

function providerParamTruthy(v: string | string[] | undefined): boolean {
  const s = typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
  return s === "1" || s.toLowerCase() === "true";
}

/** After creating a booking with Card, deep-link opens Yoco once (POS sale + terminal). */
function AutoYocoCollectGate({ shouldRun, onTrigger }: { shouldRun: boolean; onTrigger: () => void }) {
  const cbRef = useRef(onTrigger);
  cbRef.current = onTrigger;
  const fired = useRef(false);
  useEffect(() => {
    if (!shouldRun || fired.current) return;
    fired.current = true;
    const task = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        cbRef.current();
      }, 450);
    });
    return () => task.cancel();
  }, [shouldRun]);
  return null;
}

export default function BookingDetailScreen() {
  const router = useRouter();
  const { id, focusPayment, collectYoco, collectPaystack, return_group_id, openReschedule, openCancel, highlightConfirm } =
    useLocalSearchParams<{
    id: string;
    focusPayment?: string;
    collectYoco?: string;
    collectPaystack?: string;
    return_group_id?: string;
    openReschedule?: string;
    openCancel?: string;
    highlightConfirm?: string;
  }>();
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const { data, loading, error, refresh } = useApi<BookingDetail>(`/api/provider/bookings/${id}`);

  // §Release-audit 2026-04: provider timezone for tz-aware reschedule. Falls
  // back to device local via buildZonedIsoForWallClock when unavailable.
  const { provider: providerProfile } = useProvider();
  const { data: permissionData } = useApi<ProviderPermissionsResponse>("/api/provider/permissions");
  const providerTimezone = providerProfile?.timezone ?? null;
  const permissions = permissionData?.permissions;
  const canEditAppointments = permissions?.edit_appointments === true;
  const canCancelAppointments =
    permissions?.cancel_appointments === true || canEditAppointments;
  const canProcessPayments = permissions?.process_payments === true;
  const canCreateSales = permissions?.create_sales === true;
  const canRateClients = permissions?.rate_clients === true;
  const canViewClientRatings = permissions?.view_client_ratings === true || canRateClients;
  const bookingIdStr = typeof id === "string" ? id : Array.isArray(id) ? id[0] ?? "" : "";

  useFocusEffect(
    useCallback(() => {
      if (!bookingIdStr) return;
      void api
        .post("/api/provider/notifications/mark-related-read", { booking_id: bookingIdStr })
        .then(() => emitNotificationBadgeRefresh())
        .catch(() => {});
    }, [bookingIdStr]),
  );

  const appointmentProductOrdersUrl =
    bookingIdStr && (data?.products?.length ?? 0) > 0
      ? `/api/provider/product-orders?booking_id=${encodeURIComponent(bookingIdStr)}&limit=50`
      : "";
  const {
    data: appointmentProductOrdersData,
    refresh: refreshProductOrders,
  } = useApi<AppointmentProductOrderResponse>(appointmentProductOrdersUrl);
  const appointmentProductOrders = appointmentProductOrdersData?.orders ?? [];
  const { execute: postMutation, loading: mutating } = useApiMutation<{ booking?: BookingDetail; message?: string }>("post");
  const { execute: patchMutation, loading: patchLoading } = useApiMutation<{ booking?: BookingDetail }>("patch");
  const [collectingProductOrderId, setCollectingProductOrderId] = useState<string | null>(null);
  const [preparingFulfillment, setPreparingFulfillment] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  /** Shown immediately on status actions so the chip updates before refetch finishes */
  const [optimisticBookingStatus, setOptimisticBookingStatus] = useState<{ db_status: string; status: string } | null>(
    null,
  );

  const resolvedBooking = useMemo((): BookingDetail | null => {
    if (!data) return null;
    if (!optimisticBookingStatus) return data as BookingDetail;
    return { ...(data as BookingDetail), ...optimisticBookingStatus };
  }, [data, optimisticBookingStatus]);

  useEffect(() => {
    setOptimisticBookingStatus(null);
  }, [bookingIdStr]);

  const currentDbStatus = useMemo(() => {
    const row = resolvedBooking ?? (data as BookingDetail | undefined);
    if (!row) return "confirmed";
    if (row.db_status && typeof row.db_status === "string") return row.db_status;
    const s = row.status;
    if (s === "pending") return "pending";
    if (s === "pending_payment") return "pending_payment";
    if (s === "booked") return "confirmed";
    if (s === "started") return "in_progress";
    if (s === "completed") return "completed";
    if (s === "cancelled") return "cancelled";
    if (s === "no_show") return "no_show";
    if (s === "waiting") return "waiting";
    if (s === "checked_in") return "checked_in";
    return "confirmed";
  }, [data, resolvedBooking]);

  const actionModel = useMemo(() => {
    const row = resolvedBooking ?? (data as BookingDetail | undefined);
    return row ? buildProviderBookingActionModel(row) : null;
  }, [resolvedBooking, data]);
  const allowedStatusTargets = useMemo(() => {
    const targets = actionModel?.statusTargets ?? [];
    return targets.filter((target) => (target === "cancelled" ? canCancelAppointments : canEditAppointments));
  }, [actionModel, canCancelAppointments, canEditAppointments]);
  const statusDisabledReasons = actionModel?.disabledReasons ?? [];
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationPermissionDeniedRef = useRef(false);
  const mainScrollRef = useRef<ScrollView>(null);
  const nextStepCardYRef = useRef(0);
  const highlightConfirmHandledRef = useRef(false);
  const [highlightNextStep, setHighlightNextStep] = useState(false);
  const [pendingHighlightScroll, setPendingHighlightScroll] = useState(false);

  useEffect(() => {
    highlightConfirmHandledRef.current = false;
    setPendingHighlightScroll(false);
    setHighlightNextStep(false);
  }, [bookingIdStr]);

  const scrollToNextStepCard = useCallback((y: number) => {
    mainScrollRef.current?.scrollTo({
      y: Math.max(0, y - 16),
      animated: true,
    });
  }, []);

  useEffect(() => {
    if (!data || highlightConfirmHandledRef.current) return;
    if (!providerParamTruthy(highlightConfirm)) return;
    highlightConfirmHandledRef.current = true;
    if (currentDbStatus !== "pending" && currentDbStatus !== "pending_payment") {
      router.setParams({ highlightConfirm: undefined });
      return;
    }
    setHighlightNextStep(true);
    setPendingHighlightScroll(true);
    if (nextStepCardYRef.current > 0) {
      requestAnimationFrame(() => {
        scrollToNextStepCard(nextStepCardYRef.current);
        setPendingHighlightScroll(false);
      });
    }
    router.setParams({ highlightConfirm: undefined });
    const timer = setTimeout(() => setHighlightNextStep(false), 6000);
    return () => clearTimeout(timer);
  }, [currentDbStatus, data, highlightConfirm, router, scrollToNextStepCard]);

  const handleNextStepCardLayout = useCallback(
    (y: number) => {
      nextStepCardYRef.current = y;
      if (!pendingHighlightScroll) return;
      setPendingHighlightScroll(false);
      requestAnimationFrame(() => scrollToNextStepCard(y));
    },
    [pendingHighlightScroll, scrollToNextStepCard],
  );

  const durationMinutes = useMemo(() => {
    const svcs = data?.services ?? [];
    // Derive from scheduled times (includes add-on durations captured at booking creation)
    if (svcs.length > 0 && data?.scheduled_at) {
      const lastSvc = svcs[svcs.length - 1];
      if (lastSvc.scheduled_end_at) {
        const ms =
          new Date(lastSvc.scheduled_end_at).getTime() -
          new Date(data.scheduled_at).getTime();
        const mins = Math.round(ms / 60000);
        if (mins > 0) return mins;
      }
    }
    return svcs.reduce((s, svc) => s + (svc.duration_minutes ?? 0), 0) || 60;
  }, [data?.services, data?.scheduled_at]);

  // Reschedule
  const [showEditAppointment, setShowEditAppointment] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(() => new Date());
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  /** From POST /api/location/validate using the booking’s stored address (at-home only). */
  const [rescheduleTravelBufferMinutes, setRescheduleTravelBufferMinutes] = useState(
    DEFAULT_RESCHEDULE_TRAVEL_BUFFER_MINUTES,
  );
  const rescheduleDateStr = format(rescheduleDate, "yyyy-MM-dd");

  useEffect(() => {
    if (!showReschedule) {
      setRescheduleTravelBufferMinutes(DEFAULT_RESCHEDULE_TRAVEL_BUFFER_MINUTES);
      return;
    }
    const row = data;
    if (!row || row.location_type !== "at_home") {
      return;
    }
    const addr = row.address;
    const line1 = addr?.line1?.trim();
    const city = addr?.city?.trim();
    const pid = providerProfile?.id;
    if (!pid || !line1 || !city) {
      setRescheduleTravelBufferMinutes(DEFAULT_RESCHEDULE_TRAVEL_BUFFER_MINUTES);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const postal = (addr?.postal_code ?? "").trim();
          const country = (addr?.country ?? "").trim() || "South Africa";
          const line2 = (addr?.line2 ?? "").trim();
          const addressString = [line1, line2, postal, city, country].filter(Boolean).join(", ");
          const lat =
            typeof addr?.latitude === "number" && Number.isFinite(addr.latitude) ? addr.latitude : undefined;
          const lng =
            typeof addr?.longitude === "number" && Number.isFinite(addr.longitude) ? addr.longitude : undefined;
          const res = await api.post<{
            valid?: boolean;
            travelTimeMinutes?: number;
          }>("/api/location/validate", {
            address: addressString,
            provider_id: pid,
            ...(lat != null && lng != null ? { latitude: lat, longitude: lng } : {}),
          });
          if (cancelled) return;
          if (res.error) {
            setRescheduleTravelBufferMinutes(DEFAULT_RESCHEDULE_TRAVEL_BUFFER_MINUTES);
            return;
          }
          const d = res.data;
          if (
            d?.valid === true &&
            typeof d.travelTimeMinutes === "number" &&
            Number.isFinite(d.travelTimeMinutes) &&
            d.travelTimeMinutes > 0
          ) {
            setRescheduleTravelBufferMinutes(Math.ceil(d.travelTimeMinutes));
          } else {
            setRescheduleTravelBufferMinutes(DEFAULT_RESCHEDULE_TRAVEL_BUFFER_MINUTES);
          }
        } catch {
          if (!cancelled) setRescheduleTravelBufferMinutes(DEFAULT_RESCHEDULE_TRAVEL_BUFFER_MINUTES);
        }
      })();
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    showReschedule,
    data?.id,
    data?.location_type,
    data?.address?.line1,
    data?.address?.line2,
    data?.address?.city,
    data?.address?.postal_code,
    data?.address?.country,
    data?.address?.latitude,
    data?.address?.longitude,
    providerProfile?.id,
    data,
  ]);

  const rescheduleSlotQuery = useMemo(() => {
    if (!showReschedule || !rescheduleDateStr || !bookingIdStr) return null;
    const b = data;
    const staffIds = [...new Set((b?.services ?? []).map((s) => s.staff_id).filter((x): x is string => !!x))];
    const offeringIds = [
      ...new Set(
        (b?.services ?? [])
          .map((s) => s.offering_id || s.service_id)
          .filter((x): x is string => !!x),
      ),
    ];
    const locId = b?.location_id?.trim();
    const isHome = b?.location_type === "at_home";
    return {
      date: rescheduleDateStr,
      duration_minutes: durationMinutes,
      staff_ids: staffIds.length > 0 ? staffIds.join(",") : undefined,
      service_ids: offeringIds.length > 0 ? offeringIds.join(",") : undefined,
      location_id: locId || undefined,
      mode: isHome ? "mobile" : "salon",
      travel_buffer: isHome ? rescheduleTravelBufferMinutes : 0,
      exclude_booking_id: bookingIdStr,
    };
  }, [showReschedule, rescheduleDateStr, bookingIdStr, durationMinutes, data, rescheduleTravelBufferMinutes]);

  const {
    rows: rescheduleTimeRows,
    loading: rescheduleSlotsLoading,
    providerTimezone: rescheduleSlotsTimezone,
    refresh: refreshRescheduleSlots,
    slotsData: rescheduleSlotsData,
  } = useBookingAvailableSlots(rescheduleSlotQuery, { enabled: showReschedule });

  const [lastLiveUpdateAt, setLastLiveUpdateAt] = useState<number | null>(null);

  // Notes
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Mark paid
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [markPaidMethod, setMarkPaidMethod] = useState<
    "cash" | "card" | "bank_transfer" | "other" | "paystack_terminal"
  >("card");
  const [markingPaid, setMarkingPaid] = useState(false);

  // Refund
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "store_credit">("store_credit");
  const [refunding, setRefunding] = useState(false);
  const [paymentExcellenceDismissed, setPaymentExcellenceDismissed] = useState(false);

  // Pay with Yoco (pending POS sale → terminal with sale_id → finalize sale + mark booking paid)
  const [showYocoPayment, setShowYocoPayment] = useState(false);
  const { integration: yocoIntegration } = useYocoIntegration();
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paymentLinkEnabled = useFeatureFlag("payment_link");
  const markPaidPaymentMethods = useMemo(
    () => buildMarkPaidPaymentMethods(paystackTerminalEnabled, yocoEnabled),
    [paystackTerminalEnabled, yocoEnabled],
  );
  const [preparingPaystackTerminal, setPreparingPaystackTerminal] = useState(false);
  const [paystackTerminalPrompt, setPaystackTerminalPrompt] = useState<{
    code: string;
    link?: string | null;
    reference?: string | null;
    expectedAmount: number;
  } | null>(null);
  const yocoBookingSaleIdRef = useRef<string | null>(null);
  const [yocoBookingSaleId, setYocoBookingSaleId] = useState<string | null>(null);
  /** Amount (booking currency) we will send to mark-paid after Yoco — matches terminal charge. */
  const yocoPendingChargeAmountRef = useRef<number | null>(null);
  /** Outstanding at the time the pending POS sale was created — used to invalidate stale sales after other payments. */
  const yocoPendingSaleOutstandingSnapshotRef = useRef<number | null>(null);
  const { execute: createBookingPosSale, loading: preparingYocoSale } = useApiPost<
    Record<string, unknown>,
    { id: string }
  >("/api/provider/sales");

  useEffect(() => {
    yocoBookingSaleIdRef.current = null;
    setYocoBookingSaleId(null);
    yocoPendingChargeAmountRef.current = null;
    yocoPendingSaleOutstandingSnapshotRef.current = null;
    setPaymentExcellenceDismissed(false);
  }, [bookingIdStr]);

  // Additional charges (fetch when booking loaded)
  const { data: additionalChargesData, refresh: refreshCharges } = useApi<{ charges: AdditionalCharge[] }>(
    `/api/provider/bookings/${id}/additional-charges`,
    { enabled: !!id }
  );
  const additionalCharges: AdditionalCharge[] = additionalChargesData?.charges ?? [];

  const { data: bookingResourcesData, refresh: refreshResources } = useApi<{ resources: BookingResourceRow[] }>(
    `/api/provider/bookings/${id}/resources`,
    { enabled: !!id }
  );
  const bookingResources = bookingResourcesData?.resources ?? [];

  const refreshBookingDetail = useCallback(async () => {
    await Promise.all([refresh(), refreshCharges(), refreshResources()]);
    setLastLiveUpdateAt(Date.now());
  }, [refresh, refreshCharges, refreshResources]);

  const refreshBookingDetailRef = useRef(refreshBookingDetail);
  refreshBookingDetailRef.current = refreshBookingDetail;
  const showRescheduleRef = useRef(showReschedule);
  showRescheduleRef.current = showReschedule;
  const refreshRescheduleSlotsRef = useRef(refreshRescheduleSlots);
  refreshRescheduleSlotsRef.current = refreshRescheduleSlots;

  useEffect(() => {
    if (!bookingIdStr) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(nextRealtimeTopic(`provider-booking-detail-${bookingIdStr}`))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${bookingIdStr}`,
        },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void refreshBookingDetailRef.current();
            if (showRescheduleRef.current) {
              void refreshRescheduleSlotsRef.current();
            }
          }, 400);
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      try {
        supabase.removeChannel(channel);
      } catch {
        // Best effort cleanup only.
      }
    };
  }, [bookingIdStr]);

  // Pull a fresh slot grid only when the sheet transitions open. Depending on
  // `refreshRescheduleSlots` here would refetch (and bust the cache) on every
  // date tap, since its identity changes with the slot URL. The natural fetch
  // on URL change covers subsequent date changes; realtime events refresh via
  // refreshRescheduleSlotsRef in the subscription handler above.
  useEffect(() => {
    if (showReschedule) {
      void refreshRescheduleSlotsRef.current();
    }
  }, [showReschedule]);

  // Refetch all detail satellite data on focus; otherwise payment/add-on/resource
  // state can stay stale after web or another-device changes.
  useFocusEffect(
    useCallback(() => {
      if (id) {
        void refreshBookingDetail();
      }
    }, [id, refreshBookingDetail]),
  );

  useEffect(() => {
    if (data) {
      setLastLiveUpdateAt(Date.now());
    }
  }, [data]);

  // Send additional charge (POST request-payment: additional_charges row + notify customer)
  const [showRequestPayment, setShowRequestPayment] = useState(false);
  const [requestPaymentDescription, setRequestPaymentDescription] = useState("");
  const [requestPaymentAmount, setRequestPaymentAmount] = useState("");
  const [requestingPayment, setRequestingPayment] = useState(false);

  // Send payment link (email/sms)
  const [showSendPaymentLink, setShowSendPaymentLink] = useState(false);
  const [sendPaymentLinkMethod, setSendPaymentLinkMethod] = useState<"email" | "sms" | "both">("email");
  const [sendingPaymentLink, setSendingPaymentLink] = useState(false);

  // Mark additional charge as paid
  const [chargeMarkPaidId, setChargeMarkPaidId] = useState<string | null>(null);
  const [chargeMarkPaidMethod, setChargeMarkPaidMethod] = useState<"cash" | "card" | "mobile" | "bank_transfer" | "other">("card");
  const [markingChargePaid, setMarkingChargePaid] = useState(false);

  // "Send to client" — re-send the pay request for an existing charge so the
  // customer settles it online (instead of the provider marking it paid in person).
  const [notifyingChargeId, setNotifyingChargeId] = useState<string | null>(null);

  // §Provider-launch (audit 2026-04): customer notification actions (P8 parity).
  const [isNotifying, setIsNotifying] = useState(false);

  // §Provider-launch (audit 2026-04): pull-to-refresh on booking detail.
  const [refreshing, setRefreshing] = useState(false);

  // Arrival verification (provider enters code from customer)
  const [arrivalPinInput, setArrivalPinInput] = useState("");
  const [isVerifyingArrival, setIsVerifyingArrival] = useState(false);
  const [isResendingArrivalOtp, setIsResendingArrivalOtp] = useState(false);
  const [isOverridingArrival, setIsOverridingArrival] = useState(false);
  const [showOverrideArrivalModal, setShowOverrideArrivalModal] = useState(false);
  const [overrideArrivalReason, setOverrideArrivalReason] = useState("");
  const [overrideReasonCode, setOverrideReasonCode] = useState<
    "customer_no_phone" | "customer_technical_issue" | "customer_refused" | "other"
  >("customer_no_phone");
  const [qrArrivalCodeInput, setQrArrivalCodeInput] = useState("");
  const [qrPasteJson, setQrPasteJson] = useState("");
  const [isVerifyingQrArrival, setIsVerifyingQrArrival] = useState(false);
  const [showArrivalQrScanner, setShowArrivalQrScanner] = useState(false);
  const [qrScanError, setQrScanError] = useState<string | null>(null);
  const verifyQrInFlightRef = useRef(false);

  // Consent document upload
  const [uploadingConsentFormId, setUploadingConsentFormId] = useState<string | null>(null);

  async function handleUploadConsentDocument(formId: string) {
    try {
      const result = await launchImageLibraryWithPermission(
        {
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 0.8,
        },
        {
          title: "Permission needed",
          message: "Allow photo library access to upload the consent document.",
        },
      );
      if (!result) return;
      if (result.canceled || !result.assets?.[0]) return;

      setUploadingConsentFormId(formId);
      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = asset.fileName || `consent-${formId}.jpg`;
      const mimeType = asset.mimeType || "image/jpeg";

      const formData = new FormData();
      formData.append("form_id", formId);
      appendFormDataFileNative(formData, "file", { uri, name: fileName, type: mimeType });

      const res = await api.fetch<{ url: string }>(`/api/provider/bookings/${id}/consent-document`, {
        method: "POST",
        body: formData,
      });
      if (res.error) {
        Alert.alert("Error", String(res.error));
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Consent document uploaded");
        await refreshBookingDetail();
      }
    } catch {
      Alert.alert("Error", "Failed to upload document");
    } finally {
      setUploadingConsentFormId(null);
    }
  }

  // Audit log
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAuditLog, setLoadingAuditLog] = useState(false);

  type CustomerProfileData = {
    customer: { id: string; full_name?: string | null; email?: string | null; phone?: string | null; avatar_url?: string | null };
    profile: Record<string, unknown> | null;
    bookings: { id: string; booking_number?: string; status?: string; scheduled_at?: string; total_amount?: number; currency?: string }[];
    reviews: { id: string; rating?: number; comment?: string | null; created_at?: string }[];
  };
  // Customer profile sheet (view full profile from booking)
  const [showCustomerProfile, setShowCustomerProfile] = useState(false);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfileData | null>(null);
  const [loadingCustomerProfile, setLoadingCustomerProfile] = useState(false);

  // Post-completion modal (once per booking when opening a completed booking)
  const [showProviderCompletionModal, setShowProviderCompletionModal] = useState(false);
  const [showRateClientSheet, setShowRateClientSheet] = useState(false);
  const [rateClientStars, setRateClientStars] = useState(0);
  const [rateClientComment, setRateClientComment] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [submittingRateClient, setSubmittingRateClient] = useState(false);
  /** Whether this booking already has a row in provider_client_ratings (null = not loaded yet). */
  const [hasProviderClientRating, setHasProviderClientRating] = useState<boolean | null>(null);
  const [providerClientRatingValue, setProviderClientRatingValue] = useState<number | null>(null);

  const isAtHomeFromData =
    data?.location_type === "at_home" ||
    (data != null &&
      data.location_type == null &&
      !data.location_id &&
      !!data.address?.line1?.trim());
  const isJourneyTrackingStageFromData =
    data?.current_stage === "provider_on_way" || data?.current_stage === "provider_arrived";
  useEffect(() => {
    if (!id || !isAtHomeFromData || !isJourneyTrackingStageFromData || Platform.OS === "web") return;
    const sendLocation = async () => {
      try {
        if (locationPermissionDeniedRef.current) return;
        const currentPerm = await Location.getForegroundPermissionsAsync();
        if (currentPerm.status !== "granted") {
          locationPermissionDeniedRef.current = true;
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const res = await api.post(`/api/provider/bookings/${id}/location`, {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? undefined,
        });
        if (res.error && __DEV__) {
          console.warn("[LocationSync] Failed to send location:", res.error);
        }
      } catch {
        // Network error; next interval will retry
      }
    };
    locationPermissionDeniedRef.current = false;
    sendLocation();
    const interval = setInterval(sendLocation, 45000);
    locationIntervalRef.current = interval;
    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    };
  }, [id, isAtHomeFromData, isJourneyTrackingStageFromData]);

  // Reschedule form sync (must be before early return to satisfy rules of hooks)
  useEffect(() => {
    if (data?.scheduled_at && showReschedule) {
      try {
        const datePart = extractIsoDatePart(data.scheduled_at);
        if (datePart) {
          setRescheduleDate(parseISO(datePart));
        }
        setRescheduleTime(extractIsoTimePart(data.scheduled_at));
      } catch {
        // keep current
      }
    }
  }, [data?.scheduled_at, showReschedule]);

  const listActionOpenedRef = useRef(false);
  useEffect(() => {
    if (!data || listActionOpenedRef.current) return;
    if (providerParamTruthy(openReschedule) && canEditAppointments) {
      listActionOpenedRef.current = true;
      if (data.scheduled_at) {
        const datePart = extractIsoDatePart(data.scheduled_at);
        if (datePart) setRescheduleDate(parseISO(datePart));
        setRescheduleTime(extractIsoTimePart(data.scheduled_at));
      }
      setShowReschedule(true);
      return;
    }
    if (providerParamTruthy(openCancel) && canCancelAppointments) {
      listActionOpenedRef.current = true;
      setShowCancelModal(true);
    }
  }, [data, openReschedule, openCancel, canEditAppointments, canCancelAppointments]);

  // Audit log load (must be before early return to satisfy rules of hooks)
  useEffect(() => {
    if (!showAuditLog || !id) return;
    let cancelled = false;
    setLoadingAuditLog(true);
    api
      .get<AuditLogEntry[]>(`/api/provider/bookings/${id}/audit-log`)
      .then((res) => {
        if (!cancelled) setAuditLogs(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setAuditLogs([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAuditLog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showAuditLog, id]);

  const sortedAuditLogs = useMemo(
    () =>
      [...auditLogs].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [auditLogs],
  );

  // Load whether provider already submitted a client rating (provider_client_ratings)
  useEffect(() => {
    if (!bookingIdStr || !data) return;
    if (data.status !== "completed" && data.status !== "no_show") {
      setHasProviderClientRating(null);
      setProviderClientRatingValue(null);
      return;
    }
    if (!canViewClientRatings) {
      setHasProviderClientRating(false);
      setProviderClientRatingValue(null);
      return;
    }
    let cancelled = false;
    setHasProviderClientRating(null);
    setProviderClientRatingValue(null);
    api
      .get<{ has_rating?: boolean; rating?: { rating?: number } | null }>(
        `/api/provider/ratings?booking_id=${encodeURIComponent(bookingIdStr)}`
      )
      .then((res) => {
        if (cancelled) return;
        const d = res.data;
        setHasProviderClientRating(!!d?.has_rating);
        const ratingVal = Number(d?.rating?.rating ?? NaN);
        setProviderClientRatingValue(
          Number.isFinite(ratingVal) && ratingVal >= 1 && ratingVal <= 5 ? ratingVal : null
        );
      })
      .catch(() => {
        if (!cancelled) {
          setHasProviderClientRating(false);
          setProviderClientRatingValue(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookingIdStr, data, canViewClientRatings]);

  // Show provider post-completion modal once per booking when opening a completed booking
  useEffect(() => {
    if (!bookingIdStr || !data || data.status !== "completed") return;
    let mounted = true;
    AsyncStorage.getItem(PROVIDER_COMPLETION_MODAL_STORAGE_KEY + bookingIdStr)
      .then((seen) => {
        if (mounted && !seen) setShowProviderCompletionModal(true);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [bookingIdStr, data]);

  const dismissProviderCompletionModal = (markSeen: boolean) => {
    setShowProviderCompletionModal(false);
    if (markSeen && bookingIdStr) {
      AsyncStorage.setItem(PROVIDER_COMPLETION_MODAL_STORAGE_KEY + bookingIdStr, "1").catch(() => {});
    }
  };

  const handleRateClientSubmit = async () => {
    if (!canRateClients) {
      Alert.alert("Permission", "You do not have permission to rate clients.");
      return;
    }
    if (!bookingIdStr || rateClientStars < 1 || rateClientStars > 5) {
      Alert.alert("Required", "Please select a rating (1–5 stars).");
      return;
    }
    if (submittingRateClient) return;
    setSubmittingRateClient(true);
    try {
      const comment = typeof rateClientComment === "string" ? rateClientComment.trim() : "";
      const bookingRow = data as BookingDetail | undefined;
      const locId =
        typeof bookingRow?.location_id === "string" && bookingRow.location_id ? bookingRow.location_id : undefined;
      const res = await api.post<{ id?: string }>("/api/provider/ratings", {
        booking_id: bookingIdStr,
        rating: Math.min(5, Math.max(1, Math.floor(Number(rateClientStars)) || 0)),
        comment: comment || undefined,
        ...(locId ? { location_id: locId } : {}),
      });
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to submit rating.");
        return;
      }
      setShowRateClientSheet(false);
      setRateClientStars(0);
      setRateClientComment("");
      setHasProviderClientRating(true);
      setProviderClientRatingValue(Math.min(5, Math.max(1, Math.floor(Number(rateClientStars)) || 0)));
      if (typeof refresh === "function") refresh();
      Alert.alert("Done", "Thanks for rating this client.");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : (e && typeof e === "object" && "error" in e && (e as { error?: { message?: string } }).error?.message)
            ? String((e as { error: { message: string } }).error.message)
            : "Failed to submit rating.";
      Alert.alert("Error", msg);
    } finally {
      setSubmittingRateClient(false);
    }
  };

  const openCustomerProfile = useCallback(async () => {
    const b = data as BookingDetail | null | undefined;
    const cid = b?.customer_id ?? (b?.customers as { id?: string } | undefined)?.id ?? null;
    if (!cid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCustomerProfile(true);
    setCustomerProfile(null);
    setLoadingCustomerProfile(true);
    try {
      const res = await api.get<CustomerProfileData>(`/api/provider/customers/${cid}/profile`);
      if (res.data) setCustomerProfile(res.data);
    } catch {
      setCustomerProfile(null);
    } finally {
      setLoadingCustomerProfile(false);
    }
  }, [data]);

  useEffect(() => {
    const fp = typeof focusPayment === "string" ? focusPayment : Array.isArray(focusPayment) ? focusPayment[0] : "";
    if (fp !== "1" && fp !== "true") return;
    if (!data) return;
    const task = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        mainScrollRef.current?.scrollToEnd({ animated: true });
      }, 400);
    });
    return () => task.cancel();
  }, [focusPayment, data]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Booking" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Booking" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error ?? "Booking not found"} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const b = (resolvedBooking ?? (data as BookingDetail)) as BookingDetail;
  const services = b.services ?? [];
  const recurringDetails = getRecurringDetails(b);
  const customerName = b.customers?.full_name ?? "Guest";
  const customerId = b.customer_id ?? (b.customers as { id?: string } | undefined)?.id ?? null;
  const locationName = b.locations?.name ?? null;
  const addressLine = b.address
    ? [b.address.line1, b.address.line2, b.address.city, b.address.postal_code].filter(Boolean).join(", ")
    : locationName;

  const rawLocationType = b.location_type;
  const effectiveLocationType: "at_home" | "at_salon" =
    rawLocationType === "at_home"
      ? "at_home"
      : rawLocationType === "at_salon"
        ? "at_salon"
        : b.location_id
          ? "at_salon"
          : b.address?.line1
            ? "at_home"
            : "at_salon";
  const isAtHome = effectiveLocationType === "at_home";
  const isAtSalon = effectiveLocationType === "at_salon";
  const addr = b.address;
  const accessCodes = addr?.access_codes;
  const hasAccessCodes =
    !!accessCodes &&
    typeof accessCodes === "object" &&
    Boolean(
      accessCodes.gate?.trim() || accessCodes.buzzer?.trim() || accessCodes.door?.trim()
    );
  const hasAdditionalLocationDetails =
    isAtHome &&
    !!addr &&
    Boolean(
      addr.apartment_unit?.trim() ||
        addr.building_name?.trim() ||
        addr.floor_number?.trim() ||
        addr.parking_instructions?.trim() ||
        addr.location_landmarks?.trim() ||
        b.house_call_instructions?.trim() ||
        hasAccessCodes
    );
  const canStartJourney =
    canEditAppointments &&
    isAtHome &&
    (b.status === "confirmed" || b.status === "booked") &&
    (b.current_stage == null || b.current_stage === "confirmed");
  const canMarkArrived = canEditAppointments && isAtHome && b.current_stage === "provider_on_way";
  const isEnRoute = b.current_stage === "provider_on_way";
  const isArrived = b.current_stage === "provider_arrived";
  const arrivalVerified =
    b.arrival_otp_verified === true || b.qr_code_verified === true;
  const arrivalOtpPending = b.arrival_otp_pending === true;
  const qrArrivalPending = b.qr_arrival_pending === true;

  const isActive = ["pending", "pending_payment", "confirmed", "waiting", "checked_in"].includes(currentDbStatus);
  const isStarted = currentDbStatus === "in_progress";
  /**
   * Same gate as Booking actions → "In progress" (POST start-service). Do not require
   * `arrivalVerified` here: `allowedStatusTargets` already applies
   * `filterInProgressWhenAtHomeVerificationPending` (no-PIN/QR house calls keep `in_progress`
   * at `provider_arrived` without verified flags).
   */
  const canStartServiceInJourney =
    canEditAppointments &&
    isAtHome &&
    isArrived &&
    !isStarted &&
    allowedStatusTargets.includes("in_progress");
  const totalAmount = b.total_amount ?? 0;
  const totalPaid = b.total_paid ?? 0;
  const totalRefunded = b.total_refunded ?? 0;
  const walletAmountApplied = Number(b.wallet_amount ?? 0);
  const giftCardAmountApplied = Number(b.gift_card_amount ?? 0);
  const effectivePaid = Math.max(0, totalPaid - totalRefunded);
  const ps = (b.payment_status || "").toLowerCase();
  // §Finance-truth 2026-05: see apps/web/src/lib/bookings/display-invariants.ts —
  // post-582 `total_paid` already includes wallet+gift booking_payments rows. Use
  // max(effectivePaid, wallet+gift) to never double-subtract while still covering
  // pre-582 rows that pre-date the synthetic booking_payments backfill.
  const walletGiftCoverage = walletAmountApplied + giftCardAmountApplied;
  const coverageLocal = Math.max(effectivePaid, walletGiftCoverage);
  const outstandingRawLocal = totalAmount - coverageLocal;
  const outstanding =
    typeof b.outstanding_balance === "number"
      ? Math.max(0, b.outstanding_balance)
      : ps === "refunded"
        ? 0
        : Math.max(0, outstandingRawLocal);
  /**
   * Amount for Yoco / POS sale / "Mark paid" without a custom line: deposit bookings collect the
   * remaining deposit first (pending or partially_paid until deposit is satisfied), then full AR.
   */
  const depositTarget =
    b.deposit_required === true &&
    b.payment_option === "deposit" &&
    typeof b.deposit_amount === "number" &&
    b.deposit_amount > 0
      ? b.deposit_amount
      : null;
  const depositRemaining =
    depositTarget != null ? Math.max(0, depositTarget - coverageLocal) : 0;
  const yocoTerminalAmount =
    depositRemaining > 0 && (ps === "pending" || ps === "partially_paid")
      ? Math.min(outstanding, depositRemaining)
      : outstanding;
  const netPaidAfterRefunds = totalPaid - totalRefunded;
  /** Align with POST /api/provider/bookings/[id]/mark-paid — collect cash/Yoco before or during visit. */
  const statusesAllowingPayment = new Set([
    "pending",
    "booked",
    "confirmed",
    "started",
    "in_progress",
    "completed",
  ]);
  const canMarkPaid =
    canProcessPayments &&
    yocoTerminalAmount > 0 &&
    typeof b.status === "string" &&
    statusesAllowingPayment.has(b.status);
  const canRefund = canProcessPayments && totalPaid > 0 && totalRefunded < totalPaid;
  const maxRefundable = Math.max(0, netPaidAfterRefunds);

  /** Show payment lines + receipt actions for paid bookings and for closed bookings that may be $0 (complimentary / settled). */
  const showPaymentAndReceiptCard =
    totalAmount > 0 ||
    totalPaid > 0 ||
    b.status === "completed" ||
    b.status === "cancelled" ||
    b.status === "no_show";

  async function openBookingReceiptPdf() {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const base = getApiBaseUrl().replace(/\/$/, "");
      const safeName = `booking_${(b.booking_number ?? String(id).slice(0, 8)).replace(/[^\w.-]+/g, "_")}.pdf`;
      const pdfPath = `/api/provider/bookings/${encodeURIComponent(String(id))}/receipt/pdf`;

      const tryBearerDownload = async (): Promise<boolean> => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token || !base) return false;
        const pdfUrl = `${base}${pdfPath}`;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          ...webApiTenantHeaders(),
        };
        if (Platform.OS === "web") {
          const response = await fetch(pdfUrl, { headers, credentials: "omit" });
          if (!response.ok) return false;
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          if (typeof window !== "undefined") {
            window.open(objectUrl, "_blank", "noopener,noreferrer");
            setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
          }
          return true;
        }
        if (!cacheDirectory) return false;
        const fileUri = `${cacheDirectory}${safeName}`;
        const dl = await downloadAsync(pdfUrl, fileUri, { headers });
        if (dl.status !== 200) return false;
        await Share.share({
          url: fileUri,
          title: "Booking receipt",
          message: `Booking ${b.booking_number ?? id}`,
        });
        return true;
      };

      if (await tryBearerDownload()) return;

      const res = await api.post<{ url: string; expires_at: string }>(
        `/api/provider/bookings/${id}/receipt/signed-url`,
        {},
      );
      if (res.error) {
        const msg =
          typeof res.error === "object" && res.error && "message" in res.error
            ? String((res.error as { message: string }).message)
            : "Could not open the receipt right now. Please try again.";
        Alert.alert("Receipt", msg);
        return;
      }
      const signedUrl = res.data?.url;
      if (!signedUrl) {
        Alert.alert("Receipt", "Could not open the receipt right now. Please try again.");
        return;
      }
      pushInAppBrowser(router, signedUrl, "Receipt");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong while opening the receipt.";
      Alert.alert("Receipt", msg);
    }
  }

  async function shareBookingReceiptSummary() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const cur = b.currency ?? getTenantDefaultCurrency();
    const portalBase = APP_URL?.replace(/\/$/, "") ?? "";
    const manageUrl = portalBase ? `${portalBase}/provider/bookings` : "";
    const lines: string[] = [
      "Beautonomi booking",
      `Booking #${b.booking_number ?? String(id).slice(0, 8)}`,
      "",
      `Provider: ${providerProfile?.business_name ?? "—"}`,
      `When: ${formatDateTimeSafe(b.scheduled_at)}`,
      `Status: ${b.status}`,
      "",
      ...services.map((svc) => {
        const title = svc.offering_name ?? (svc as { name?: string }).name ?? "Service";
        const price = Number((svc as { price?: number }).price ?? 0);
        return `• ${title} – ${cur} ${price.toFixed(2)}`;
      }),
      "",
      `Total: ${cur} ${Number(totalAmount).toFixed(2)}`,
    ];
    if (outstanding > 0) {
      lines.push(`Outstanding: ${cur} ${outstanding.toFixed(2)}`);
    }
    if (manageUrl) {
      lines.push("", `Portal: ${manageUrl}`);
    }
    try {
      await Share.share({ message: lines.join("\n"), title: "Booking receipt" });
    } catch (e) {
      Alert.alert("Share", e instanceof Error ? e.message : "Could not share this receipt.");
    }
  }

  async function openYocoCheckout() {
    if (!id) return;
    // Card payment chains several authenticated POSTs; refresh session first to avoid stale-token "sign in again" races after backgrounding.
    try {
      await supabase.auth.refreshSession();
    } catch {
      /* non-fatal; api client still retries on 401 */
    }
    const chargeAmount = Number(yocoTerminalAmount.toFixed(2));
    if (chargeAmount <= 0) {
      Alert.alert(
        "Nothing to charge",
        outstanding < 0
          ? "This booking has no remaining balance to collect (it may be overpaid). Pull to refresh if you just recorded a payment elsewhere."
          : "There is no remaining balance on this booking.",
      );
      return;
    }
    if (!canMarkPaid) {
      Alert.alert(
        "Cannot take card payment",
        canProcessPayments
          ? "This booking is not in a state where a card payment can be recorded (for example it may be cancelled)."
          : "You do not have permission to process payments.",
      );
      return;
    }
    if (!canCreateSales) {
      Alert.alert("Cannot take card payment", "You do not have permission to create sales records.");
      return;
    }
    let saleId = yocoBookingSaleIdRef.current ?? yocoBookingSaleId;
    const snap = yocoPendingSaleOutstandingSnapshotRef.current;
    if (
      saleId &&
      snap != null &&
      Number.isFinite(snap) &&
      Math.abs(snap - chargeAmount) > 0.02
    ) {
      yocoBookingSaleIdRef.current = null;
      setYocoBookingSaleId(null);
      yocoPendingSaleOutstandingSnapshotRef.current = null;
      saleId = null;
    }
    if (!saleId) {
      const builtItems = buildSaleItemsFromBookingDetail(b);
      if (builtItems.length === 0) {
        Alert.alert("Cannot charge", "Could not build sale lines for this booking.");
        return;
      }
      let items = builtItems;
      let subtotal = typeof b.subtotal === "number" && b.subtotal > 0
        ? b.subtotal
        : builtItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
      let taxAmount = typeof b.tax_amount === "number" ? b.tax_amount : 0;
      let discountAmount = typeof b.discount_amount === "number" ? b.discount_amount : 0;
      const bookingTotal = typeof b.total_amount === "number" ? b.total_amount : subtotal + taxAmount - discountAmount;

      // If this is a partial/remaining payment, keep sale math aligned to charged amount.
      if (Math.abs(chargeAmount - bookingTotal) > 0.01) {
        items = [{
          item_id: null,
          product_variant_id: null,
          type: "service",
          name: "Booking balance due",
          quantity: 1,
          unit_price: chargeAmount,
        }];
        subtotal = chargeAmount;
        taxAmount = 0;
        discountAmount = 0;
      }

      const trRaw = typeof b.tax_rate === "number" ? b.tax_rate : 0;
      const taxRate = trRaw > 1 ? trRaw / 100 : trRaw;
      const staffId = b.services?.[0]?.staff_id ?? null;
      const { data: saleData, error } = await createBookingPosSale({
        customer_id: customerId,
        location_id: b.location_id ?? null,
        staff_id: staffId,
        sale_date: b.scheduled_at,
        items: items.map((i) => ({
          item_id: i.item_id,
          product_variant_id: i.product_variant_id ?? null,
          type: i.type,
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total_amount: chargeAmount,
        payment_method: "yoco",
        payment_status: "pending",
        notes: `Booking ${b.booking_number ?? id}`,
      });
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      if (!saleData?.id) {
        Alert.alert("Error", "Could not prepare card payment.");
        return;
      }
      saleId = saleData.id;
      yocoBookingSaleIdRef.current = saleId;
      setYocoBookingSaleId(saleId);
      yocoPendingSaleOutstandingSnapshotRef.current = chargeAmount;
    }
    yocoPendingChargeAmountRef.current = chargeAmount;
    setShowYocoPayment(true);
  }

  async function openPaystackTerminalCollection() {
    if (!id) return;
    const chargeAmount = Number(yocoTerminalAmount.toFixed(2));
    if (chargeAmount <= 0) {
      Alert.alert("Nothing to collect", "There is no remaining balance on this booking.");
      return;
    }
    if (!canMarkPaid) {
      Alert.alert(
        "Cannot prepare terminal payment",
        canProcessPayments
          ? "This booking is not in a state where an in-person payment can be collected."
          : "You do not have permission to process payments.",
      );
      return;
    }
    try {
      setPreparingPaystackTerminal(true);
      const customerReference = b.booking_number ?? String(id).slice(0, 8);
      const res = await api.post<{
        terminal?: { terminal_code?: string; payment_link?: string | null; terminal_url?: string | null; qr_url?: string | null };
        expectedAmount?: number | null;
      }>(PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH, paystackTerminalCollectionIntentPayload({
        entity_type: "booking",
        entity_id: id,
        expected_amount: chargeAmount,
        customer_reference: customerReference,
      }));
      if (res.error) {
        Alert.alert("Paystack Terminal", res.error.message ?? "Failed to prepare terminal payment.");
        return;
      }
      const terminal = res.data?.terminal;
      const code = terminal?.terminal_code;
      if (!code) {
        Alert.alert("Paystack Terminal", "No active Paystack Terminal is available. Create one first.");
        return;
      }
      setPaystackTerminalPrompt({
        code,
        link: terminal.payment_link ?? terminal.terminal_url ?? terminal.qr_url ?? null,
        reference: customerReference,
        expectedAmount: Number(res.data?.expectedAmount ?? chargeAmount),
      });
    } catch (err) {
      Alert.alert("Paystack Terminal", err instanceof Error ? err.message : "Failed to prepare terminal payment.");
    } finally {
      setPreparingPaystackTerminal(false);
    }
  }

  async function finalizeYocoBookingPayment(
    result: { reference: string },
    options?: { skipSalePatch?: boolean },
  ) {
    if (!id || !result.reference) return;
    const saleId = yocoBookingSaleIdRef.current ?? yocoBookingSaleId;
    if (!saleId) {
      Alert.alert("Error", "Missing sale record. Try again.");
      return;
    }
    if (!options?.skipSalePatch) {
      const patchRes = await api.patch(`/api/provider/sales/${saleId}`, {
        payment_status: "completed",
        payment_provider: "yoco",
        payment_provider_id: result.reference,
      });
      if (patchRes.error) {
        Alert.alert(
          "Payment received — finish recording",
          "The terminal payment succeeded but the linked sale could not be finalized. Tap Finish recording to retry without charging again.",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Finish recording",
              onPress: () => {
                void finalizeYocoBookingPayment(result);
              },
            },
          ],
        );
        return;
      }
    }
    const chargeForBooking = yocoPendingChargeAmountRef.current ?? yocoTerminalAmount;
    const res = await postMutation(`/api/provider/bookings/${id}/mark-paid`, {
      payment_method: "card",
      payment_provider: "yoco",
      reference: result.reference,
      idempotency_key: `yoco:${id}:${result.reference}`,
      amount: Number(chargeForBooking.toFixed(2)),
    });
    if (res.error) {
      Alert.alert(
        "Payment received — finish recording",
        `The card payment went through but the booking still shows unpaid: ${res.error}`,
        [
          { text: "Later", style: "cancel" },
          {
            text: "Finish recording",
            onPress: () => {
              void finalizeYocoBookingPayment(result, { skipSalePatch: true });
            },
          },
        ],
      );
      await refresh();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    yocoBookingSaleIdRef.current = null;
    setYocoBookingSaleId(null);
    yocoPendingChargeAmountRef.current = null;
    yocoPendingSaleOutstandingSnapshotRef.current = null;
    setShowYocoPayment(false);
    await refresh();
  }

  const isConflictError = (msg: string | null) =>
    msg != null && msg.includes("modified by another user");

  /**
   * Uses the same DB transition rules as PATCH /api/provider/bookings/[id] on web
   * (`PROVIDER_BOOKING_STATUS_TRANSITIONS`). Targets are DB statuses; PATCH payload
   * uses provider-facing status strings via `dbTargetToPatchStatusField`.
   */
  const applyDbStatusTransition = async (dbTarget: string) => {
    if (!id) return;
    if (dbTarget === "cancelled" ? !canCancelAppointments : !canEditAppointments) {
      Alert.alert("Permission", "You do not have permission to update this booking status.");
      return;
    }
    setShowStatusPicker(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (dbTarget === "in_progress") {
      setOptimisticBookingStatus(optimisticBookingFieldsForDbTarget(dbTarget));
      const { error: err, errorCode } = await postMutation(`/api/provider/bookings/${id}/start-service`, {});
      if (err) {
        setOptimisticBookingStatus(null);
        Alert.alert("Status not changed", mapProviderBookingActionError(err, errorCode));
        return;
      }
      setOptimisticBookingStatus(null);
      await refresh();
      return;
    }

    if (dbTarget === "completed") {
      setOptimisticBookingStatus(optimisticBookingFieldsForDbTarget(dbTarget));
      const { error: err, errorCode } = await postMutation(`/api/provider/bookings/${id}/complete-service`, {});
      if (err) {
        setOptimisticBookingStatus(null);
        Alert.alert("Status not changed", mapProviderBookingActionError(err, errorCode));
        return;
      }
      setOptimisticBookingStatus(null);
      await refresh();
      // The useEffect will automatically show the completion modal if it hasn't been seen yet.
      return;
    }

    if (dbTarget === "cancelled") {
      setCancelReason("");
      setShowCancelModal(true);
      return;
    }

    setOptimisticBookingStatus(optimisticBookingFieldsForDbTarget(dbTarget));
    const version = (b as BookingDetail & { version?: number }).version;
    const patchStatus = dbTargetToPatchStatusField(dbTarget);
    const { error: err, errorCode } = await patchMutation(`/api/provider/bookings/${id}`, {
      status: patchStatus,
      ...(version !== undefined && { version }),
    });
    if (err) {
      setOptimisticBookingStatus(null);
      if (errorCode === "CONFLICT" || isConflictError(err)) {
        Alert.alert(
          "Conflict",
          "This booking was modified by another user. Please refresh and try again.",
          [{ text: "Cancel", style: "cancel" }, { text: "Refresh", onPress: () => refresh() }],
        );
      } else {
        Alert.alert("Status not changed", mapProviderBookingActionError(err, errorCode));
      }
      return;
    }
    setOptimisticBookingStatus(null);
    await refresh();
  };

  const handleMarkProductCollected = async (orderId: string) => {
    setCollectingProductOrderId(orderId);
    const { error, errorCode } = await patchMutation(`/api/provider/product-orders/${orderId}`, {
      status: "delivered",
    });
    setCollectingProductOrderId(null);
    if (error) {
      Alert.alert("Could not mark collected", mapProviderBookingActionError(error, errorCode));
      return;
    }
    await Promise.all([refreshProductOrders(), refresh()]);
    Alert.alert("Done", "Product marked as collected.");
  };

  const handlePrepareProductFulfillment = async () => {
    if (!id || !appointmentProductOrdersUrl) return;
    setPreparingFulfillment(true);
    const { error, errorCode } = await patchMutation(`/api/provider/bookings/${id}`, {});
    if (error) {
      setPreparingFulfillment(false);
      Alert.alert("Could not prepare fulfillment", mapProviderBookingActionError(error, errorCode));
      return;
    }
    await refreshProductOrders();
    const linked = await api.get<AppointmentProductOrderResponse>(appointmentProductOrdersUrl);
    setPreparingFulfillment(false);
    if (!linked.data?.orders?.length) {
      Alert.alert(
        "Fulfillment",
        "No product order was linked yet. If products are on this visit, try again or contact support.",
      );
    }
  };

  const handleReschedule = async () => {
    if (!id || !rescheduleTime) {
      Alert.alert("Required", "Please select a time.");
      return;
    }
    if (!canEditAppointments) {
      Alert.alert("Permission", "You do not have permission to reschedule bookings.");
      return;
    }
    setRescheduling(true);
    // §Release-audit 2026-04: use the provider's IANA timezone, not the
    // device's, so reschedule persists the correct UTC instant even when
    // the provider's phone is temporarily in a different zone.
    const slotsTz =
      (typeof rescheduleSlotsData?.provider_timezone === "string" && rescheduleSlotsData.provider_timezone.trim().length > 0
        ? rescheduleSlotsData.provider_timezone.trim()
        : null) || providerTimezone;
    const newScheduledAt = buildZonedIsoForWallClock(rescheduleDateStr, rescheduleTime, slotsTz);
    try {
      const staffIds = (b.services ?? []).map((s: { staff_id?: string | null }) => s.staff_id).filter((sid): sid is string => !!sid);
      const checkParams = new URLSearchParams({
        scheduled_at: newScheduledAt,
        duration_minutes: String(durationMinutes),
        exclude_booking_id: id,
      });
      if (staffIds.length > 0) checkParams.set("staff_ids", staffIds.join(","));
      // §Provider-audit 2026-04: include location_id so multi-location
      // availability rules (working hours, closed periods, resources) are
      // evaluated against the booking's actual location, matching the
      // calendar drag-to-reschedule flow.
      const rescheduleLocationId = (b as BookingDetail & { location_id?: string | null }).location_id;
      if (rescheduleLocationId) checkParams.set("location_id", String(rescheduleLocationId));
      // §Provider-audit 2026-04 (round 2): include offerings so the server
      // can pre-flight room / equipment resources for the new slot too.
      const rescheduleOfferingIds = Array.from(
        new Set(
          (b.services ?? [])
            .map((s: { offering_id?: string | null; service_id?: string | null }) =>
              s.offering_id ?? s.service_id ?? null,
            )
            .filter((id: string | null): id is string => !!id),
        ),
      );
      if (rescheduleOfferingIds.length > 0)
        checkParams.set("offering_ids", rescheduleOfferingIds.join(","));
      const rescheduleIsHome = effectiveLocationType === "at_home";
      checkParams.set("mode", rescheduleIsHome ? "mobile" : "salon");
      checkParams.set(
        "travel_buffer",
        rescheduleIsHome ? String(rescheduleTravelBufferMinutes) : "0",
      );
      const checkRes = await api.get<{ available?: boolean; conflicts?: string[] }>(
        `/api/provider/bookings/check-availability?${checkParams}`
      );
      if (checkRes.error) {
        Alert.alert("Error", checkRes.error.message ?? "Could not verify availability. Please try again.");
        setRescheduling(false);
        return;
      }
      if (checkRes.data?.available === false) {
        // §Provider-audit 2026-04 (round 3): surface the SPECIFIC reasons
        // (resource at capacity, outside staff hours, overlaps break,
        // existing booking, etc.) instead of a generic "not available".
        // Providers need to know whether to pick a different time, a
        // different staff member, or a different location.
        const conflicts = checkRes.data.conflicts ?? [];
        const msg = conflicts.length > 0
          ? conflicts.join("\n")
          : "This time is no longer available. Choose another.";
        Alert.alert("Slot unavailable", msg);
        setRescheduling(false);
        return;
      }
      const version = (b as BookingDetail & { version?: number }).version;
      const { error: err, errorCode } = await patchMutation(`/api/provider/bookings/${id}`, {
        scheduled_at: newScheduledAt,
        travel_buffer: rescheduleIsHome ? rescheduleTravelBufferMinutes : 0,
        ...(version !== undefined && { version }),
      });
      if (err) {
        if (isConflictError(err)) {
          Alert.alert(
            "Conflict",
            "This booking was modified by another user. Please refresh and try again.",
            [{ text: "Cancel", style: "cancel" }, { text: "Refresh", onPress: () => refresh() }]
          );
        } else {
          Alert.alert("Reschedule not changed", mapProviderBookingActionError(err, errorCode));
        }
        setRescheduling(false);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowReschedule(false);
      await refresh();
    } finally {
      setRescheduling(false);
    }
  };

  const handleSaveAppointmentEdit = async (payload: BookingEditPatchPayload) => {
    if (!id) return { error: "Missing booking" };
    const { error: err, errorCode } = await patchMutation(`/api/provider/bookings/${id}`, payload);
    if (err) {
      return { error: err, errorCode: errorCode ?? undefined };
    }
    await refresh();
    return {};
  };

  const handleSaveNotes = async () => {
    if (!id) return;
    if (!canEditAppointments) {
      Alert.alert("Permission", "You do not have permission to edit booking notes.");
      return;
    }
    setSavingNotes(true);
    const version = (b as BookingDetail & { version?: number }).version;
    const { error: err } = await patchMutation(`/api/provider/bookings/${id}`, {
      special_requests: notesText,
      ...(version !== undefined && { version }),
    });
    setSavingNotes(false);
    if (err) {
      if (isConflictError(err)) {
        Alert.alert(
          "Conflict",
          "This booking was modified by another user. Please refresh and try again.",
          [{ text: "Cancel", style: "cancel" }, { text: "Refresh", onPress: () => refresh() }]
        );
      } else {
        Alert.alert("Error", err);
      }
      return;
    }
    setEditingNotes(false);
    await refresh();
  };

  const handleMarkPaid = async () => {
    if (!id) return;
    if (!canProcessPayments) {
      Alert.alert("Permission", "You do not have permission to process payments.");
      return;
    }
    if (yocoTerminalAmount <= 0) {
      Alert.alert("Nothing to record", "There is no remaining balance to mark as paid.");
      return;
    }
    // Paystack Terminal cannot be "marked paid" manually — the customer must pay via the
    // hosted terminal and the payment is then allocated. Route to the collection flow.
    if (markPaidMethod === "paystack_terminal") {
      setShowMarkPaid(false);
      await openPaystackTerminalCollection();
      return;
    }
    setMarkingPaid(true);
    const res = await postMutation(`/api/provider/bookings/${id}/mark-paid`, {
      payment_method: markPaidMethod,
      amount: Number(yocoTerminalAmount.toFixed(2)),
      idempotency_key: `manual:${id}:${markPaidMethod}:${Number(yocoTerminalAmount.toFixed(2))}:${Number(b.total_paid ?? 0).toFixed(2)}`,
    });
    setMarkingPaid(false);
    if (res.error) {
      Alert.alert("Error", res.error);
      return;
    }
    setShowMarkPaid(false);
    await refresh();
  };

  const handleRefund = async () => {
    if (!canProcessPayments) {
      Alert.alert("Permission", "You do not have permission to process payments.");
      return;
    }
    const amount = parseFloat(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Enter a valid refund amount.");
      return;
    }
    if (amount > maxRefundable + 0.01) {
      Alert.alert(
        "Refund too large",
        `You can refund up to ${b.currency ?? getTenantDefaultCurrency()} ${maxRefundable.toFixed(2)} (net of refunds already issued).`,
      );
      return;
    }
    const reason = refundReason.trim();
    if (!reason) {
      Alert.alert("Reason required", "Please enter a reason for the refund.");
      return;
    }
    if (!id) return;
    setRefunding(true);
    const res = await postMutation(`/api/provider/bookings/${id}/refund`, { amount, reason, refund_method: refundMethod });
    setRefunding(false);
    if (res.error) {
      Alert.alert("Error", res.error);
      return;
    }
    setShowRefund(false);
    setRefundAmount("");
    setRefundReason("");
    await refresh();
  };

  const handleStartJourney = async () => {
    if (!id) return;
    if (!canEditAppointments) {
      Alert.alert("Permission", "You do not have permission to update this booking.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const body: Record<string, unknown> = {};
    let journeyLocation: Location.LocationObject | null = null;
    try {
      const allowed = await ensureForegroundLocationPermission({
        title: "Location permission",
        message: "Allow location access while using the app so clients can see journey and arrival updates. If you skip, the journey will continue without live location updates.",
      });
      if (allowed) {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        journeyLocation = loc;
      }
    } catch {
      // Continue without live location if permission or GPS lookup fails.
    }
    if (etaMinutes != null && etaMinutes > 0) {
      body.estimated_arrival = new Date(Date.now() + etaMinutes * 60 * 1000).toISOString();
    }
    const res = await postMutation(`/api/provider/bookings/${id}/start-journey`, body);
    if (res.error) {
      Alert.alert("Error", res.error);
      return;
    }
    if (journeyLocation) {
      await api.post(`/api/provider/bookings/${id}/location`, {
        latitude: journeyLocation.coords.latitude,
        longitude: journeyLocation.coords.longitude,
        accuracy: journeyLocation.coords.accuracy ?? undefined,
      });
    }
    await refresh();
  };

  const handleMarkArrived = async () => {
    if (!id) return;
    if (!canEditAppointments) {
      Alert.alert("Permission", "You do not have permission to update this booking.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const body: Record<string, unknown> = {};
    try {
      const allowed = await ensureForegroundLocationPermission({
        title: "Location permission",
        message: "Allow location access to include your arrival position.",
      });
      if (allowed) {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        body.latitude = loc.coords.latitude;
        body.longitude = loc.coords.longitude;
      }
    } catch {
      // Send without location if permission denied or get position fails
    }
    const res = await postMutation(`/api/provider/bookings/${id}/arrive`, body);
    if (res.error) {
      Alert.alert("Error", res.error);
      return;
    }
    await refresh();
  };

  const handleVerifyArrival = async () => {
    if (!id) return;
    const code = arrivalPinInput.replace(/\D/g, "");
    if (code.length !== 4 && code.length !== 6) {
      Alert.alert("Required", ARRIVAL_PIN_TOAST_PROVIDER_INCOMPLETE);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsVerifyingArrival(true);
    try {
      const res = await postMutation(`/api/provider/bookings/${id}/verify-arrival`, { otp: code });
      if (res.error) {
        Alert.alert("Error", res.error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setArrivalPinInput("");
      await refresh();
    } finally {
      setIsVerifyingArrival(false);
    }
  };

  const handleResendArrivalOtp = async () => {
    if (!id) return;
    setIsResendingArrivalOtp(true);
    try {
      const res = await postMutation(`/api/provider/bookings/${id}/resend-arrival-otp`, {});
      if (res.error) {
        Alert.alert("Error", res.error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } finally {
      setIsResendingArrivalOtp(false);
    }
  };

  const handleOverrideArrivalVerification = () => {
    if (!id) return;
    // Alert.prompt is iOS-only; use the cross-platform modal instead.
    setOverrideArrivalReason("");
    setOverrideReasonCode("customer_no_phone");
    setShowOverrideArrivalModal(true);
  };

  const submitOverrideArrivalVerification = async () => {
    if (!id) return;
    // Free-text detail is required only for the catch-all "other" reason.
    if (overrideReasonCode === "other" && !overrideArrivalReason.trim()) return;
    setIsOverridingArrival(true);
    try {
      const body: Record<string, unknown> = {
        reason_code: overrideReasonCode,
        reason_text: overrideArrivalReason.trim() || undefined,
      };
      // Capture the provider's exact location at override time so disputes and
      // the admin tracking panel can show where the provider actually was.
      try {
        const allowed = await ensureForegroundLocationPermission({
          title: "Location permission",
          message: "Allow location access to record your position for this override.",
        });
        if (allowed) {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          body.latitude = loc.coords.latitude;
          body.longitude = loc.coords.longitude;
        }
      } catch {
        // Proceed without location if permission denied or position fails.
      }
      const res = await postMutation(
        `/api/provider/bookings/${id}/override-arrival-verification`,
        body,
      );
      if (res.error) {
        Alert.alert("Error", res.error);
        return;
      }
      setShowOverrideArrivalModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } finally {
      setIsOverridingArrival(false);
    }
  };

  /**
   * §Provider-launch (audit 2026-04): manually fire provider→customer
   * notifications (re-send confirmation, send reminder, send cancellation
   * notice). Matches the web booking detail "Customer Notifications"
   * panel so operations running from a phone have the same tools.
   */
  const handleResendBookingNotification = async (
    type: "confirmation" | "reminder",
  ) => {
    if (!id) return;
    setIsNotifying(true);
    try {
      const res = await postMutation(`/api/provider/bookings/${id}/notify-resend`, { type });
      if (res.error) {
        Alert.alert("Notification", res.error);
        return;
      }
      const payload = res.data as
        | { sent?: boolean; success?: boolean; detail?: string; message?: string; error?: string }
        | undefined;
      const sent = payload?.sent;
      if (sent === false) {
        const reason =
          payload?.detail ||
          payload?.error ||
          payload?.message ||
          "The notification could not be delivered. Check the customer's contact details and try again.";
        Alert.alert("Not sent", reason);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Sent",
        type === "confirmation"
          ? "Confirmation re-sent to the customer."
          : "Reminder sent to the customer.",
      );
    } finally {
      setIsNotifying(false);
    }
  };

  const handleSendCancellationNotice = async () => {
    if (!id) return;
    setIsNotifying(true);
    try {
      const isNoShow = b?.status === "no_show";
      const res = await postMutation(
        `/api/provider/bookings/${id}/notify-cancellation`,
        { cancellation_type: isNoShow ? "no_show" : "normal" },
      );
      if (res.error) {
        Alert.alert("Notification", res.error);
        return;
      }
      const sent = (res.data as { sent?: boolean } | undefined)?.sent;
      if (sent === false) {
        Alert.alert("Notification", "Cancellation notice could not be sent.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Notification", "Cancellation notice sent to customer.");
    } finally {
      setIsNotifying(false);
    }
  };

  const submitVerifyQrBody = async (body: { verification_code?: string; qr_data?: string }) => {
    if (!id || verifyQrInFlightRef.current) return false;
    verifyQrInFlightRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsVerifyingQrArrival(true);
    setQrScanError(null);
    try {
      const res = await postMutation(`/api/provider/bookings/${id}/verify-qr`, body);
      if (res.error) {
        const message = res.error;
        setQrScanError(message);
        if (!showArrivalQrScanner) {
          Alert.alert("Error", message);
        }
        return false;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setQrArrivalCodeInput("");
      setQrPasteJson("");
      setQrScanError(null);
      setShowArrivalQrScanner(false);
      await refresh();
      return true;
    } finally {
      verifyQrInFlightRef.current = false;
      setIsVerifyingQrArrival(false);
    }
  };

  const handleVerifyQrArrival = async () => {
    if (!id) return;
    const trimmedPaste = qrPasteJson.trim();
    const code = qrArrivalCodeInput.replace(/\s/g, "").toUpperCase();
    const body: { verification_code?: string; qr_data?: string } = {};
    if (trimmedPaste.startsWith("{")) {
      body.qr_data = trimmedPaste;
    } else if (code.length >= 8) {
      body.verification_code = code;
    } else {
      Alert.alert(
        "Required",
        "Enter the 8-character code from the customer’s QR, paste the full scanned JSON, or use Scan QR."
      );
      return;
    }
    await submitVerifyQrBody(body);
  };

  const openMapsUrl = () => {
    const addr = b.address;
    if (!addr?.line1 && !addr?.city) return;
    const lat = (addr as { latitude?: number }).latitude;
    const lng = (addr as { longitude?: number }).longitude;
    const query =
      typeof lat === "number" && typeof lng === "number"
        ? `${lat},${lng}`
        : [addr.line1, addr.city].filter(Boolean).join(", ");
    if (!query) return;
    const encoded = encodeURIComponent(query);
    const url =
      Platform.OS === "ios"
        ? `https://maps.apple.com/?q=${encoded}`
        : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Error", "Could not open maps. Please check your map application.");
    });
  };

  const handleRequestPayment = async () => {
    if (!canProcessPayments) {
      Alert.alert("Permission", "You do not have permission to process payments.");
      return;
    }
    const description = requestPaymentDescription.trim();
    if (!description) {
      Alert.alert("Required", "Please enter a description for the charge.");
      return;
    }
    const amount = parseFloat(requestPaymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount.");
      return;
    }
    if (!id) return;
    setRequestingPayment(true);
    const res = await postMutation(`/api/provider/bookings/${id}/request-payment`, {
      description,
      amount,
    });
    setRequestingPayment(false);
    if (res.error) {
      Alert.alert("Error", res.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowRequestPayment(false);
    setRequestPaymentDescription("");
    setRequestPaymentAmount("");
    await Promise.all([refresh(), refreshCharges()]);
  };

  const handleSendPaymentLink = async () => {
    if (!id) return;
    if (!canProcessPayments) {
      Alert.alert("Permission", "You do not have permission to process payments.");
      return;
    }
    setSendingPaymentLink(true);
    const res = await postMutation(`/api/provider/bookings/${id}/send-payment-link`, {
      delivery_method: sendPaymentLinkMethod,
    });
    setSendingPaymentLink(false);
    if (res.error) {
      Alert.alert("Error", res.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowSendPaymentLink(false);
    Alert.alert("Done", `Payment link sent via ${sendPaymentLinkMethod}.`);
    refresh();
  };

  const handleChargeMarkPaid = async () => {
    if (!id || !chargeMarkPaidId) return;
    if (!canProcessPayments) {
      Alert.alert("Permission", "You do not have permission to process payments.");
      return;
    }
    setMarkingChargePaid(true);
    const res = await postMutation(
      `/api/provider/bookings/${id}/additional-charges/${chargeMarkPaidId}/mark-paid`,
      { payment_method: chargeMarkPaidMethod }
    );
    setMarkingChargePaid(false);
    if (res.error) {
      Alert.alert("Error", res.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setChargeMarkPaidId(null);
    await Promise.all([refresh(), refreshCharges()]);
  };

  const handleSendChargeToClient = async (chargeId: string) => {
    if (!id) return;
    if (!canProcessPayments) {
      Alert.alert("Permission", "You do not have permission to process payments.");
      return;
    }
    setNotifyingChargeId(chargeId);
    const res = await postMutation(
      `/api/provider/bookings/${id}/additional-charges/${chargeId}/notify`,
      {}
    );
    setNotifyingChargeId(null);
    if (res.error) {
      Alert.alert("Error", res.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Sent", "The customer has been asked to pay this charge online.");
    await Promise.all([refresh(), refreshCharges()]);
  };

  // Confirmed bookings (e.g. a custom offer paid online) can also accrue an extra
  // charge before the provider marks the service started, so allow it there too.
  const canRequestPayment =
    canProcessPayments && (isStarted || b.status === "completed" || currentDbStatus === "confirmed");
  const canSendPaymentLink =
    paymentLinkEnabled && canProcessPayments && outstanding > 0 && b.status !== "cancelled";
  const canReschedule = canEditAppointments && isActive && Boolean(b.scheduled_at);
  const canEditLineItems =
    canEditAppointments &&
    (isActive || isStarted) &&
    !b.is_group_booking &&
    currentDbStatus !== "cancelled" &&
    currentDbStatus !== "no_show" &&
    b.status !== "completed";
  const nextStep = getBookingNextStepCard(b, { outstanding, isAtHome, isAtSalon });
  const primaryServiceName = services[0]?.offering_name ?? "Appointment";
  const serviceCountLabel =
    services.length > 1 ? `${primaryServiceName} +${services.length - 1} more` : primaryServiceName;

  const openRescheduleEditor = () => {
    if (!b.scheduled_at) return;
    try {
      const datePart = extractIsoDatePart(b.scheduled_at);
      if (datePart) {
        setRescheduleDate(parseISO(datePart));
      }
      setRescheduleTime(extractIsoTimePart(b.scheduled_at));
    } catch {
      setRescheduleDate(new Date());
      setRescheduleTime("");
    }
    setShowReschedule(true);
  };

  const getAuditEventLabel = (eventType: string): string => {
    const labels: Record<string, string> = {
      created: "Created",
      confirmed: "Confirmed",
      service_started: "Service Started",
      service_completed: "Service Completed",
      cancelled: "Cancelled",
      status_changed: "Status Changed",
      payment_received: "Payment Received",
      refunded: "Refunded",
      rescheduled: "Rescheduled",
      note_added: "Note Added",
      deleted: "Deleted",
      updated: "Updated",
    };
    return labels[eventType] ?? eventType.replace(/_/g, " ");
  };

  return (
    <ScreenContainer scrollable={false}>
      <AutoYocoCollectGate
        shouldRun={
          providerParamTruthy(collectYoco) &&
          yocoTerminalAmount > 0 &&
          yocoIntegration?.is_enabled === true &&
          Boolean(yocoIntegration?.api_key_set) &&
          canMarkPaid &&
          canCreateSales
        }
        onTrigger={() => {
          router.setParams({ collectYoco: undefined });
          void openYocoCheckout();
        }}
      />
      <AutoYocoCollectGate
        shouldRun={
          providerParamTruthy(collectPaystack) &&
          paystackTerminalEnabled &&
          yocoTerminalAmount > 0 &&
          canMarkPaid
        }
        onTrigger={() => {
          router.setParams({ collectPaystack: undefined });
          void openPaystackTerminalCollection();
        }}
      />
      <ScreenHeader
        title={b.booking_number ?? "Booking"}
        subtitle={labelForDbStatus(currentDbStatus)}
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={() => {
              setShowAuditLog(true);
            }}
            style={twStyle("py-2 px-2")}
            accessibilityRole="button"
            accessibilityLabel="View booking history"
          >
            <Text style={twStyle("text-sm font-medium text-primary")}>History</Text>
          </TouchableOpacity>
        }
      />
      {typeof return_group_id === "string" && return_group_id.trim() ? (
        <TouchableOpacity
          style={twStyle("mx-4 mb-2 flex-row items-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5")}
          onPress={() => {
            router.push({
              pathname: "/(app)/(tabs)/more/group-bookings",
              params: { open_group_id: return_group_id.trim() },
            } as never);
          }}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back-outline" size={16} color="#4338ca" style={{ marginRight: 8 }} />
          <Text style={twStyle("text-sm font-medium text-indigo-800")}>Return to group session</Text>
        </TouchableOpacity>
      ) : null}
      <ScrollView
        ref={mainScrollRef}
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              // §Provider-launch (audit 2026-04): pull-to-refresh on booking detail.
              setRefreshing(true);
              try {
                await refreshBookingDetail();
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor={Colors.primary}
          />
        }
      >
        {isAtHome ? (
          <View style={twStyle("rounded-3xl border-2 border-primary/20 bg-primary/10 p-4 mb-3")}>
            <View style={twStyle("flex-row items-center justify-between mb-2")}>
              <View style={twStyle("flex-row items-center flex-1")}>
                <Ionicons name="home" size={22} color={Colors.primary} />
                <Text style={twStyle("ml-2 text-base font-bold text-primary")}>House call</Text>
              </View>
              {b.db_status === "pending" ? (
                <View style={twStyle("rounded-full bg-amber-200 px-2 py-1")}>
                  <Text style={twStyle("text-xs font-bold text-amber-900")}>Confirm first</Text>
                </View>
              ) : null}
            </View>
            <Text style={twStyle("text-sm text-gray-800 leading-5 mb-3")}>
              You travel to the client. Flow: confirm the booking, then Start journey when you leave, Mark arrived, then verify with their PIN and/or QR (per your settings), then tap Start service in the Journey card (same as Booking actions → In progress).
            </Text>
            <Text style={twStyle("text-xs text-gray-700 leading-5 mb-2")}>{PROVIDER_HOUSE_CALL_EXCELLENCE_NUDGE}</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(app)/(tabs)/more/rewards-hub" as never);
              }}
              accessibilityRole="button"
              accessibilityLabel={PROVIDER_EXCELLENCE_DASHBOARD_CTA}
            >
              <Text style={twStyle("text-xs font-semibold text-primary")}>{PROVIDER_EXCELLENCE_DASHBOARD_CTA} →</Text>
            </TouchableOpacity>
            {addressLine ? (
              <TouchableOpacity
                onPress={openMapsUrl}
                style={twStyle("flex-row items-center rounded-2xl border border-primary/20 bg-white px-3 py-2.5")}
                accessibilityRole="button"
                accessibilityLabel="Open directions to client address"
              >
                <Ionicons name="navigate" size={18} color={Colors.primary} />
                <Text style={twStyle("ml-2 flex-1 text-sm font-medium text-gray-800")} numberOfLines={3}>
                  {addressLine}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={twStyle("text-xs text-primary")}>No address on file — check notes or contact the client.</Text>
            )}
          </View>
        ) : null}

        {isAtSalon && (isActive || isStarted) ? (
          <View style={twStyle("rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 mb-3")}>
            <View style={twStyle("flex-row items-center mb-2")}>
              <Ionicons name="business" size={22} color="#334155" />
              <Text style={twStyle("ml-2 text-base font-bold text-slate-900")}>At salon</Text>
            </View>
            <Text style={twStyle("text-sm text-slate-800 leading-5 mb-2")}>{PROVIDER_SALON_VISIT_FLOW_EXPLAINER}</Text>
            <Text style={twStyle("text-xs text-slate-600 leading-5")}>{PROVIDER_SALON_CHECKIN_EXCELLENCE_NUDGE}</Text>
          </View>
        ) : null}

        <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
          {/*
            §Provider-launch (audit 2026-06): customer identity row.
            Booking-level metadata (source + status pills) used to sit
            on this same row next to the name, where "Provider" /
            "Pending" read as if they described the *customer*. They are
            now grouped into a clearly booking-scoped row below.
          */}
          <View style={twStyle("flex-row flex-wrap items-center mb-3")}>
            <Text style={twStyle("font-semibold text-gray-900")} numberOfLines={1}>{customerName}</Text>
              {(b.customers as { identity_verified?: boolean | null } | null)?.identity_verified ? (
                <VerifiedBadge verified style={{ marginLeft: 8 }} />
              ) : null}
              {typeof b.customers?.rating_average === "number" && b.customers.rating_average > 0 ? (
                <Text style={twStyle("ml-2 text-xs font-semibold text-amber-700")}>
                  {`${b.customers.rating_average.toFixed(1)}${b.customers.review_count ? ` (${b.customers.review_count})` : ""} ★`}
                </Text>
              ) : null}
              {customerId ? (
                <TouchableOpacity
                  onPress={openCustomerProfile}
                  style={twStyle("ml-2 p-1.5 rounded-full bg-gray-100")}
                  accessibilityLabel="View customer profile"
                  accessibilityRole="button"
                >
                  <Ionicons name="person-circle-outline" size={24} color="#4b5563" />
                </TouchableOpacity>
              ) : null}
              {/*
                §Provider-launch (audit 2026-04): quick contact actions on
                the booking detail header. Previously a provider had to
                open the customer profile sheet and then jump to the
                Clients tab to message — this puts call / SMS-message
                / text-message one tap away.
              */}
              {b.customers?.phone ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${b.customers!.phone}`).catch(() => {})}
                  style={twStyle("ml-2 p-1.5 rounded-full bg-gray-100")}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${customerName}`}
                >
                  <Ionicons name="call-outline" size={20} color="#4b5563" />
                </TouchableOpacity>
              ) : null}
              {customerId ? (
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const result = await api.post<{ id: string }>(
                        "/api/provider/conversations/create",
                        {
                          customer_id: customerId,
                          // §Provider-launch (audit 2026-04): pass the booking so
                          // the server can authorise messaging even before a
                          // `provider_clients` row exists (first-time web booker).
                          booking_id: typeof id === "string" ? id : undefined,
                        },
                      );
                      if (result.error) {
                        const code = (result.error as { code?: string }).code;
                        const msg =
                          (result.error as { message?: string }).message ??
                          "Could not start conversation.";
                        if (code === "CUSTOMER_UNREGISTERED") {
                          Alert.alert("Invite this client first", msg);
                          return;
                        }
                        if (code === "CUSTOMER_NOT_LINKED") {
                          Alert.alert("Cannot message", msg);
                          return;
                        }
                        Alert.alert("Message", msg);
                        return;
                      }
                      const convId = result.data?.id;
                      if (convId) {
                        router.push(`/(app)/(tabs)/chats/${convId}` as never);
                      }
                    } catch {
                      Alert.alert("Message", "Failed to start conversation.");
                    }
                  }}
                  style={twStyle("ml-2 p-1.5 rounded-full bg-gray-100")}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${customerName}`}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={20} color="#4b5563" />
                </TouchableOpacity>
              ) : null}
          </View>
          <BookingLiveSyncIndicator lastUpdatedAt={lastLiveUpdateAt} />
          {isEnRoute || isArrived ? (
            <View style={twStyle("mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2")}>
              <Text style={twStyle("text-sm font-semibold text-emerald-900")}>
                {formatBookingLiveStageLabel(b.current_stage) ?? "Live appointment"}
              </Text>
              {isEnRoute && (b as { estimated_arrival?: string }).estimated_arrival ? (
                <Text style={twStyle("mt-0.5 text-xs text-emerald-800")}>
                  {formatBookingEtaLabel((b as { estimated_arrival?: string }).estimated_arrival)}
                </Text>
              ) : null}
              {isArrived && (b as { arrival_otp_verified?: boolean }).arrival_otp_verified ? (
                <Text style={twStyle("mt-0.5 text-xs text-emerald-800")}>Arrival verified</Text>
              ) : null}
            </View>
          ) : null}
          <Text style={twStyle("text-sm text-gray-600")}>
            {formatDateTimeSafe(b.scheduled_at, b.display_time_zone ?? providerTimezone)}
          </Text>
          {addressLine ? (
            <Text style={twStyle("mt-2 text-sm text-gray-500")}>{addressLine}</Text>
          ) : null}
          {/*
            §Provider-launch (audit 2026-06): booking source + status,
            grouped on a dedicated row beneath the schedule so they read
            as booking metadata rather than customer attributes.
          */}
          <View style={twStyle("mt-2 flex-row flex-wrap items-center")}>
            {b.is_group_booking && (
              <View style={[twStyle("flex-row items-center gap-1 rounded-full bg-pink-100 px-2 py-1"), { marginRight: 6, marginTop: 4 }]}>
                <Ionicons name="people-outline" size={12} color="#be185d" />
                <Text style={twStyle("text-xs font-medium text-pink-800")}>Group</Text>
              </View>
            )}
            {b.booking_source === "walk_in" && (
              <View style={[twStyle("rounded-full bg-green-100 px-2 py-1"), { marginRight: 6, marginTop: 4 }]}>
                <Text style={twStyle("text-xs font-medium text-green-800")}>Walk-in</Text>
              </View>
            )}
            {b.booking_source === "provider" && !b.is_group_booking && (
              <View style={[twStyle("rounded-full bg-primary/10 px-2 py-1"), { marginRight: 6, marginTop: 4 }]}>
                <Text style={twStyle("text-xs font-medium text-primary")}>Provider-created</Text>
              </View>
            )}
            {b.booking_source === "online" && !b.is_group_booking && (
              <View style={[twStyle("rounded-full bg-blue-100 px-2 py-1"), { marginRight: 6, marginTop: 4 }]}>
                <Text style={twStyle("text-xs font-medium text-blue-800")}>Online</Text>
              </View>
            )}
            <View style={[twStyle(`rounded-full px-2 py-1 ${statusColor(currentDbStatus)}`), { marginTop: 4 }]}>
              <Text style={twStyle(`text-xs font-semibold ${statusTextColor(currentDbStatus)}`)}>
                {labelForDbStatus(currentDbStatus)}
              </Text>
            </View>
          </View>
          {typeof b.total_amount === "number" && (
            <Text style={twStyle("mt-2 text-base font-medium text-gray-900")}>
              {b.currency ?? getTenantDefaultCurrency()} {b.total_amount.toLocaleString()}
            </Text>
          )}
          {b.is_group_booking && b.group_booking_ref ? (
            <Text style={twStyle("mt-2 text-xs font-medium text-primary")}>
              Group booking · {b.group_booking_ref}
            </Text>
          ) : null}
        </View>

        <View
          onLayout={(e) => {
            handleNextStepCardLayout(e.nativeEvent.layout.y);
          }}
          style={twStyle(
            `rounded-2xl border bg-white p-4 mb-3 ${
              highlightNextStep ? "border-2 border-amber-400 bg-amber-50/50" : "border-gray-200"
            }`,
          )}
        >
          <View style={twStyle("flex-row items-start")}>
            <View style={[twStyle("mr-3 h-11 w-11 items-center justify-center rounded-2xl"), { backgroundColor: Colors.primarySoft }]}>
              <Ionicons name={nextStep.icon} size={22} color={Colors.primary} />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-base font-bold text-gray-900")}>{nextStep.title}</Text>
              <Text style={twStyle("mt-1 text-sm leading-5 text-gray-600")}>{nextStep.description}</Text>
            </View>
          </View>

          <View style={twStyle("mt-4 flex-row flex-wrap gap-2")}>
            <View style={twStyle("rounded-xl bg-gray-50 px-3 py-2")}>
              <Text style={twStyle("text-[11px] font-semibold uppercase text-gray-500")}>Appointment</Text>
              <Text style={twStyle("mt-0.5 text-sm font-semibold text-gray-900")} numberOfLines={1}>
                {serviceCountLabel}
              </Text>
            </View>
            <View style={twStyle("rounded-xl bg-gray-50 px-3 py-2")}>
              <Text style={twStyle("text-[11px] font-semibold uppercase text-gray-500")}>Type</Text>
              <Text style={twStyle("mt-0.5 text-sm font-semibold text-gray-900")}>
                {isAtHome ? "House call" : b.booking_source === "walk_in" ? "Walk-in / salon" : "Salon"}
              </Text>
            </View>
            <View style={twStyle("rounded-xl bg-gray-50 px-3 py-2")}>
              <Text style={twStyle("text-[11px] font-semibold uppercase text-gray-500")}>Channel</Text>
              <Text style={twStyle("mt-0.5 text-sm font-semibold text-gray-900")}>
                {b.is_group_booking
                  ? "Group"
                  : b.booking_source === "walk_in"
                    ? "Walk-in"
                    : b.booking_source === "provider"
                      ? "Provider-created"
                      : b.booking_source === "online"
                        ? "Online"
                        : "Booking"}
              </Text>
            </View>
            <View style={twStyle("rounded-xl bg-gray-50 px-3 py-2")}>
              <Text style={twStyle("text-[11px] font-semibold uppercase text-gray-500")}>Balance</Text>
              <Text style={twStyle(`mt-0.5 text-sm font-semibold ${outstanding > 0 ? "text-amber-700" : "text-emerald-700"}`)}>
                {outstanding > 0
                  ? `${b.currency ?? getTenantDefaultCurrency()} ${outstanding.toLocaleString()} due`
                  : "Settled"}
              </Text>
            </View>
          </View>

          <View style={twStyle("mt-4 flex-row flex-wrap gap-2")}>
            {allowedStatusTargets.length > 0 ? (
              <ActionButton
                label={isAtHome ? "Booking actions" : "Change status"}
                onPress={() => setShowStatusPicker(true)}
                disabled={patchLoading || mutating}
                variant="brand"
                size="sm"
                icon="swap-horizontal-outline"
              />
            ) : null}
            {canReschedule ? (
              <TouchableOpacity
                onPress={openRescheduleEditor}
                style={twStyle("rounded-xl border border-primary px-4 py-2.5")}
                accessibilityRole="button"
                accessibilityLabel="Reschedule booking"
              >
                <Text style={twStyle("text-sm font-semibold text-primary")}>Reschedule</Text>
              </TouchableOpacity>
            ) : null}
            {canEditLineItems ? (
              <TouchableOpacity
                onPress={() => setShowEditAppointment(true)}
                style={twStyle("rounded-xl border border-gray-900 px-4 py-2.5")}
                accessibilityRole="button"
                accessibilityLabel="Edit appointment services and products"
              >
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>Edit appointment</Text>
              </TouchableOpacity>
            ) : null}
            {canEditAppointments ? (
              <TouchableOpacity
                onPress={() => {
                  setNotesText(b.special_requests ?? "");
                  setEditingNotes(true);
                }}
                style={twStyle("rounded-xl border border-gray-300 px-4 py-2.5")}
                accessibilityRole="button"
                accessibilityLabel="Edit booking notes"
              >
                <Text style={twStyle("text-sm font-semibold text-gray-800")}>Edit notes</Text>
              </TouchableOpacity>
            ) : null}
            {canMarkPaid ? (
              <TouchableOpacity
                onPress={() => setShowMarkPaid(true)}
                style={twStyle(
                  isAtHome
                    ? "rounded-xl bg-emerald-600 px-4 py-2.5"
                    : "rounded-xl border border-emerald-600 bg-white px-4 py-2.5",
                )}
                accessibilityRole="button"
                accessibilityLabel="Mark booking paid"
              >
                <Text
                  style={twStyle(`text-sm font-semibold ${isAtHome ? "text-white" : "text-emerald-700"}`)}
                >
                  Mark paid
                </Text>
              </TouchableOpacity>
            ) : canSendPaymentLink ? (
              <TouchableOpacity
                onPress={() => setShowSendPaymentLink(true)}
                style={twStyle("rounded-xl border border-emerald-600 px-4 py-2.5")}
                accessibilityRole="button"
                accessibilityLabel="Send payment link"
              >
                <Text style={twStyle("text-sm font-semibold text-emerald-700")}>Payment link</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {actionModel?.paymentLifecycleNote ? (
            <Text style={twStyle("mt-2 text-xs text-emerald-700")}>{actionModel.paymentLifecycleNote}</Text>
          ) : null}
          {allowedStatusTargets.length === 0 && statusDisabledReasons.length > 0 ? (
            <Text style={twStyle("mt-2 text-xs text-gray-500")}>{statusDisabledReasons[0]}</Text>
          ) : null}
        </View>

        {recurringDetails ? (
          <View style={twStyle("rounded-xl border border-blue-200 bg-blue-50 p-4 mb-3")}>
            <View style={twStyle("flex-row items-start justify-between")}>
              <View style={twStyle("flex-1 pr-3")}>
                <View style={twStyle("flex-row items-center")}>
                  <Ionicons name="repeat-outline" size={18} color="#2563eb" />
                  <Text style={twStyle("ml-2 text-sm font-bold text-blue-950")}>
                    {recurringDetails.label}
                  </Text>
                </View>
                <Text style={twStyle("mt-1 text-xs text-blue-800")}>
                  {recurringDetails.timeline || "Repeating series"}
                </Text>
                {recurringDetails.rule ? (
                  <Text style={twStyle("mt-1 text-xs text-blue-700")}>Rule: {recurringDetails.rule}</Text>
                ) : null}
              </View>
              <View style={twStyle("rounded-full border border-blue-300 px-2 py-1")}>
                <Text style={twStyle("text-xs font-semibold text-blue-700")}>{recurringDetails.status}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/(app)/(tabs)/more/recurring-appointments",
                  params: { series_id: b.recurring_series_id },
                } as never)
              }
              style={twStyle("mt-3 rounded-lg border border-blue-200 bg-white px-3 py-2")}
              accessibilityRole="button"
              accessibilityLabel="Manage recurring series"
            >
              <Text style={twStyle("text-center text-sm font-semibold text-blue-700")}>Manage series</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {b.custom_offer && (b.custom_offer.request?.description || b.custom_offer.notes) ? (
          <View style={twStyle("rounded-xl border border-violet-200 bg-violet-50 p-4 mb-3")}>
            <View style={twStyle("flex-row items-center mb-2")}>
              <Ionicons name="sparkles-outline" size={16} color="#7C3AED" style={{ marginRight: 6 }} />
              <Text style={twStyle("text-sm font-bold text-violet-900")}>Custom Order</Text>
            </View>
            {b.custom_offer.request?.description ? (
              <View style={twStyle("mb-2")}>
                <Text style={twStyle("text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1")}>
                  Client&apos;s request
                </Text>
                <Text style={twStyle("text-sm text-violet-900 leading-5")}>
                  {b.custom_offer.request.description}
                </Text>
              </View>
            ) : null}
            {b.custom_offer.notes ? (
              <View>
                <Text style={twStyle("text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1")}>
                  Your notes
                </Text>
                <Text style={twStyle("text-sm text-violet-900 leading-5")}>{b.custom_offer.notes}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {hasAdditionalLocationDetails ? (
          <View style={twStyle("rounded-xl border border-slate-200 bg-slate-50 p-4 mb-3")}>
            <Text style={twStyle("text-sm font-semibold text-slate-900")}>Additional location details</Text>
            <Text style={twStyle("text-xs text-slate-600 mt-1 mb-3")}>
              Helpful info from the customer so you can find them easily.
            </Text>
            {addr?.apartment_unit?.trim() ? (
              <Text style={twStyle("text-sm text-gray-800 mb-1")}>
                <Text style={twStyle("text-gray-500")}>Unit: </Text>
                {addr.apartment_unit}
              </Text>
            ) : null}
            {addr?.building_name?.trim() ? (
              <Text style={twStyle("text-sm text-gray-800 mb-1")}>
                <Text style={twStyle("text-gray-500")}>Building: </Text>
                {addr.building_name}
              </Text>
            ) : null}
            {addr?.floor_number?.trim() ? (
              <Text style={twStyle("text-sm text-gray-800 mb-1")}>
                <Text style={twStyle("text-gray-500")}>Floor: </Text>
                {addr.floor_number}
              </Text>
            ) : null}
            {hasAccessCodes && accessCodes ? (
              <View style={twStyle("mt-2 pt-2 border-t border-slate-200")}>
                <Text style={twStyle("text-xs font-medium text-gray-700 mb-1")}>Access</Text>
                {accessCodes.gate?.trim() ? (
                  <Text style={twStyle("text-sm text-gray-800")}>Gate: {accessCodes.gate}</Text>
                ) : null}
                {accessCodes.buzzer?.trim() ? (
                  <Text style={twStyle("text-sm text-gray-800")}>Buzzer: {accessCodes.buzzer}</Text>
                ) : null}
                {accessCodes.door?.trim() ? (
                  <Text style={twStyle("text-sm text-gray-800")}>Door: {accessCodes.door}</Text>
                ) : null}
              </View>
            ) : null}
            {addr?.parking_instructions?.trim() ? (
              <View style={twStyle("mt-2 pt-2 border-t border-slate-200")}>
                <Text style={twStyle("text-xs font-medium text-gray-700 mb-1")}>Parking</Text>
                <Text style={twStyle("text-sm text-gray-800")}>{addr.parking_instructions}</Text>
              </View>
            ) : null}
            {addr?.location_landmarks?.trim() ? (
              <View style={twStyle("mt-2 pt-2 border-t border-slate-200")}>
                <Text style={twStyle("text-xs font-medium text-gray-700 mb-1")}>Landmarks</Text>
                <Text style={twStyle("text-sm text-gray-800")}>{addr.location_landmarks}</Text>
              </View>
            ) : null}
            {b.house_call_instructions?.trim() ? (
              <View style={twStyle("mt-2 pt-2 border-t border-slate-200")}>
                <Text style={twStyle("text-xs font-medium text-gray-700 mb-1")}>House call instructions</Text>
                <Text style={twStyle("text-sm text-gray-800")}>{b.house_call_instructions}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {((b.participants?.length ?? 0) > 0 || (b.package_name ?? b.package_id)) ? (
          <View style={twStyle("mb-3")}>
            {(b.participants?.length ?? 0) > 0 ? (
              <View style={twStyle("rounded-3xl border border-primary/20 bg-primary/10 p-4")}>
                <View style={twStyle("mb-2 flex-row items-center justify-between")}>
                  <Text style={twStyle("text-sm font-medium text-primary")}>Group participants</Text>
                  {b.group_booking_id ? (
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: "/(app)/(tabs)/more/group-bookings",
                          params: { open_group_id: b.group_booking_id },
                        } as never)
                      }
                      style={twStyle("rounded-full bg-white px-3 py-1.5")}
                      accessibilityRole="button"
                      accessibilityLabel="Manage group booking"
                    >
                      <Text style={twStyle("text-xs font-semibold text-primary")}>Manage group</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {(b.participants ?? []).map((p, idx) => (
                  <View
                    key={p.id ?? `${p.participant_name ?? "p"}-${idx}`}
                    style={twStyle("mb-2 rounded-2xl border border-primary/20 bg-white px-3 py-2 last:mb-0")}
                  >
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>
                      {p.participant_name?.trim() || "Participant"}
                      {p.is_primary_contact ? " · Primary" : ""}
                    </Text>
                    {p.participant_phone ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${p.participant_phone}`).catch(() => {})}
                        accessibilityRole="button"
                        accessibilityLabel={`Call ${p.participant_name?.trim() || "participant"}`}
                      >
                        <Text style={twStyle("text-xs text-primary mt-0.5")}>{p.participant_phone}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {p.participant_email ? (
                      <Text style={twStyle("text-xs text-gray-600")}>{p.participant_email}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
            {b.package_name ? (
              <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4")}>
                <Text style={twStyle("text-xs font-medium uppercase tracking-wide text-gray-500 mb-1")}>Package</Text>
                <Text style={twStyle("text-base font-semibold text-gray-900")}>{b.package_name}</Text>
              </View>
            ) : b.package_id ? (
              <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4")}>
                <Text style={twStyle("text-xs font-medium uppercase tracking-wide text-gray-500 mb-1")}>Package</Text>
                <Text style={twStyle("text-sm text-gray-700")}>Package booking (ID on file)</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <SafetyPanicButton bookingId={id ?? null} />

        {isAtHome && (canStartJourney || isEnRoute || isArrived) && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
            <Text style={twStyle("text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2")}>Journey steps</Text>
            <View style={twStyle("flex-row items-center justify-between mb-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>At-home visit</Text>
              {addressLine ? (
                <TouchableOpacity
                  onPress={openMapsUrl}
                  style={twStyle("py-1")}
                  accessibilityRole="button"
                  accessibilityLabel="Get directions"
                >
                  <Text style={twStyle("text-sm font-medium text-primary")}>Get directions</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {isArrived && (
              <>
                <View style={twStyle("rounded-lg bg-green-50 border border-green-100 py-2 px-3 mb-3")}>
                  <Text style={twStyle("text-sm font-medium text-green-800")}>
                    {arrivalVerified ? "Customer verified – you can start service" : "Provider arrived"}
                  </Text>
                </View>
                {isArrived && !arrivalVerified && arrivalOtpPending && (
                  <View style={twStyle("rounded-lg bg-blue-50 border border-blue-200 p-3 mb-3")}>
                    <Text style={twStyle("text-sm font-medium text-blue-900 mb-1")}>{ARRIVAL_PIN_PROVIDER_HEADING}</Text>
                    <Text style={twStyle("text-xs text-blue-800 mb-1")}>{ARRIVAL_PIN_PROVIDER_SUBTEXT}</Text>
                    <Text style={twStyle("text-xs text-blue-800 mb-2")}>{ARRIVAL_PIN_LENGTH_HINT}</Text>
                    <TextInput
                      value={arrivalPinInput}
                      onChangeText={(t) => setArrivalPinInput(t.replace(/\D/g, "").slice(0, 6))}
                      placeholder={ARRIVAL_PIN_PLACEHOLDER}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={twStyle("border border-gray-300 rounded-lg px-3 py-2.5 text-base mb-2 bg-white")}
                      accessibilityLabel={ARRIVAL_PIN_PROVIDER_HEADING}
                    />
                    <View style={twStyle("flex-row gap-2")}>
                      <TouchableOpacity
                        onPress={handleVerifyArrival}
                        disabled={
                          isVerifyingArrival ||
                          ![4, 6].includes(arrivalPinInput.replace(/\D/g, "").length)
                        }
                        style={twStyle("flex-1 rounded-lg bg-primary py-2.5 items-center")}
                        accessibilityRole="button"
                        accessibilityLabel="Verify arrival"
                      >
                        {isVerifyingArrival ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={twStyle("text-white font-semibold")}>Verify</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleResendArrivalOtp}
                        disabled={isResendingArrivalOtp}
                        style={twStyle("rounded-lg border border-gray-400 py-2.5 px-3 justify-center")}
                        accessibilityRole="button"
                        accessibilityLabel="Resend code"
                      >
                        {isResendingArrivalOtp ? (
                          <ActivityIndicator size="small" color="#111" />
                        ) : (
                          <Text style={twStyle("text-gray-700 font-medium")}>Resend code & QR</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={handleOverrideArrivalVerification}
                      disabled={isOverridingArrival}
                      style={twStyle("mt-2 py-2")}
                      accessibilityRole="button"
                      accessibilityLabel="Customer cannot verify"
                    >
                      <Text style={twStyle("text-amber-800 font-medium text-sm text-center")}>
                        {isOverridingArrival ? "Saving…" : "Customer can't verify?"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {isArrived && !arrivalVerified && qrArrivalPending && (
                  <View style={twStyle("rounded-2xl bg-primary/10 border border-primary/20 p-3 mb-3")}>
                    <Text style={twStyle("text-sm font-medium text-primary mb-1")}>Scan the customer&apos;s QR or enter their code</Text>
                    <Text style={twStyle("text-xs text-gray-700 mb-2")}>
                      Ask them to open this booking — they&apos;ll see an arrival QR. You can scan it or type the 8-character code.
                      {arrivalOtpPending
                        ? " If it expired, use Resend in the PIN section — the customer gets a fresh code and QR."
                        : " If it expired, use Resend below — the customer gets a fresh code and QR."}
                    </Text>
                    {!arrivalOtpPending ? (
                      <TouchableOpacity
                        onPress={handleResendArrivalOtp}
                        disabled={isResendingArrivalOtp}
                        style={twStyle("rounded-2xl border border-primary/20 py-2.5 px-3 items-center mb-2")}
                        accessibilityRole="button"
                        accessibilityLabel="Resend QR and code to customer"
                      >
                        {isResendingArrivalOtp ? (
                          <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                          <Text style={twStyle("text-primary font-semibold")}>Resend QR & code to customer</Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                    <TextInput
                      value={qrArrivalCodeInput}
                      onChangeText={(t) => setQrArrivalCodeInput(t.replace(/\s/g, "").toUpperCase().slice(0, 12))}
                      placeholder="e.g. AB12CD34"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={twStyle("border border-gray-300 rounded-lg px-3 py-2.5 text-base mb-2 bg-white font-mono")}
                      accessibilityLabel="QR verification code from customer"
                    />
                    <Text style={twStyle("text-xs text-primary mb-1")}>Or paste raw scan result (JSON)</Text>
                    <TextInput
                      value={qrPasteJson}
                      onChangeText={setQrPasteJson}
                      placeholder='{"booking_id":"…"'
                      multiline
                      style={twStyle("border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 bg-white min-h-[72px]")}
                      accessibilityLabel="Pasted QR JSON"
                    />
                    <TouchableOpacity
                      onPress={() => {
                        setQrScanError(null);
                        setShowArrivalQrScanner(true);
                      }}
                      disabled={isVerifyingQrArrival || Platform.OS === "web"}
                      style={twStyle(
                        `rounded-2xl border-2 border-primary py-2.5 items-center mb-2 ${Platform.OS === "web" ? "opacity-50" : ""}`
                      )}
                      accessibilityRole="button"
                      accessibilityLabel="Open QR scanner"
                    >
                      <Text style={twStyle("text-primary font-semibold")}>
                        {Platform.OS === "web" ? "Scan QR (use mobile app)" : "Scan QR"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleVerifyQrArrival}
                      disabled={
                        isVerifyingQrArrival ||
                        (qrPasteJson.trim().length === 0 &&
                          qrArrivalCodeInput.replace(/\s/g, "").length < 8)
                      }
                      style={twStyle("rounded-2xl bg-primary py-2.5 items-center")}
                      accessibilityRole="button"
                      accessibilityLabel="Verify QR arrival"
                    >
                      {isVerifyingQrArrival ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={twStyle("text-white font-semibold")}>Verify QR</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
                {canStartServiceInJourney ? (
                  <TouchableOpacity
                    onPress={() => void applyDbStatusTransition("in_progress")}
                    disabled={mutating || patchLoading}
                    style={twStyle("rounded-xl bg-primary py-3 items-center mt-1")}
                    accessibilityRole="button"
                    accessibilityLabel="Start service"
                  >
                    {mutating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={twStyle("text-white font-semibold")}>Start service</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </>
            )}
            {isEnRoute && !isArrived && (
              <View style={twStyle("rounded-lg bg-blue-50 border border-blue-100 py-2 px-3 mb-3")}>
                <Text style={twStyle("text-sm font-medium text-blue-800")}>En route</Text>
              </View>
            )}
            {canStartJourney && (
              <>
                <Text style={twStyle("text-xs text-gray-500 mb-2")}>Optional: I will arrive in</Text>
                <View style={twStyle("flex-row flex-wrap mb-3")}>
                  {ETA_OPTIONS.map((min) => (
                    <TouchableOpacity
                      key={min}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setEtaMinutes((prev) => (prev === min ? null : min));
                      }}
                      style={[twStyle(`rounded-lg border px-3 py-2 ${
                        etaMinutes === min
                          ? "bg-primary border-primary"
                          : "bg-white border-gray-300"
                      }`), { marginRight: 8, marginBottom: 8 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${min} minutes`}
                      accessibilityState={{ selected: etaMinutes === min }}
                    >
                      <Text
                        style={twStyle(`text-sm font-medium ${
                          etaMinutes === min ? "text-white" : "text-gray-700"
                        }`)}
                      >
                        {min} min
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={handleStartJourney}
                  disabled={mutating}
                  style={twStyle("rounded-xl bg-primary py-3 items-center mb-2")}
                  accessibilityRole="button"
                  accessibilityLabel={etaMinutes == null ? "Start journey (no ETA)" : "Start journey"}
                >
                  {mutating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={twStyle("text-white font-semibold")}>
                      {etaMinutes == null ? "Start journey (no ETA)" : "Start journey"}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
            {canMarkArrived && !isArrived && (
              <TouchableOpacity
                onPress={handleMarkArrived}
                disabled={mutating}
                style={twStyle("rounded-xl border border-primary py-3 items-center")}
                accessibilityRole="button"
                accessibilityLabel="Mark arrived"
              >
                {mutating ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={twStyle("text-primary font-semibold")}>Mark arrived</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* At-salon check-in removed: the "Client arrived" button consistently fails for at-salon
            bookings and duplicates the "Change Status" flow. Providers should use Change Status. */}

        {isAtHome && allowedStatusTargets.length > 0 ? (
          <Text style={twStyle("text-[11px] text-gray-500 mb-3 px-1")}>
            After the customer verifies arrival, use{" "}
            <Text style={twStyle("font-semibold text-gray-700")}>Start service</Text> in the Journey card (same as{" "}
            <Text style={twStyle("font-semibold text-gray-700")}>Booking actions</Text> → In progress). For cancel or
            no-show, use Booking actions above.
          </Text>
        ) : null}

        {showProviderCompletionModal ? (
          <View style={twStyle("rounded-3xl border border-primary/20 bg-primary/10 p-4 mb-3")}>
            <View style={twStyle("flex-row items-start")}>
              <View style={twStyle("mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-white")}>
                <Ionicons name="sparkles-outline" size={20} color={Colors.primary} />
              </View>
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("text-sm font-bold text-gray-900")}>Service completed</Text>
                <Text style={twStyle("mt-1 text-xs leading-5 text-gray-600")}>
                  Rate the client, share the receipt, or post the finished work when you are ready.
                </Text>
              </View>
              <TouchableOpacity onPress={() => dismissProviderCompletionModal(true)} accessibilityLabel="Dismiss completed service tip">
                <Ionicons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Client rating (provider → customer via provider_client_ratings) */}
        {(b.status === "completed" || b.status === "no_show") && canViewClientRatings && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Client rating</Text>
            {hasProviderClientRating === true ? (
              <View>
                <Text style={twStyle("text-sm text-gray-600 mb-1")}>You have rated this client for this booking.</Text>
                {providerClientRatingValue != null ? (
                  <View style={twStyle("flex-row items-center")}>
                    <Text style={twStyle("text-xs text-gray-500 mr-2")}>Your rating</Text>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Ionicons
                        key={star}
                        name={star <= providerClientRatingValue ? "star" : "star-outline"}
                        size={15}
                        color="#f59e0b"
                        style={twStyle("mr-1")}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : canRateClients ? (
              <TouchableOpacity
                onPress={() => setShowRateClientSheet(true)}
                style={twStyle("rounded-xl py-3 px-4 self-start")}
                activeOpacity={0.85}
              >
                <Text style={twStyle("font-semibold text-primary")}>Rate this client</Text>
              </TouchableOpacity>
            ) : (
              <Text style={twStyle("text-sm text-gray-600")}>You do not have permission to rate clients.</Text>
            )}
          </View>
        )}

        {/* Payment summary & Mark paid / Refund */}
        {showPaymentAndReceiptCard && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Payment</Text>
            {b.payment_status ? (
              <Text style={twStyle("text-xs text-gray-500 mb-2")}>
                {"Status: " + (
                  b.payment_status === "paid" ? "Paid in full" :
                  b.payment_status === "partially_paid" ? "Partially paid" :
                  b.payment_status === "partially_refunded" ? "Partially refunded" :
                  b.payment_status === "refunded" ? "Refunded" :
                  b.payment_status === "pending" ? "Pending" :
                  b.payment_status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                )}
              </Text>
            ) : null}
            {(typeof b.subtotal === "number" && b.subtotal > 0) ||
            (typeof b.discount_amount === "number" && b.discount_amount > 0) ||
            (typeof (b as { promotion_discount_amount?: number }).promotion_discount_amount === "number" &&
              Number((b as { promotion_discount_amount?: number }).promotion_discount_amount) > 0) ||
            (typeof (b as { membership_discount_amount?: number }).membership_discount_amount === "number" &&
              Number((b as { membership_discount_amount?: number }).membership_discount_amount) > 0) ||
            (typeof (b as { loyalty_discount_amount?: number }).loyalty_discount_amount === "number" &&
              Number((b as { loyalty_discount_amount?: number }).loyalty_discount_amount) > 0) ||
            (typeof b.tax_amount === "number" && b.tax_amount > 0) ||
            (typeof b.service_fee_amount === "number" && b.service_fee_amount > 0) ||
            (typeof b.tip_amount === "number" && b.tip_amount > 0) ||
            (typeof b.travel_fee_amount === "number" && b.travel_fee_amount > 0) ? (
              <View style={twStyle("mb-2 border-b border-gray-100 pb-2")}>
                {typeof b.subtotal === "number" && b.subtotal > 0 ? (
                  <Text style={twStyle("text-sm text-gray-600")}>
                    Subtotal: {b.currency ?? getTenantDefaultCurrency()} {b.subtotal.toLocaleString()}
                  </Text>
                ) : null}
                {typeof b.discount_amount === "number" && b.discount_amount > 0 ? (
                  <Text style={twStyle("text-sm text-green-700 mt-0.5")}>
                    Discount
                    {b.discount_code ? ` (${b.discount_code})` : ""}
                    {b.discount_reason ? ` — ${b.discount_reason}` : ""}: −{b.currency ?? getTenantDefaultCurrency()}{" "}
                    {b.discount_amount.toLocaleString()}
                  </Text>
                ) : null}
                {Number((b as { promotion_discount_amount?: number }).promotion_discount_amount) > 0 ? (
                  <Text style={twStyle("text-sm text-green-700 mt-0.5")}>
                    Promotion: −{b.currency ?? getTenantDefaultCurrency()}{" "}
                    {Number((b as { promotion_discount_amount?: number }).promotion_discount_amount).toLocaleString()}
                  </Text>
                ) : null}
                {Number((b as { membership_discount_amount?: number }).membership_discount_amount) > 0 ? (
                  <Text style={twStyle("text-sm text-green-700 mt-0.5")}>
                    Membership: −{b.currency ?? getTenantDefaultCurrency()}{" "}
                    {Number((b as { membership_discount_amount?: number }).membership_discount_amount).toLocaleString()}
                  </Text>
                ) : null}
                {Number((b as { loyalty_discount_amount?: number }).loyalty_discount_amount) > 0 ? (
                  <Text style={twStyle("text-sm text-green-700 mt-0.5")}>
                    Loyalty: −{b.currency ?? getTenantDefaultCurrency()}{" "}
                    {Number((b as { loyalty_discount_amount?: number }).loyalty_discount_amount).toLocaleString()}
                  </Text>
                ) : null}
                {typeof b.tax_amount === "number" && b.tax_amount > 0 ? (
                  <Text style={twStyle("text-sm text-gray-600 mt-0.5")}>
                    Tax
                    {b.tax_rate != null && Number(b.tax_rate) > 0
                      ? (() => {
                          const tr = Number(b.tax_rate);
                          const pct = tr > 0 && tr <= 1 ? tr * 100 : tr;
                          return ` (${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%)`;
                        })()
                      : ""}
                    : {b.currency ?? getTenantDefaultCurrency()} {b.tax_amount.toLocaleString()}
                  </Text>
                ) : null}
                {typeof b.service_fee_amount === "number" && b.service_fee_amount > 0 ? (
                  <Text style={twStyle("text-sm text-gray-600 mt-0.5")}>
                    Platform fee (customer-paid, retained by platform): {b.currency ?? getTenantDefaultCurrency()}{" "}
                    {b.service_fee_amount.toLocaleString()}
                  </Text>
                ) : null}
                {typeof b.tip_amount === "number" && b.tip_amount > 0 ? (
                  <Text style={twStyle("text-sm text-gray-600 mt-0.5")}>
                    Tip: {b.currency ?? getTenantDefaultCurrency()} {b.tip_amount.toLocaleString()}
                  </Text>
                ) : null}
                {typeof b.travel_fee_amount === "number" && b.travel_fee_amount > 0 ? (
                  <Text style={twStyle("text-sm text-gray-600 mt-0.5")}>
                    Travel: {b.currency ?? getTenantDefaultCurrency()} {b.travel_fee_amount.toLocaleString()}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {totalAmount > 0 && (
              <Text style={twStyle("text-sm text-gray-600")}>
                Customer total: {b.currency ?? getTenantDefaultCurrency()} {totalAmount.toLocaleString()}
              </Text>
            )}
            {typeof b.service_fee_amount === "number" &&
            b.service_fee_amount > 0 &&
            netPaidAfterRefunds > 0 &&
            (b.payment_status ?? "").toLowerCase() === "paid" ? (
              <Text style={twStyle("text-sm font-semibold text-gray-900 mt-1")}>
                Estimated due to you (paid in, after platform fee): {b.currency ?? getTenantDefaultCurrency()}{" "}
                {Math.max(0, netPaidAfterRefunds - b.service_fee_amount).toLocaleString()}
              </Text>
            ) : null}
            {b.deposit_required && b.payment_option === "deposit" && typeof b.deposit_amount === "number" && b.deposit_amount > 0 && (
              <Text style={twStyle("text-sm text-gray-600 mt-0.5")}>
                Deposit{b.deposit_percentage ? ` (${b.deposit_percentage}%)` : ""}:{" "}
                {b.currency ?? getTenantDefaultCurrency()} {b.deposit_amount.toLocaleString()}
              </Text>
            )}
            {/* §Finance-truth 2026-05: wallet/gift are payment instruments, not
                discounts. After migration 582 `total_paid` includes wallet + gift
                via booking_payments — we render the breakdown so providers see
                exactly how the booking was settled (wallet → gift → card/other). */}
            {(() => {
              const walletPaid = Number((b as { wallet_amount?: number }).wallet_amount ?? 0);
              const giftPaid = Number((b as { gift_card_amount?: number }).gift_card_amount ?? 0);
              const otherPaid = Math.max(0, totalPaid - walletPaid - giftPaid);
              const cur = b.currency ?? getTenantDefaultCurrency();
              if (walletPaid <= 0 && giftPaid <= 0 && totalPaid <= 0) return null;
              return (
                <View style={twStyle("mt-1")}>
                  {walletPaid > 0 && (
                    <Text style={twStyle("text-sm text-gray-600")}>
                      Paid (wallet): {cur} {walletPaid.toLocaleString()}
                    </Text>
                  )}
                  {giftPaid > 0 && (
                    <Text style={twStyle("text-sm text-gray-600")}>
                      Paid (gift card): {cur} {giftPaid.toLocaleString()}
                    </Text>
                  )}
                  {otherPaid > 0 && (
                    <Text style={twStyle("text-sm text-gray-600")}>
                      Paid (card / other): {cur} {otherPaid.toLocaleString()}
                    </Text>
                  )}
                  {totalPaid > 0 && (
                    <Text style={twStyle("text-sm font-semibold text-green-600 mt-0.5")}>
                      Total paid: {cur} {totalPaid.toLocaleString()}
                    </Text>
                  )}
                </View>
              );
            })()}
            {totalRefunded > 0 && (
              <Text style={twStyle("text-sm text-orange-700 mt-0.5")}>
                Refunded: {b.currency ?? getTenantDefaultCurrency()} {totalRefunded.toLocaleString()}
              </Text>
            )}
            {outstanding < 0 && (
              <Text style={twStyle("text-sm text-blue-700 mt-0.5")}>
                Credit / overpayment: {b.currency ?? getTenantDefaultCurrency()}{" "}
                {Math.abs(outstanding).toLocaleString()} — no further payment due.
              </Text>
            )}
            {outstanding > 0 && (
              <Text style={twStyle("text-sm font-medium text-amber-600 mt-0.5")}>
                Outstanding: {b.currency ?? getTenantDefaultCurrency()} {outstanding.toLocaleString()}
              </Text>
            )}
            {outstanding > 0 && !paymentExcellenceDismissed && (
              <View
                style={twStyle(
                  "mt-3 rounded-lg border border-emerald-200 bg-emerald-50/90 p-3 flex-row items-start gap-2"
                )}
              >
                <Text style={twStyle("flex-1 text-xs text-emerald-950 leading-5")}>{PROVIDER_ON_PLATFORM_PAYMENT_NUDGE}</Text>
                <TouchableOpacity
                  onPress={() => setPaymentExcellenceDismissed(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss payment tip"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color="#047857" />
                </TouchableOpacity>
              </View>
            )}
            {totalPaid > 0 && outstanding > 0 && (
              <Text style={twStyle("text-xs text-gray-500 mt-1.5")}>
                Part of this booking is already paid. Mark paid, Yoco, or a payment link will only collect the remaining balance.
              </Text>
            )}
            <View style={twStyle("flex-row flex-wrap gap-2 mt-3")}>
              {canMarkPaid && (
                <>
                  <TouchableOpacity
                    onPress={() => setShowMarkPaid(true)}
                    disabled={markingPaid}
                    style={twStyle("rounded-xl bg-green-600 py-2.5 px-4")}
                  >
                    {markingPaid ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={twStyle("font-medium text-white")}>Mark paid</Text>
                    )}
                  </TouchableOpacity>
                  {canCreateSales && yocoEnabled && yocoIntegration?.is_enabled && yocoIntegration?.api_key_set && outstanding > 0 && (
                    <TouchableOpacity
                      onPress={() => void openYocoCheckout()}
                      disabled={preparingYocoSale}
                      style={twStyle("rounded-xl border border-primary bg-primary/10 py-2.5 px-4")}
                    >
                      {preparingYocoSale ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <Text style={twStyle("font-medium text-primary")}>Pay with Yoco</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {paystackTerminalEnabled && outstanding > 0 && (
                    <TouchableOpacity
                      onPress={() => void openPaystackTerminalCollection()}
                      disabled={preparingPaystackTerminal}
                      style={twStyle("rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 px-4")}
                    >
                      {preparingPaystackTerminal ? (
                        <ActivityIndicator size="small" color="#047857" />
                      ) : (
                        <Text style={twStyle("font-medium text-emerald-800")}>Pay with Paystack Terminal</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}
              {canSendPaymentLink && (
                <TouchableOpacity
                  onPress={() => setShowSendPaymentLink(true)}
                  disabled={sendingPaymentLink}
                  style={twStyle("rounded-xl border border-primary py-2.5 px-4")}
                >
                  {sendingPaymentLink ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={twStyle("font-medium text-primary")}>Send payment link</Text>
                  )}
                </TouchableOpacity>
              )}
              {canRequestPayment && (
                <TouchableOpacity
                  onPress={() => setShowRequestPayment(true)}
                  disabled={requestingPayment}
                  style={twStyle("rounded-xl border border-gray-400 py-2.5 px-4")}
                  accessibilityRole="button"
                  accessibilityLabel="Send additional charge"
                >
                  {requestingPayment ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={twStyle("font-medium text-gray-800")}>Send additional charge</Text>
                  )}
                </TouchableOpacity>
              )}
              {canRefund && (
                <TouchableOpacity
                  onPress={() => {
                    setRefundAmount(maxRefundable.toFixed(2));
                    // Provider-taken bookings (walk-in / provider-created) are
                    // usually paid in person, so default to a cash refund;
                    // online bookings default to wallet credit.
                    setRefundMethod(
                      b.booking_source === "online" ? "store_credit" : "cash"
                    );
                    setShowRefund(true);
                  }}
                  style={twStyle("rounded-xl border border-red-300 py-2.5 px-4")}
                >
                  <Text style={twStyle("font-medium text-red-700")}>Refund</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => void shareBookingReceiptSummary()}
                style={twStyle("rounded-xl border border-gray-300 py-2.5 px-4")}
                accessibilityRole="button"
                accessibilityLabel="Share receipt summary"
              >
                <Text style={twStyle("font-medium text-gray-700")}>Share summary</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void openBookingReceiptPdf()}
                style={twStyle("rounded-xl border border-gray-300 py-2.5 px-4")}
                accessibilityRole="button"
                accessibilityLabel="Download PDF receipt"
              >
                <Text style={twStyle("font-medium text-gray-700")}>Download PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/*
          §Provider-launch (audit 2026-04): "Customer Notifications" block,
          mirroring the web detail's P8 panel. Lets the provider manually
          re-send confirmation / reminder emails + SMS, or send a cancellation
          notice when a cancel is being handled out-of-band.
        */}
        {id && b?.customer_id && (() => {
          // Confirmation / reminder only make sense once the provider has confirmed.
          // Showing them for pending/pending_payment is confusing: no confirmation has
          // been sent yet, so there is nothing to "re-send".
          const isConfirmedOrLater = ["confirmed", "booked", "waiting", "checked_in", "in_progress"].includes(currentDbStatus);
          const isCancelledOrNoShow = b.status === "cancelled" || b.status === "no_show";
          const showNotifCard = isConfirmedOrLater || isCancelledOrNoShow;
          if (!showNotifCard) return null;
          return (
            <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>
                Customer notifications
              </Text>
              <View style={twStyle("flex-row flex-wrap gap-2")}>
                {isConfirmedOrLater && (
                  <TouchableOpacity
                    onPress={() => handleResendBookingNotification("confirmation")}
                    disabled={isNotifying}
                    style={twStyle("rounded-xl border border-gray-300 py-2.5 px-4")}
                    accessibilityRole="button"
                    accessibilityLabel="Resend booking confirmation to customer"
                  >
                    {isNotifying ? (
                      <ActivityIndicator size="small" color="#374151" />
                    ) : (
                      <Text style={twStyle("font-medium text-gray-800")}>
                        Re-send confirmation
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
                {isConfirmedOrLater && (
                  <TouchableOpacity
                    onPress={() => handleResendBookingNotification("reminder")}
                    disabled={isNotifying}
                    style={twStyle("rounded-xl border border-gray-300 py-2.5 px-4")}
                    accessibilityRole="button"
                    accessibilityLabel="Send reminder to customer"
                  >
                    {isNotifying ? (
                      <ActivityIndicator size="small" color="#374151" />
                    ) : (
                      <Text style={twStyle("font-medium text-gray-800")}>Send reminder</Text>
                    )}
                  </TouchableOpacity>
                )}
                {isCancelledOrNoShow && (
                  <TouchableOpacity
                    onPress={handleSendCancellationNotice}
                    disabled={isNotifying}
                    style={twStyle("rounded-xl border border-red-300 py-2.5 px-4")}
                    accessibilityRole="button"
                    accessibilityLabel="Send cancellation notice to customer"
                  >
                    {isNotifying ? (
                      <ActivityIndicator size="small" color="#b91c1c" />
                    ) : (
                      <Text style={twStyle("font-medium text-red-700")}>
                        Send cancellation notice
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })()}

        {/* Additional charges */}
        {additionalCharges.length > 0 && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Additional charges</Text>
            {additionalCharges.map((c) => (
              <View key={c.id} style={twStyle("rounded-lg border border-gray-100 bg-gray-50 p-3 mb-2")}>
                <View style={twStyle("flex-row items-center justify-between")}>
                  <View>
                    <Text style={twStyle("font-medium text-gray-900")}>{c.description}</Text>
                    <Text style={twStyle("text-sm text-gray-600")}>
                      {c.currency} {Number(c.amount).toFixed(2)} · {c.status}
                    </Text>
                  </View>
                  {canProcessPayments && (c.status === "pending" || c.status === "approved") && (
                    <View style={twStyle("flex-row items-center gap-2")}>
                      <TouchableOpacity
                        onPress={() => void handleSendChargeToClient(c.id)}
                        disabled={notifyingChargeId === c.id}
                        style={twStyle("rounded-lg border border-primary py-2 px-3")}
                        accessibilityRole="button"
                        accessibilityLabel="Send this charge to the client to pay online"
                      >
                        {notifyingChargeId === c.id ? (
                          <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                          <Text style={twStyle("text-xs font-medium text-primary")}>Send to client</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setChargeMarkPaidId(c.id);
                          setChargeMarkPaidMethod("card");
                        }}
                        disabled={markingChargePaid}
                        style={twStyle("rounded-lg bg-green-600 py-2 px-3")}
                      >
                        {markingChargePaid && chargeMarkPaidId === c.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={twStyle("text-xs font-medium text-white")}>Mark paid</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {services.length > 0 && (
          <View style={twStyle("mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Services</Text>
            {services.map((s, i) => (
              <View key={i} style={twStyle("rounded-xl border border-gray-200 bg-white p-3 mb-2")}>
                <Text style={twStyle("font-medium text-gray-900")}>
                  {s.offering_name ?? "Service"}
                  {s.guest_name ? ` · ${s.guest_name}` : ""}
                </Text>
                {s.staff_name && (
                  <Text style={twStyle("text-sm text-gray-500")}>{s.staff_name}</Text>
                )}
                {s.scheduled_start_at && (
                  <Text style={twStyle("text-xs text-gray-500 mt-1")}>
                    {formatTimeSafe(s.scheduled_start_at, b.display_time_zone ?? providerTimezone)}
                    {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
                  </Text>
                )}
                {typeof s.price === "number" && (
                  <Text style={twStyle("text-sm text-gray-600 mt-1")}>
                    {b.currency ?? getTenantDefaultCurrency()} {s.price.toLocaleString()}
                  </Text>
                )}
              </View>
            ))}
            {b.custom_offer && (
              <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50 p-3 mt-1")}>
                <Text style={twStyle("text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2")}>Custom Offer Details</Text>
                {b.custom_offer.request?.description && (
                  <Text style={twStyle("text-sm text-gray-600 mb-1")}>
                    <Text style={twStyle("font-medium text-gray-800")}>Request:</Text> {b.custom_offer.request.description}
                  </Text>
                )}
                {b.custom_offer.notes && (
                  <Text style={twStyle("text-sm text-gray-600")}>
                    <Text style={twStyle("font-medium text-gray-800")}>Notes:</Text> {b.custom_offer.notes}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {(b.products?.length ?? 0) > 0 && (
          <View style={twStyle("mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Products</Text>
            {(b.products ?? []).map((p, i) => {
              const vLabel = formatProductVariantLabel(p.product_variant);
              return (
                <View key={p.id ?? `prod-${i}`} style={twStyle("rounded-xl border border-gray-200 bg-white p-3 mb-2")}>
                  <Text style={twStyle("font-medium text-gray-900")}>{p.product_name ?? "Product"}</Text>
                  {vLabel ? <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>{vLabel}</Text> : null}
                  <Text style={twStyle("text-sm text-gray-600 mt-1")}>
                    Qty {p.quantity ?? 1}
                    {typeof p.unit_price === "number"
                      ? ` · ${b.currency ?? getTenantDefaultCurrency()} ${p.unit_price.toLocaleString()} ea`
                      : ""}
                  </Text>
                  {typeof p.total_price === "number" ? (
                    <Text style={twStyle("text-sm font-medium text-gray-900 mt-1")}>
                      {b.currency ?? getTenantDefaultCurrency()} {p.total_price.toLocaleString()}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            {b.payment_status ? (
              <Text style={twStyle("text-xs text-gray-500 mt-1 mb-2")}>
                Appointment payment: {(b.payment_status ?? "pending").replace(/_/g, " ")}
                {b.payment_status === "paid" ? " — product payment is on this booking" : ""}
              </Text>
            ) : null}
            {appointmentProductOrders.length > 0 ? (
              <>
                {appointmentProductOrders.length > 1 ? (
                  <Text style={twStyle("text-xs font-medium text-amber-900 mt-1 mb-1")}>
                    {appointmentProductOrders.length} product orders linked to this visit
                  </Text>
                ) : null}
                {appointmentProductOrders.map((ord) => {
                  const fulfillmentLabel = appointmentProductFulfillmentLabel(ord.status);
                  const isTerminal = isTerminalProductOrderStatus(ord.status);
                  const isCollection = isCollectionFulfillment(ord.fulfillment_type);
                  const isCollecting = collectingProductOrderId === ord.id;
                  return (
                    <View
                      key={ord.id}
                      style={twStyle("mt-1 rounded-xl border border-amber-200 bg-amber-50 p-3")}
                    >
                      <View style={twStyle("flex-row items-start justify-between")}>
                        <View style={twStyle("flex-1 pr-3")}>
                          <Text style={twStyle("text-sm font-semibold text-amber-950")}>
                            {isCollection ? "Product pickup" : "Product delivery"}
                          </Text>
                          <Text style={twStyle("text-xs text-amber-800 mt-0.5")}>
                            {ord.order_number ?? "Product order"} · {fulfillmentLabel}
                          </Text>
                          {(ord.payment_status ?? "").toLowerCase() === "paid" ? (
                            <Text style={twStyle("text-xs text-emerald-800 mt-0.5")}>Paid on appointment</Text>
                          ) : null}
                        </View>
                      </View>
                      {!isTerminal ? (
                        isCollection ? (
                          <TouchableOpacity
                            onPress={() => void handleMarkProductCollected(ord.id)}
                            disabled={isCollecting || patchLoading}
                            style={twStyle(
                              `mt-2 flex-row items-center justify-center rounded-lg bg-amber-900 px-3 py-2${isCollecting || patchLoading ? " opacity-60" : ""}`,
                            )}
                            accessibilityRole="button"
                            accessibilityLabel="Mark product collected"
                          >
                            {isCollecting ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={twStyle("text-sm font-semibold text-white")}>Mark collected</Text>
                            )}
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() =>
                              router.push(
                                `/(app)/(tabs)/more/product-orders?order=${encodeURIComponent(ord.id)}` as never,
                              )
                            }
                            style={twStyle("mt-2 flex-row items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2")}
                            accessibilityRole="button"
                            accessibilityLabel="Manage delivery and tracking"
                          >
                            <Text style={twStyle("text-sm font-semibold text-amber-900")}>
                              Manage delivery & tracking
                            </Text>
                          </TouchableOpacity>
                        )
                      ) : null}
                    </View>
                  );
                })}
              </>
            ) : (
              <TouchableOpacity
                onPress={() => void handlePrepareProductFulfillment()}
                disabled={preparingFulfillment || patchLoading}
                style={twStyle(
                  `mt-2 flex-row items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2.5${preparingFulfillment || patchLoading ? " opacity-60" : ""}`,
                )}
                accessibilityRole="button"
                accessibilityLabel="Prepare product fulfillment"
              >
                {preparingFulfillment ? (
                  <ActivityIndicator size="small" color="#92400e" />
                ) : (
                  <Text style={twStyle("text-sm font-medium text-amber-900")}>Prepare fulfillment</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {bookingResources.length > 0 && (
          <View style={twStyle("mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Resources</Text>
            {bookingResources.map((r) => (
              <View key={r.id} style={twStyle("rounded-xl border border-gray-200 bg-white px-3 py-2 mb-2")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>{r.resource_name}</Text>
                {r.resource_group_name ? (
                  <Text style={twStyle("text-xs text-gray-500")}>{r.resource_group_name}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* Notes / Special requests (editable) */}
        <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50 p-3 mb-3")}>
          <View style={twStyle("flex-row items-center justify-between mb-2")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>Notes / Special requests</Text>
            {!editingNotes && canEditAppointments ? (
              <TouchableOpacity
                onPress={() => {
                  setNotesText(b.special_requests ?? "");
                  setEditingNotes(true);
                }}
              >
                <Text style={twStyle("text-sm font-medium text-primary")}>Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {editingNotes ? (
            <View>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 min-h-[80px]")}
                placeholder="Notes or special requests..."
                placeholderTextColor="#9ca3af"
                value={notesText}
                onChangeText={setNotesText}
                multiline
                textAlignVertical="top"
              />
              <View style={twStyle("flex-row gap-2 mt-2")}>
                <TouchableOpacity
                  onPress={handleSaveNotes}
                  disabled={savingNotes}
                  style={twStyle("rounded-lg bg-primary py-2 px-4")}
                >
                  {savingNotes ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={twStyle("text-sm font-medium text-white")}>Save</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setEditingNotes(false);
                    setNotesText(b.special_requests ?? "");
                  }}
                  style={twStyle("rounded-lg border border-gray-300 py-2 px-4")}
                >
                  <Text style={twStyle("text-sm font-medium text-gray-700")}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={twStyle("text-sm text-gray-600")}>
              {b.special_requests?.trim() || "No notes"}
            </Text>
          )}
        </View>
      </ScrollView>

      <BookingEditSheet
        visible={showEditAppointment}
        booking={{
          scheduled_at: b.scheduled_at,
          special_requests: b.special_requests,
          discount_amount: b.discount_amount,
          discount_reason: b.discount_reason,
          promotion_discount_amount: b.promotion_discount_amount,
          membership_discount_amount: b.membership_discount_amount,
          loyalty_discount_amount: b.loyalty_discount_amount,
          tax_rate: b.tax_rate,
          travel_fee: b.travel_fee_amount ?? (b as { travel_fee?: number }).travel_fee,
          tip_amount: b.tip_amount,
          service_fee_amount: b.service_fee_amount,
          location_id: b.location_id,
          version: b.version,
          services: b.services,
          products: b.products?.map((p) => ({
            product_id: p.product_id,
            product_name: p.product_name,
            product_variant_id: (p as { product_variant_id?: string | null }).product_variant_id,
            product_variant:
              p.product_variant && typeof p.product_variant === "object"
                ? (p.product_variant as { option_values?: unknown })
                : null,
            quantity: p.quantity,
            unit_price: p.unit_price,
          })),
        }}
        onClose={() => setShowEditAppointment(false)}
        onSave={handleSaveAppointmentEdit}
      />

      {/* Reschedule modal */}
      <BottomSheet
        visible={showReschedule}
        onClose={() => setShowReschedule(false)}
        title="Reschedule"
      >
        <View>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Date</Text>
          <View style={twStyle("mb-3")}>
            <BookingDateStrip selectedDate={rescheduleDate} onSelectDate={setRescheduleDate} />
          </View>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Time</Text>
          <BookingTimeSlotGrid
            rows={rescheduleTimeRows}
            selectedTime={rescheduleTime}
            onSelectTime={setRescheduleTime}
            loading={rescheduleSlotsLoading}
            providerTimezone={rescheduleSlotsTimezone}
            layout="wrap"
            maxHeight={220}
          />
          <ActionButton
            label={rescheduling ? "Rescheduling…" : "Confirm reschedule"}
            onPress={handleReschedule}
            loading={rescheduling}
            disabled={!rescheduleTime}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* Mark paid modal */}
      <BottomSheet visible={showMarkPaid} onClose={() => setShowMarkPaid(false)} title="Mark as paid">
        <View>
          {Math.abs(yocoTerminalAmount - outstanding) > 0.01 ? (
            <>
              <Text style={twStyle("text-sm text-gray-600 mb-1")}>
                Full balance: {b.currency ?? getTenantDefaultCurrency()} {outstanding.toFixed(2)}
              </Text>
              <Text style={twStyle("text-sm font-medium text-gray-900 mb-2")}>
                This payment: {b.currency ?? getTenantDefaultCurrency()} {yocoTerminalAmount.toFixed(2)}
                {depositTarget != null ? " (deposit due)" : ""}
              </Text>
            </>
          ) : (
            <Text style={twStyle("text-sm text-gray-600 mb-2")}>
              Outstanding: {b.currency ?? getTenantDefaultCurrency()} {outstanding.toFixed(2)}
            </Text>
          )}
          {totalPaid > 0 ? (
            <Text style={twStyle("text-xs text-gray-500 mb-2")}>
              This records another payment toward the booking (e.g. after cash, EFT, or Paystack). Only the remaining balance is applied.
            </Text>
          ) : null}
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Payment method</Text>
          <View style={twStyle("flex-row flex-wrap gap-2 mb-4")}>
            {markPaidPaymentMethods.map((pm) => (
              <TouchableOpacity
                key={pm.value}
                onPress={() => setMarkPaidMethod(pm.value)}
                style={[twStyle("rounded-xl py-2.5 px-4"), markPaidMethod === pm.value ? twStyle("bg-gray-900") : twStyle("border border-gray-200 bg-white")]}
              >
                <Text style={twStyle(`text-sm font-medium ${markPaidMethod === pm.value ? "text-white" : "text-gray-700"}`)}>{pm.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ActionButton label={markingPaid ? "Processing…" : "Confirm payment"} onPress={handleMarkPaid} loading={markingPaid} fullWidth />
        </View>
      </BottomSheet>

      {/* Refund modal */}
      <BottomSheet visible={showRefund} onClose={() => { setShowRefund(false); setRefundReason(""); }} title="Issue refund">
        <View>
          <Text style={twStyle("text-sm text-gray-600 mb-1")}>
            Net collected: {b.currency ?? getTenantDefaultCurrency()} {netPaidAfterRefunds.toFixed(2)}
            {totalRefunded > 0 ? ` (paid ${totalPaid.toFixed(2)}, refunded ${totalRefunded.toFixed(2)})` : ""}
          </Text>
          <Text style={twStyle("text-xs text-gray-500 mb-2")}>
            Maximum refund now: {b.currency ?? getTenantDefaultCurrency()} {maxRefundable.toFixed(2)}. Refunds increase what the client may still owe on this booking.
          </Text>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Refund amount</Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 mb-4")}
            placeholder="0.00"
            placeholderTextColor="#9ca3af"
            value={refundAmount}
            onChangeText={setRefundAmount}
            keyboardType="decimal-pad"
          />
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Reason (required)</Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 mb-4 min-h-[80px]")}
            placeholder="e.g. Customer requested, service not completed…"
            placeholderTextColor="#9ca3af"
            value={refundReason}
            onChangeText={setRefundReason}
            multiline
            textAlignVertical="top"
          />
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Refund method</Text>
          <View style={twStyle("flex-row rounded-xl border border-gray-200 bg-gray-50 p-1 mb-2")}>
            {([
              { key: "cash" as const, label: "In person (cash)" },
              { key: "store_credit" as const, label: "Wallet credit" },
            ]).map((opt) => {
              const active = refundMethod === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setRefundMethod(opt.key)}
                  style={twStyle(`flex-1 items-center rounded-lg px-3 py-2 ${active ? "bg-white" : ""}`)}
                >
                  <Text style={twStyle(`text-sm font-medium ${active ? "text-indigo-600" : "text-gray-500"}`)}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={twStyle("text-xs text-gray-500 mb-3")}>
            {refundMethod === "cash"
              ? "Hand the money back to the customer in person. Recorded for your books; no wallet credit is issued. The booking balance updates after this succeeds."
              : "The refund amount will be credited to the customer's wallet balance. The booking balance will update after this succeeds."}
          </Text>
          <ActionButton label={refunding ? "Processing…" : "Confirm refund"} onPress={handleRefund} loading={refunding} fullWidth />
        </View>
      </BottomSheet>

      {/* Send additional charge (POST request-payment) */}
      <BottomSheet
        visible={showRequestPayment}
        onClose={() => { setShowRequestPayment(false); setRequestPaymentDescription(""); setRequestPaymentAmount(""); }}
        title="Send additional charge"
      >
        <View>
          <Text style={twStyle("text-sm text-gray-600 mb-2")}>
            Creates a pending line item and notifies the customer. They can pay online, or you can mark it paid later.
          </Text>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Description</Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 mb-3")}
            placeholder="e.g. Extra product, travel fee"
            placeholderTextColor="#9ca3af"
            value={requestPaymentDescription}
            onChangeText={setRequestPaymentDescription}
          />
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Amount ({b.currency ?? getTenantDefaultCurrency()})</Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 mb-4")}
            placeholder="0.00"
            placeholderTextColor="#9ca3af"
            value={requestPaymentAmount}
            onChangeText={setRequestPaymentAmount}
            keyboardType="decimal-pad"
          />
          <ActionButton
            label={requestingPayment ? "Sending…" : "Send additional charge"}
            onPress={handleRequestPayment}
            loading={requestingPayment}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* Send payment link */}
      <BottomSheet
        visible={showSendPaymentLink}
        onClose={() => setShowSendPaymentLink(false)}
        title="Send payment link"
      >
        <View>
          <Text style={twStyle("text-sm text-gray-600 mb-3")}>
            Send a link to the customer so they can pay online (Paystack). Outstanding: {b.currency ?? getTenantDefaultCurrency()} {outstanding.toFixed(2)}
          </Text>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Send via</Text>
          <View style={twStyle("flex-row flex-wrap gap-2 mb-4")}>
            {SEND_LINK_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setSendPaymentLinkMethod(opt.value)}
                style={[twStyle("rounded-xl py-2.5 px-4"), sendPaymentLinkMethod === opt.value ? twStyle("bg-primary") : twStyle("border border-gray-200 bg-white")]}
              >
                <Text style={twStyle(`text-sm font-medium ${sendPaymentLinkMethod === opt.value ? "text-white" : "text-gray-700"}`)}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ActionButton
            label={sendingPaymentLink ? "Sending…" : "Send link"}
            onPress={handleSendPaymentLink}
            loading={sendingPaymentLink}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* Mark additional charge as paid */}
      <BottomSheet
        visible={!!chargeMarkPaidId}
        onClose={() => { setChargeMarkPaidId(null); }}
        title="Mark charge as paid"
      >
        <View>
          {chargeMarkPaidId && (() => {
            const c = additionalCharges.find((x) => x.id === chargeMarkPaidId);
            if (!c) return null;
            return (
              <>
                <Text style={twStyle("text-sm text-gray-600 mb-2")}>
                  {c.description} · {c.currency} {Number(c.amount).toFixed(2)}
                </Text>
                <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Payment method</Text>
                <View style={twStyle("flex-row flex-wrap gap-2 mb-4")}>
                  {PAYMENT_METHODS_CHARGE.map((pm) => (
                    <TouchableOpacity
                      key={pm.value}
                      onPress={() => setChargeMarkPaidMethod(pm.value)}
                      style={[twStyle("rounded-xl py-2.5 px-4"), chargeMarkPaidMethod === pm.value ? twStyle("bg-gray-900") : twStyle("border border-gray-200 bg-white")]}
                    >
                      <Text style={twStyle(`text-sm font-medium ${chargeMarkPaidMethod === pm.value ? "text-white" : "text-gray-700"}`)}>{pm.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <ActionButton
                  label={markingChargePaid ? "Processing…" : "Confirm"}
                  onPress={handleChargeMarkPaid}
                  loading={markingChargePaid}
                  fullWidth
                />
              </>
            );
          })()}
        </View>
      </BottomSheet>

      {/* Yoco: pending POS sale → terminal (sale_id + booking_id) → complete sale + mark booking paid */}
      <YocoPaymentSheet
        visible={showYocoPayment}
        onClose={() => setShowYocoPayment(false)}
        amountCents={Math.round(yocoTerminalAmount * 100)}
        currency={b.currency ?? getTenantDefaultCurrency()}
        bookingId={id}
        saleId={yocoBookingSaleId ?? undefined}
        bookingLocationId={b.location_id ?? null}
        description={`Booking ${b.booking_number ?? id}`}
        onPaymentSuccess={(result) => void finalizeYocoBookingPayment(result)}
      />

      <BottomSheet
        visible={!!paystackTerminalPrompt}
        onClose={() => setPaystackTerminalPrompt(null)}
        title="Paystack Terminal"
      >
        {paystackTerminalPrompt ? (
          <View>
            <Text style={twStyle("text-sm text-gray-600 mb-3")}>
              Ask the customer to pay using this Paystack link. Paystack will generate the transaction reference; after the webhook arrives, allocate the payment from your terminal inbox.
            </Text>
            <View style={twStyle("rounded-2xl border border-emerald-200 bg-emerald-50 p-4 mb-3")}>
              <Text style={twStyle("text-xs uppercase tracking-wide text-emerald-700")}>Terminal code</Text>
              <Text style={twStyle("mt-2 font-mono text-2xl font-semibold text-emerald-950")}>
                {paystackTerminalPrompt.code}
              </Text>
              <Text style={twStyle("mt-2 text-sm text-emerald-800")}>
                Expected: {b.currency ?? getTenantDefaultCurrency()} {paystackTerminalPrompt.expectedAmount.toFixed(2)}
              </Text>
              {paystackTerminalPrompt.reference ? (
                <Text style={twStyle("mt-1 text-sm text-emerald-800")}>
                  Booking/order note: {paystackTerminalPrompt.reference}
                </Text>
              ) : null}
            </View>
            <View style={twStyle("flex-row gap-2")}>
              <TouchableOpacity
                onPress={() => {
                  void Share.share({
                    title: "Paystack Terminal",
                    message: paystackTerminalPrompt.link
                      ? `Pay ${b.currency ?? getTenantDefaultCurrency()} ${paystackTerminalPrompt.expectedAmount.toFixed(2)} using this Paystack Terminal link: ${paystackTerminalPrompt.link}${paystackTerminalPrompt.reference ? ` Note: ${paystackTerminalPrompt.reference}` : ""}`
                      : `Pay ${b.currency ?? getTenantDefaultCurrency()} ${paystackTerminalPrompt.expectedAmount.toFixed(2)} using Paystack Terminal code ${paystackTerminalPrompt.code}${paystackTerminalPrompt.reference ? `. Note: ${paystackTerminalPrompt.reference}` : ""}.`,
                  });
                }}
                style={twStyle("flex-1 rounded-xl bg-emerald-600 px-3 py-3")}
              >
                <Text style={twStyle("text-center font-semibold text-white")}>Share</Text>
              </TouchableOpacity>
              {paystackTerminalPrompt.link ? (
                <TouchableOpacity
                  onPress={() => void Linking.openURL(paystackTerminalPrompt.link || "")}
                  style={twStyle("flex-1 rounded-xl border border-emerald-600 px-3 py-3")}
                >
                  <Text style={twStyle("text-center font-semibold text-emerald-700")}>Open link</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </BottomSheet>

      {/* Provider post-completion modal: once per booking when opening a completed booking */}
      <Modal
        visible={false}
        animationType="fade"
        transparent
        onRequestClose={() => dismissProviderCompletionModal(true)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}
          onPress={() => dismissProviderCompletionModal(true)}
        >
          <Pressable
            style={{ backgroundColor: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360 }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="trophy" size={32} color={Colors.primary} />
              </View>
            </View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], textAlign: "center", marginBottom: 8 }}>Booking complete</Text>
            <Text style={{ fontSize: 15, color: Colors.gray[600], textAlign: "center", marginBottom: 12 }}>
              Great work. This booking is complete.
            </Text>
            {(() => {
              const raw = b?.provider_points_earned;
              const pointsNum = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
              return pointsNum > 0 ? (
                <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.primary, textAlign: "center", marginBottom: 12 }}>
                  You earned {pointsNum} points. {"They've been added to your balance."}
                </Text>
              ) : (
                <Text style={{ fontSize: 14, color: Colors.gray[500], textAlign: "center", marginBottom: 12 }}>
                  You earn points for each completed booking—keep going to unlock badges.
                </Text>
              );
            })()}
            <Text style={{ fontSize: 14, color: Colors.gray[600], textAlign: "center", marginBottom: 8 }}>
              Share this booking to Explore and earn reward points.
            </Text>
            <Text style={{ fontSize: 13, color: Colors.gray[500], textAlign: "center", marginBottom: 20 }}>
              Your client can leave a review. Reviews help you get more bookings and earn extra points.
            </Text>
            {hasProviderClientRating !== true ? (
              <TouchableOpacity
                onPress={() => {
                  dismissProviderCompletionModal(true);
                  setTimeout(() => {
                    setShowRateClientSheet(true);
                  }, 400);
                }}
                style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 10 }}
                activeOpacity={0.8}
              >
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Rate this client</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => {
                dismissProviderCompletionModal(true);
                router.push("/(app)/(tabs)/more/explore-posts?create=1" as never);
              }}
              style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 16, alignItems: "center", marginBottom: 10 }}
              activeOpacity={0.8}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Post to Explore</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => dismissProviderCompletionModal(true)}
              style={{ paddingVertical: 14, alignItems: "center" }}
              activeOpacity={0.8}
            >
              <Text style={{ color: Colors.gray[600], fontWeight: "500", fontSize: 15 }}>Maybe later</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Change status: lists allowed DB transitions (matches provider web PATCH rules).
          For at-home, salon-only states (checked_in, waiting) are filtered out by the action
          policy so the picker offers only options that fit the house-call flow.
          The journey itself (Start journey / Mark arrived / Verify / Start service) lives
          in the dedicated Journey card below — this modal is for cancellations, no-shows,
          recovery from a stuck salon-only state, and at-salon physical check-in. */}
      <Modal
        visible={showStatusPicker}
        animationType="fade"
        transparent
        onRequestClose={() => setShowStatusPicker(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}
          onPress={() => setShowStatusPicker(false)}
        >
          <Pressable
            style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 360, maxHeight: "70%" }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>
              {isAtHome ? "Booking actions" : "Change status"}
            </Text>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>
              Current: {labelForDbStatus(currentDbStatus)}
            </Text>
            {isAtHome ? (
              <Text style={{ fontSize: 12, color: Colors.gray[600], marginBottom: 16, lineHeight: 18 }}>
                For house calls, use{" "}
                <Text style={{ fontWeight: "600", color: Colors.gray[800] }}>Start journey</Text>,{" "}
                <Text style={{ fontWeight: "600", color: Colors.gray[800] }}>Mark arrived</Text>, verify the PIN/QR,
                then <Text style={{ fontWeight: "600", color: Colors.gray[800] }}>Start service</Text> in the Journey
                card (or pick In progress here — same action). Below: cancellations and no-shows.
              </Text>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {allowedStatusTargets.map((target) => {
                const destructive = target === "cancelled";
                const isRecoveryTarget =
                  isAtHome &&
                  target === "confirmed" &&
                  (currentDbStatus === "checked_in" || currentDbStatus === "waiting");
                const label = isRecoveryTarget
                  ? "Reset to confirmed (restart journey)"
                  : labelForDbStatus(target);
                return (
                  <TouchableOpacity
                    key={target}
                    onPress={() => void applyDbStatusTransition(target)}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 4,
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.gray[100],
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color: destructive ? "#dc2626" : isRecoveryTarget ? Colors.primary : Colors.gray[900],
                      }}
                    >
                      {label}
                    </Text>
                    {isRecoveryTarget ? (
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>
                        Returns to confirmed so you can start the journey.
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setShowStatusPicker(false)}
              style={{ paddingVertical: 14, alignItems: "center", marginTop: 8 }}
              activeOpacity={0.8}
            >
              <Text style={{ color: Colors.gray[600], fontWeight: "500", fontSize: 15 }}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Override arrival verification modal (cross-platform replacement for Alert.prompt) */}
      <Modal
        visible={showOverrideArrivalModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowOverrideArrivalModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}
          onPress={() => setShowOverrideArrivalModal(false)}
        >
          <Pressable
            style={{ backgroundColor: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360 }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>
              {"Customer can't verify"}
            </Text>
            <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12 }}>
              {"Tell us why you're marking arrival as verified without the customer's code. Your current location is recorded for audit."}
            </Text>
            <View style={{ gap: 8, marginBottom: 16 }}>
              {([
                { code: "customer_no_phone", label: "Customer has no phone / can't open app" },
                { code: "customer_technical_issue", label: "App or code not working for customer" },
                { code: "customer_refused", label: "Customer declined to verify" },
                { code: "other", label: "Other (describe below)" },
              ] as const).map((opt) => {
                const selected = overrideReasonCode === opt.code;
                return (
                  <TouchableOpacity
                    key={opt.code}
                    onPress={() => setOverrideReasonCode(opt.code)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: selected ? "#d97706" : Colors.gray[200],
                      backgroundColor: selected ? "#fffbeb" : Colors.gray[50],
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: selected ? "#d97706" : Colors.gray[300],
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selected ? (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#d97706" }} />
                      ) : null}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: Colors.gray[800] }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              value={overrideArrivalReason}
              onChangeText={setOverrideArrivalReason}
              placeholder={
                overrideReasonCode === "other"
                  ? "Describe what happened (required)…"
                  : "Add any extra detail (optional)…"
              }
              placeholderTextColor={Colors.gray[400]}
              multiline
              numberOfLines={3}
              style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, padding: 12, fontSize: 15, color: Colors.gray[900], backgroundColor: Colors.gray[50], textAlignVertical: "top", minHeight: 80 }}
            />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => setShowOverrideArrivalModal(false)}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], alignItems: "center" }}
              >
                <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={
                  isOverridingArrival ||
                  (overrideReasonCode === "other" && !overrideArrivalReason.trim())
                }
                onPress={submitOverrideArrivalVerification}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  backgroundColor:
                    isOverridingArrival ||
                    (overrideReasonCode === "other" && !overrideArrivalReason.trim())
                      ? Colors.gray[300]
                      : "#d97706",
                }}
              >
                <Text style={{ fontWeight: "600", color: "#fff" }}>
                  {isOverridingArrival ? "Saving…" : "Confirm override"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cancel booking modal (cross-platform replacement for Alert.prompt) */}
      <Modal
        visible={showCancelModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCancelModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}
          onPress={() => setShowCancelModal(false)}
        >
          <Pressable
            style={{ backgroundColor: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360 }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>Cancel Booking</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 16 }}>Please provide a reason for cancellation:</Text>
            <TextInput
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Reason for cancellation…"
              placeholderTextColor={Colors.gray[400]}
              multiline
              numberOfLines={3}
              style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, padding: 12, fontSize: 15, color: Colors.gray[900], backgroundColor: Colors.gray[50], textAlignVertical: "top", minHeight: 80 }}
            />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => setShowCancelModal(false)}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], alignItems: "center" }}
              >
                <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={patchLoading}
                onPress={async () => {
                  setOptimisticBookingStatus(optimisticBookingFieldsForDbTarget("cancelled"));
                  const version = (b as BookingDetail & { version?: number }).version;
                  const { error: err } = await patchMutation(`/api/provider/bookings/${id}`, {
                    status: "cancelled",
                    cancellation_reason: cancelReason.trim() || "No reason provided",
                    ...(version !== undefined && { version }),
                  });
                  // Close modal only after the PATCH completes so the user can retry on failure
                  if (err) {
                    setOptimisticBookingStatus(null);
                    if (isConflictError(err)) {
                      setShowCancelModal(false);
                      Alert.alert(
                        "Conflict",
                        "This booking was modified by another user. Please refresh and try again.",
                        [{ text: "Dismiss", style: "cancel" }, { text: "Refresh", onPress: () => refresh() }]
                      );
                    } else {
                      Alert.alert("Error", err);
                    }
                    return;
                  }
                  setOptimisticBookingStatus(null);
                  setShowCancelModal(false);
                  await refresh();
                }}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: patchLoading ? "#f87171" : "#dc2626", alignItems: "center" }}
              >
                {patchLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ fontWeight: "600", color: "#fff" }}>Cancel Booking</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rate this client sheet (after completion modal CTA) */}
      <BottomSheet
        visible={showRateClientSheet}
        onClose={() => {
          setShowRateClientSheet(false);
          setRateClientStars(0);
          setRateClientComment("");
        }}
        title="Rate this client"
        snapHeight="full"
      >
        <View style={twStyle("p-4")}>
          <Text style={twStyle("text-sm text-gray-600 mb-3")}>
            How was your experience with this client? You can submit a rating as soon as the booking is completed or marked
            no-show — the customer does not need to leave a review first.
          </Text>
          <View style={twStyle("flex-row justify-center gap-2 mb-4")}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setRateClientStars(star);
                }}
                style={twStyle("p-2")}
              >
                <Ionicons
                  name={rateClientStars >= star ? "star" : "star-outline"}
                  size={36}
                  color={rateClientStars >= star ? "#EAB308" : Colors.gray[400]}
                />
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            placeholder="Optional comment (e.g. punctual, great communication)"
            placeholderTextColor={Colors.gray[400]}
            value={rateClientComment}
            onChangeText={setRateClientComment}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            style={twStyle("border border-gray-200 rounded-lg p-3 text-gray-900 mb-4 min-h-[80px]")}
          />
          <ActionButton
            label={submittingRateClient ? "Submitting…" : "Submit rating"}
            onPress={handleRateClientSubmit}
            loading={submittingRateClient}
            disabled={submittingRateClient || rateClientStars < 1}
          />
        </View>
      </BottomSheet>

      {/* Customer profile (view from booking) */}
      <BottomSheet
        visible={showCustomerProfile}
        onClose={() => { setShowCustomerProfile(false); setCustomerProfile(null); }}
        title="Customer profile"
        snapHeight="half"
      >
        {loadingCustomerProfile ? (
          <View style={twStyle("py-8 items-center")}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : customerProfile ? (
          <View style={twStyle("pb-4")}>
            <View style={twStyle("flex-row items-center mb-4")}>
              <Avatar
                name={customerProfile.customer.full_name ?? "Customer"}
                imageUrl={customerProfile.customer.avatar_url}
                size="xl"
              />
              <View style={twStyle("ml-4 flex-1")}>
                <Text style={twStyle("text-lg font-semibold text-gray-900")}>{customerProfile.customer.full_name ?? "Customer"}</Text>
                {customerProfile.customer.email ? (
                  <Text style={twStyle("text-sm text-gray-600")}>{customerProfile.customer.email}</Text>
                ) : null}
                {customerProfile.customer.phone ? (
                  <Text style={twStyle("text-sm text-gray-600")}>{customerProfile.customer.phone}</Text>
                ) : null}
              </View>
            </View>
            {customerProfile.profile && Object.keys(customerProfile.profile).length > 0 ? (
              <View style={twStyle("mb-4")}>
                <Text style={twStyle("text-xs font-semibold text-gray-500 uppercase mb-2")}>Profile details</Text>
                <View style={twStyle("rounded-lg border border-gray-200 bg-gray-50 p-3")}>
                  {Object.entries(customerProfile.profile).map(([key, value]) => (
                    value != null && value !== "" && key !== "user_id" ? (
                      <View key={key} style={twStyle("flex-row justify-between py-1.5 border-b border-gray-100")}>
                        <Text style={twStyle("text-sm text-gray-600")}>{key.replace(/_/g, " ")}</Text>
                        <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={2}>{String(value)}</Text>
                      </View>
                    ) : null
                  ))}
                </View>
              </View>
            ) : null}
            {(b.custom_field_values && Object.keys(b.custom_field_values).length > 0) || (b.provider_form_responses && Object.keys(b.provider_form_responses).length > 0) ? (
              <View style={twStyle("mb-4")}>
                <Text style={twStyle("text-xs font-semibold text-gray-500 uppercase mb-2")}>Answers for this booking</Text>
                <View style={twStyle("rounded-lg border border-gray-200 bg-amber-50/50 p-3")}>
                  {b.custom_field_values ? Object.entries(b.custom_field_values).map(([key, value]) => (
                    value != null && value !== "" ? (
                      <View key={key} style={twStyle("flex-row justify-between py-1.5 border-b border-amber-100")}>
                        <Text style={twStyle("text-sm text-gray-600")}>{key.replace(/_/g, " ")}</Text>
                        <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={2}>{String(value)}</Text>
                      </View>
                    ) : null
                  )) : null}
                  {b.provider_form_responses ? Object.entries(b.provider_form_responses).map(([formId, answers]) =>
                    typeof answers === "object" && answers !== null ? (
                      <View key={formId}>
                        {Object.entries(answers as Record<string, unknown>)
                          .filter(([k]) => k !== "_consent_document_url")
                          .map(([fieldId, val]) => (
                            val != null && val !== "" ? (
                              <View key={`${formId}-${fieldId}`} style={twStyle("flex-row justify-between py-1.5 border-b border-amber-100")}>
                                <Text style={twStyle("text-sm text-gray-600")}>{String(fieldId).replace(/_/g, " ")}</Text>
                                <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={2}>{String(val)}</Text>
                              </View>
                            ) : null
                          ))}
                        {(answers as Record<string, unknown>)._consent_document_url ? (
                          <TouchableOpacity
                            style={twStyle("mt-2 flex-row items-center")}
                            onPress={() =>
                              pushInAppBrowser(
                                router,
                                String((answers as Record<string, unknown>)._consent_document_url),
                                "Consent",
                              )
                            }
                          >
                            <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                            <Text style={twStyle("ml-1 text-sm font-medium text-primary")}>View consent document</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={twStyle("mt-1 flex-row items-center")}
                          onPress={() => handleUploadConsentDocument(formId)}
                          disabled={uploadingConsentFormId === formId}
                        >
                          <Ionicons name="cloud-upload-outline" size={16} color="#6b7280" />
                          <Text style={twStyle("ml-1 text-sm font-medium text-gray-600")}>
                            {(answers as Record<string, unknown>)._consent_document_url ? "Replace" : "Upload"} consent document
                          </Text>
                          {uploadingConsentFormId === formId && <ActivityIndicator size="small" style={{ marginLeft: 8 }} />}
                        </TouchableOpacity>
                      </View>
                    ) : null
                  ) : null}
                </View>
              </View>
            ) : null}
            <Text style={twStyle("text-xs text-gray-500 mb-2")}>
              {customerProfile.bookings?.length ?? 0} booking(s) with you
              {(customerProfile.reviews?.length ?? 0) > 0 ? ` · ${customerProfile.reviews.length} review(s)` : ""}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowCustomerProfile(false);
                setCustomerProfile(null);
                if (customerId) router.push(`/(app)/(tabs)/clients/${customerId}` as never);
              }}
              style={twStyle("rounded-lg border-2 border-primary bg-primary/5 py-3 items-center")}
              accessibilityRole="button"
              accessibilityLabel="See full profile"
            >
              <Text style={twStyle("font-semibold text-primary")}>See full profile</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={twStyle("text-center text-gray-500 py-8")}>Could not load profile</Text>
        )}
      </BottomSheet>

      {/* Booking audit log / history */}
      <BottomSheet
        visible={showAuditLog}
        onClose={() => setShowAuditLog(false)}
        title="Booking history"
        snapHeight="half"
      >
        {loadingAuditLog ? (
          <View style={twStyle("py-8 items-center")}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : sortedAuditLogs.length === 0 ? (
          <View style={twStyle("py-6 px-2")}>
            <Text style={twStyle("text-center text-gray-600")}>No events yet</Text>
            <Text style={twStyle("text-center text-gray-500 text-sm mt-2 leading-5")}>
              Events will appear here as the booking progresses.
            </Text>
          </View>
        ) : (
          <ScrollView style={twStyle("max-h-96 pr-1")} showsVerticalScrollIndicator>
            {sortedAuditLogs.map((entry, idx) => {
              const isLast = idx === sortedAuditLogs.length - 1;
              const desc = buildAuditEntryDescription(entry, b.currency ?? "ZAR");
              return (
                <View key={entry.id} style={twStyle("flex-row")}>
                  <View style={twStyle("w-7 items-center mr-2")}>
                    <View style={twStyle("w-2.5 h-2.5 rounded-full bg-primary mt-1")} />
                    {!isLast ? (
                      <View
                        style={{ width: 2, marginTop: 4, alignSelf: "stretch", minHeight: 36, backgroundColor: "#E5E7EB" }}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                    ) : null}
                  </View>
                  <View style={twStyle("flex-1 pb-4")}>
                    <Text style={twStyle("text-base font-semibold text-gray-900")}>
                      {getAuditEventLabel(entry.event_type)}
                    </Text>
                    {desc ? (
                      <Text style={twStyle("text-sm text-gray-600 mt-1 leading-5")}>{desc}</Text>
                    ) : null}
                    <Text style={twStyle("text-xs text-gray-500 mt-2")}>
                      {(entry.created_by_name ?? "System").trim() || "System"} ·{" "}
                      {formatTimelineDateTime(entry.created_at, providerTimezone ?? b.display_time_zone)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </BottomSheet>

      <ArrivalQrScannerModal
        visible={showArrivalQrScanner}
        onClose={() => {
          setQrScanError(null);
          setShowArrivalQrScanner(false);
        }}
        busy={isVerifyingQrArrival}
        errorMessage={qrScanError}
        onValidScan={(jsonPayload) => submitVerifyQrBody({ qr_data: jsonPayload })}
      />
    </ScreenContainer>
  );
}
