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
  ActionSheetIOS,
  TextInput,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  Share,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format, addDays, isSameDay, parseISO, startOfDay } from "date-fns";
import * as Location from "expo-location";
import { useApi, useApiMutation, useApiPost } from "@/hooks/useApi";
import { useYocoIntegration } from "@/hooks/useYoco";
import { YocoPaymentSheet } from "@/components/YocoPaymentSheet";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { ActionButton } from "@/components/ui/ActionButton";
import { SafetyPanicButton } from "@/components/SafetyPanicButton";
import * as ImagePicker from "expo-image-picker";
import { APP_URL } from "@/config/public-env";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { ArrivalQrScannerModal } from "@/components/ArrivalQrScannerModal";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
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
import { buildSaleItemsFromBookingDetail } from "@/lib/build-sale-items-from-booking";

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
  customers?: { id?: string; full_name?: string | null; email?: string | null; phone?: string | null } | null;
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
  /** IANA TZ for customer-facing wall times when API sends it. */
  display_time_zone?: string | null;
  subtotal?: number;
  discount_amount?: number;
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
  };
  created_by: string;
  created_by_name?: string;
  created_at: string;
};

function statusColor(status: string): string {
  switch (status) {
    case "confirmed":
    case "booked":
      return "bg-blue-100";
    case "in_progress":
    case "started":
      return "bg-amber-100";
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

const ETA_OPTIONS = [15, 30, 45] as const;

const PAYMENT_METHODS = [
  { label: "Cash", value: "cash" },
  { label: "Card (Yoco / terminal)", value: "card" },
  { label: "EFT", value: "bank_transfer" },
  { label: "Other", value: "other" },
] as const;

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
  const { id, focusPayment, collectYoco } = useLocalSearchParams<{
    id: string;
    focusPayment?: string;
    collectYoco?: string;
  }>();
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const { data, loading, error, refresh } = useApi<BookingDetail>(`/api/provider/bookings/${id}`);

  // §Provider-audit 2026-04: `useApi` cache has a 20s stale window, so
  // returning from the calendar / list after a lifecycle mutation (elsewhere,
  // e.g. from another device or web) could show stale data. Refetch on focus
  // so the provider always sees the latest booking state.
  useFocusEffect(
    useCallback(() => {
      if (id) {
        void refresh();
      }
    }, [id, refresh]),
  );
  // §Release-audit 2026-04: provider timezone for tz-aware reschedule. Falls
  // back to device local via buildZonedIsoForWallClock when unavailable.
  const { provider: providerProfile } = useProvider();
  const providerTimezone = providerProfile?.timezone ?? null;
  const bookingIdStr = typeof id === "string" ? id : Array.isArray(id) ? id[0] ?? "" : "";
  const { execute: postMutation, loading: mutating } = useApiMutation<{ booking?: BookingDetail; message?: string }>("post");
  const { execute: patchMutation, loading: patchLoading } = useApiMutation<{ booking?: BookingDetail }>("patch");
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationPermissionDeniedRef = useRef(false);
  const mainScrollRef = useRef<ScrollView>(null);

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
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(() => new Date());
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const rescheduleDateStr = format(rescheduleDate, "yyyy-MM-dd");

  const rescheduleAvailableSlotsUrl = useMemo(() => {
    if (!showReschedule || !rescheduleDateStr || !bookingIdStr) return "";
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
    const mode = isHome ? "mobile" : "salon";
    const travelBuffer = isHome ? 30 : 0;
    let q = `/api/provider/bookings/available-slots?date=${encodeURIComponent(rescheduleDateStr)}&duration_minutes=${encodeURIComponent(String(durationMinutes))}&exclude_booking_id=${encodeURIComponent(bookingIdStr)}`;
    if (staffIds.length > 0) q += `&staff_ids=${encodeURIComponent(staffIds.join(","))}`;
    if (offeringIds.length > 0) q += `&service_ids=${encodeURIComponent(offeringIds.join(","))}`;
    if (locId) q += `&location_id=${encodeURIComponent(locId)}`;
    q += `&mode=${encodeURIComponent(mode)}&travel_buffer=${encodeURIComponent(String(travelBuffer))}`;
    return q;
  }, [showReschedule, rescheduleDateStr, bookingIdStr, durationMinutes, data]);

  type RescheduleSlotRow = { time: string; available: boolean; reason?: string };
  type RescheduleSlotsResponse = {
    slots: string[];
    slot_grid?: RescheduleSlotRow[];
    provider_timezone?: string | null;
  };

  const { data: rescheduleSlotsData, loading: rescheduleSlotsLoading } = useApi<RescheduleSlotsResponse>(
    rescheduleAvailableSlotsUrl,
    { enabled: !!rescheduleAvailableSlotsUrl }
  );

  const rescheduleTimeRows = useMemo((): RescheduleSlotRow[] => {
    const grid = rescheduleSlotsData?.slot_grid;
    if (grid && grid.length > 0) return grid;
    const legacy = rescheduleSlotsData?.slots ?? [];
    return legacy.map((time) => ({ time, available: true }));
  }, [rescheduleSlotsData]);

  // Notes
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Mark paid
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [markPaidMethod, setMarkPaidMethod] = useState<"cash" | "card" | "bank_transfer" | "other">("card");
  const [markingPaid, setMarkingPaid] = useState(false);

  // Refund
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [paymentExcellenceDismissed, setPaymentExcellenceDismissed] = useState(false);

  // Pay with Yoco (pending POS sale → terminal with sale_id → finalize sale + mark booking paid)
  const [showYocoPayment, setShowYocoPayment] = useState(false);
  const { integration: yocoIntegration } = useYocoIntegration();
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

  const { data: bookingResourcesData } = useApi<{ resources: BookingResourceRow[] }>(
    `/api/provider/bookings/${id}/resources`,
    { enabled: !!id }
  );
  const bookingResources = bookingResourcesData?.resources ?? [];

  // Request payment (additional charge + notify customer)
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

  // §Provider-launch (audit 2026-04): customer notification actions (P8 parity).
  const [isNotifying, setIsNotifying] = useState(false);

  // §Provider-launch (audit 2026-04): pull-to-refresh on booking detail.
  const [refreshing, setRefreshing] = useState(false);

  // Arrival verification (provider enters code from customer)
  const [arrivalPinInput, setArrivalPinInput] = useState("");
  const [isVerifyingArrival, setIsVerifyingArrival] = useState(false);
  const [isResendingArrivalOtp, setIsResendingArrivalOtp] = useState(false);
  const [qrArrivalCodeInput, setQrArrivalCodeInput] = useState("");
  const [qrPasteJson, setQrPasteJson] = useState("");
  const [isVerifyingQrArrival, setIsVerifyingQrArrival] = useState(false);
  const [showArrivalQrScanner, setShowArrivalQrScanner] = useState(false);

  // At-salon check-in (Client arrived)
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Consent document upload
  const [uploadingConsentFormId, setUploadingConsentFormId] = useState<string | null>(null);

  async function handleUploadConsentDocument(formId: string) {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });
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
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.error) {
        Alert.alert("Error", String(res.error));
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Consent document uploaded");
        await refresh();
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
        let status = currentPerm.status;
        if (status !== "granted" && currentPerm.canAskAgain) {
          const req = await Location.requestForegroundPermissionsAsync();
          status = req.status;
        }
        if (status !== "granted") {
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

  // Load whether provider already submitted a client rating (provider_client_ratings)
  useEffect(() => {
    if (!bookingIdStr || !data) return;
    if (data.status !== "completed" && data.status !== "no_show") {
      setHasProviderClientRating(null);
      return;
    }
    let cancelled = false;
    setHasProviderClientRating(null);
    api
      .get<{ has_rating?: boolean }>(`/api/provider/ratings?booking_id=${encodeURIComponent(bookingIdStr)}`)
      .then((res) => {
        if (cancelled) return;
        const d = res.data;
        setHasProviderClientRating(!!d?.has_rating);
      })
      .catch(() => {
        if (!cancelled) setHasProviderClientRating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingIdStr, data]);

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

  const b = data as BookingDetail;
  const services = b.services ?? [];
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
    isAtHome &&
    (b.status === "confirmed" || b.status === "booked") &&
    (b.current_stage == null || b.current_stage === "confirmed");
  const canMarkArrived = isAtHome && b.current_stage === "provider_on_way";
  const isEnRoute = b.current_stage === "provider_on_way";
  const isArrived = b.current_stage === "provider_arrived";
  const arrivalVerified =
    b.arrival_otp_verified === true || b.qr_code_verified === true;
  const arrivalOtpPending = b.arrival_otp_pending === true;
  const qrArrivalPending = b.qr_arrival_pending === true;

  const isActive = ["pending", "booked", "confirmed"].includes(b.status);
  const isStarted = ["started", "in_progress"].includes(b.status);
  const clientArrivedAtSalon = isAtSalon && b.current_stage === "client_arrived";
  const canCheckInAtSalon =
    isAtSalon &&
    (b.status === "confirmed" || b.status === "booked" || b.status === "pending") &&
    b.current_stage !== "client_arrived" &&
    !isStarted;
  const totalAmount = b.total_amount ?? 0;
  const totalPaid = b.total_paid ?? 0;
  const totalRefunded = b.total_refunded ?? 0;
  const walletAmountApplied = Number(b.wallet_amount ?? 0);
  const giftCardAmountApplied = Number(b.gift_card_amount ?? 0);
  const effectivePaid = Math.max(0, totalPaid - totalRefunded);
  const outstandingRaw = totalAmount - effectivePaid - walletAmountApplied - giftCardAmountApplied;
  const ps = (b.payment_status || "").toLowerCase();
  const outstanding = ps === "refunded" ? 0 : Math.max(0, outstandingRaw);
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
    depositTarget != null ? Math.max(0, depositTarget - totalPaid) : 0;
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
    yocoTerminalAmount > 0 &&
    typeof b.status === "string" &&
    statusesAllowingPayment.has(b.status);
  const canRefund = totalPaid > 0 && totalRefunded < totalPaid;
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
      `When: ${formatDateTimeSafe(b.scheduled_at)} ${formatTimeSafe(b.scheduled_at)}`,
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
        "This booking is not in a state where a card payment can be recorded (for example it may be cancelled).",
      );
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

  async function finalizeYocoBookingPayment(result: { reference: string }) {
    if (!id || !result.reference) return;
    const saleId = yocoBookingSaleIdRef.current ?? yocoBookingSaleId;
    if (!saleId) {
      Alert.alert("Error", "Missing sale record. Try again.");
      return;
    }
    const patchRes = await api.patch(`/api/provider/sales/${saleId}`, {
      payment_status: "completed",
      payment_provider: "yoco",
      payment_provider_id: result.reference,
    });
    if (patchRes.error) {
      Alert.alert(
        "Update failed",
        "The terminal payment succeeded but the sale could not be finalized. Check Sales for a pending entry.",
      );
      return;
    }
    const chargeForBooking = yocoPendingChargeAmountRef.current ?? yocoTerminalAmount;
    const res = await postMutation(`/api/provider/bookings/${id}/mark-paid`, {
      payment_method: "card",
      reference: result.reference,
      amount: Number(chargeForBooking.toFixed(2)),
    });
    if (res.error) {
      Alert.alert(
        "Booking payment",
        `The sale was saved, but updating the booking failed: ${res.error}`,
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

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (newStatus === "started") {
      const { error: err } = await postMutation(`/api/provider/bookings/${id}/start-service`, {});
      if (err) {
        Alert.alert("Error", err);
        return;
      }
      await refresh();
      return;
    }

    if (newStatus === "completed") {
      const { error: err } = await postMutation(`/api/provider/bookings/${id}/complete-service`, {});
      if (err) {
        Alert.alert("Error", err);
        return;
      }
      await refresh();
      setShowRateClientSheet(true);
      return;
    }

    if (newStatus === "cancelled") {
      setCancelReason("");
      setShowCancelModal(true);
      return;
    }

    const version = (b as BookingDetail & { version?: number }).version;
    const { error: err } = await patchMutation(`/api/provider/bookings/${id}`, {
      status: newStatus,
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
        Alert.alert("Error", err);
      }
      return;
    }
    await refresh();
  };

  const showStatusActions = () => {
    const actions: { label: string; status: string; destructive?: boolean }[] = [];
    if (b.status !== "confirmed" && b.status !== "booked" && isActive) {
      actions.push({ label: "Confirm", status: "booked" });
    }
    if (isAtHome) {
      if ((isArrived || arrivalVerified) && !isStarted) {
        actions.push({ label: "Start service", status: "started" });
      }
    } else {
      const salonReady =
        b.status === "confirmed" || b.status === "booked" || clientArrivedAtSalon;
      if (salonReady && !isStarted) {
        actions.push({ label: "Start service", status: "started" });
      }
    }
    if (isStarted) {
      actions.push({ label: "Complete", status: "completed" });
    }
    if (isActive || isStarted) {
      actions.push({ label: "No show", status: "no_show" });
      actions.push({ label: "Cancel booking", status: "cancelled", destructive: true });
    }
    if (actions.length === 0) return;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", ...actions.map((a) => a.label)],
          cancelButtonIndex: 0,
          destructiveButtonIndex: actions.findIndex((a) => a.destructive) + 1,
          title: "Change status",
        },
        (idx) => {
          if (idx === 0) return;
          const a = actions[idx - 1];
          if (a) handleStatusChange(a.status);
        }
      );
    } else {
      Alert.alert(
        "Change status",
        undefined,
        [
          { text: "Cancel", style: "cancel" },
          ...actions.map((a) => ({
            text: a.label,
            style: (a.destructive ? "destructive" : "default") as "destructive" | "default",
            onPress: () => handleStatusChange(a.status),
          })),
        ]
      );
    }
  };

  const handleReschedule = async () => {
    if (!id || !rescheduleTime) {
      Alert.alert("Required", "Please select a time.");
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
      const rescheduleIsHome = b.location_type === "at_home";
      checkParams.set("mode", rescheduleIsHome ? "mobile" : "salon");
      checkParams.set("travel_buffer", rescheduleIsHome ? "30" : "0");
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
      const { error: err } = await patchMutation(`/api/provider/bookings/${id}`, {
        scheduled_at: newScheduledAt,
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
          Alert.alert("Error", err);
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

  const handleSaveNotes = async () => {
    if (!id) return;
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
    if (yocoTerminalAmount <= 0) {
      Alert.alert("Nothing to record", "There is no remaining balance to mark as paid.");
      return;
    }
    setMarkingPaid(true);
    const res = await postMutation(`/api/provider/bookings/${id}/mark-paid`, {
      payment_method: markPaidMethod,
      amount: Number(yocoTerminalAmount.toFixed(2)),
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
    const res = await postMutation(`/api/provider/bookings/${id}/refund`, { amount, reason });
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const body: Record<string, unknown> = {};
    if (etaMinutes != null && etaMinutes > 0) {
      body.estimated_arrival = new Date(Date.now() + etaMinutes * 60 * 1000).toISOString();
    }
    const res = await postMutation(`/api/provider/bookings/${id}/start-journey`, body);
    if (res.error) {
      Alert.alert("Error", res.error);
      return;
    }
    await refresh();
  };

  const handleMarkArrived = async () => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const body: Record<string, unknown> = {};
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
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
      const sent = (res.data as { sent?: boolean } | undefined)?.sent;
      if (sent === false) {
        Alert.alert("Notification", "Customer could not be notified.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Notification",
        type === "confirmation"
          ? "Confirmation re-sent to customer."
          : "Reminder sent to customer.",
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
    if (!id) return false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsVerifyingQrArrival(true);
    try {
      const res = await postMutation(`/api/provider/bookings/${id}/verify-qr`, body);
      if (res.error) {
        Alert.alert("Error", res.error);
        return false;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setQrArrivalCodeInput("");
      setQrPasteJson("");
      setShowArrivalQrScanner(false);
      await refresh();
      return true;
    } finally {
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

  const handleClientArrived = async () => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCheckingIn(true);
    try {
      const version = (b as BookingDetail & { version?: number }).version;
      const { error: err } = await patchMutation(`/api/provider/bookings/${id}`, {
        current_stage: "client_arrived",
        send_arrival_notification: true,
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
          Alert.alert("Error", err);
        }
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } finally {
      setIsCheckingIn(false);
    }
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

  const canRequestPayment = isStarted || b.status === "completed";
  const canSendPaymentLink = outstanding > 0 && b.status !== "cancelled";

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
    };
    return labels[eventType] ?? eventType;
  };

  return (
    <ScreenContainer>
      <AutoYocoCollectGate
        shouldRun={
          providerParamTruthy(collectYoco) &&
          yocoTerminalAmount > 0 &&
          yocoIntegration?.is_enabled === true &&
          Boolean(yocoIntegration?.api_key_set) &&
          canMarkPaid
        }
        onTrigger={() => {
          router.setParams({ collectYoco: undefined });
          void openYocoCheckout();
        }}
      />
      <ScreenHeader
        title={b.booking_number ?? "Booking"}
        subtitle={b.status}
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
                await refresh();
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor="#6B7280"
          />
        }
      >
        {isAtHome ? (
          <View style={twStyle("rounded-2xl border-2 border-violet-200 bg-violet-50 p-4 mb-3")}>
            <View style={twStyle("flex-row items-center justify-between mb-2")}>
              <View style={twStyle("flex-row items-center flex-1")}>
                <Ionicons name="home" size={22} color="#5B21B6" />
                <Text style={twStyle("ml-2 text-base font-bold text-violet-950")}>House call</Text>
              </View>
              {b.db_status === "pending" ? (
                <View style={twStyle("rounded-full bg-amber-200 px-2 py-1")}>
                  <Text style={twStyle("text-xs font-bold text-amber-900")}>Confirm first</Text>
                </View>
              ) : null}
            </View>
            <Text style={twStyle("text-sm text-violet-900 leading-5 mb-3")}>
              You travel to the client. Flow: confirm the booking, then Start journey when you leave, Mark arrived, then verify with their PIN and/or QR (per your settings), then start service.
            </Text>
            <Text style={twStyle("text-xs text-violet-900/90 leading-5 mb-2")}>{PROVIDER_HOUSE_CALL_EXCELLENCE_NUDGE}</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(app)/(tabs)/more/rewards-hub" as never);
              }}
              accessibilityRole="button"
              accessibilityLabel={PROVIDER_EXCELLENCE_DASHBOARD_CTA}
            >
              <Text style={twStyle("text-xs font-semibold text-violet-800")}>{PROVIDER_EXCELLENCE_DASHBOARD_CTA} →</Text>
            </TouchableOpacity>
            {addressLine ? (
              <TouchableOpacity
                onPress={openMapsUrl}
                style={twStyle("flex-row items-center rounded-xl border border-violet-200 bg-white px-3 py-2.5")}
                accessibilityRole="button"
                accessibilityLabel="Open directions to client address"
              >
                <Ionicons name="navigate" size={18} color="#6D28D9" />
                <Text style={twStyle("ml-2 flex-1 text-sm font-medium text-gray-800")} numberOfLines={3}>
                  {addressLine}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={twStyle("text-xs text-violet-800")}>No address on file — check notes or contact the client.</Text>
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
          <View style={twStyle("flex-row items-center justify-between mb-3")}>
            <View style={twStyle("flex-row items-center flex-1")}>
              <Text style={twStyle("font-semibold text-gray-900")}>{customerName}</Text>
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
                        router.push(`/(app)/(tabs)/more/messaging/${convId}` as never);
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
            <View style={twStyle("flex-row items-center")}>
              {b.booking_source === "walk_in" && (
                <View style={[twStyle("rounded-full bg-green-100 px-2 py-1"), { marginRight: 6 }]}>
                  <Text style={twStyle("text-xs font-medium text-green-800")}>Walk-in</Text>
                </View>
              )}
              <View style={twStyle(`rounded-full px-2 py-1 ${statusColor(b.status)}`)}>
                <Text style={twStyle("text-xs font-medium text-gray-800")}>{b.status}</Text>
              </View>
            </View>
          </View>
          <Text style={twStyle("text-sm text-gray-600")}>
            {formatDateTimeSafe(b.scheduled_at, b.display_time_zone)}
          </Text>
          {addressLine ? (
            <Text style={twStyle("mt-2 text-sm text-gray-500")}>{addressLine}</Text>
          ) : null}
          {typeof b.total_amount === "number" && (
            <Text style={twStyle("mt-2 text-base font-medium text-gray-900")}>
              {b.currency ?? getTenantDefaultCurrency()} {b.total_amount.toLocaleString()}
            </Text>
          )}
          {b.is_group_booking && b.group_booking_ref ? (
            <Text style={twStyle("mt-2 text-xs font-medium text-indigo-700")}>
              Group booking · {b.group_booking_ref}
            </Text>
          ) : null}
        </View>

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
              <View style={twStyle("rounded-xl border border-indigo-100 bg-indigo-50/80 p-4")}>
                <Text style={twStyle("text-sm font-medium text-indigo-900 mb-2")}>Group participants</Text>
                {(b.participants ?? []).map((p, idx) => (
                  <View
                    key={p.id ?? `${p.participant_name ?? "p"}-${idx}`}
                    style={twStyle("mb-2 rounded-lg border border-indigo-100 bg-white px-3 py-2 last:mb-0")}
                  >
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>
                      {p.participant_name?.trim() || "Participant"}
                      {p.is_primary_contact ? " · Primary" : ""}
                    </Text>
                    {p.participant_phone ? (
                      <Text style={twStyle("text-xs text-gray-600 mt-0.5")}>{p.participant_phone}</Text>
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
                  </View>
                )}
                {isArrived && !arrivalVerified && qrArrivalPending && (
                  <View style={twStyle("rounded-lg bg-violet-50 border border-violet-200 p-3 mb-3")}>
                    <Text style={twStyle("text-sm font-medium text-violet-950 mb-1")}>Scan the customer&apos;s QR or enter their code</Text>
                    <Text style={twStyle("text-xs text-violet-800 mb-2")}>
                      Ask them to open this booking — they&apos;ll see an arrival QR. You can scan it or type the 8-character code.
                      {arrivalOtpPending
                        ? " If it expired, use Resend in the PIN section — the customer gets a fresh code and QR."
                        : " If it expired, use Resend below — the customer gets a fresh code and QR."}
                    </Text>
                    {!arrivalOtpPending ? (
                      <TouchableOpacity
                        onPress={handleResendArrivalOtp}
                        disabled={isResendingArrivalOtp}
                        style={twStyle("rounded-lg border border-violet-400 py-2.5 px-3 items-center mb-2")}
                        accessibilityRole="button"
                        accessibilityLabel="Resend QR and code to customer"
                      >
                        {isResendingArrivalOtp ? (
                          <ActivityIndicator size="small" color="#5B21B6" />
                        ) : (
                          <Text style={twStyle("text-violet-900 font-semibold")}>Resend QR & code to customer</Text>
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
                    <Text style={twStyle("text-xs text-violet-800 mb-1")}>Or paste raw scan result (JSON)</Text>
                    <TextInput
                      value={qrPasteJson}
                      onChangeText={setQrPasteJson}
                      placeholder='{"booking_id":"…"'
                      multiline
                      style={twStyle("border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 bg-white min-h-[72px]")}
                      accessibilityLabel="Pasted QR JSON"
                    />
                    <TouchableOpacity
                      onPress={() => setShowArrivalQrScanner(true)}
                      disabled={isVerifyingQrArrival || Platform.OS === "web"}
                      style={twStyle(
                        `rounded-lg border-2 border-violet-600 py-2.5 items-center mb-2 ${Platform.OS === "web" ? "opacity-50" : ""}`
                      )}
                      accessibilityRole="button"
                      accessibilityLabel="Open QR scanner"
                    >
                      <Text style={twStyle("text-violet-800 font-semibold")}>
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
                      style={twStyle("rounded-lg bg-violet-700 py-2.5 items-center")}
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

        {/* At-salon: Client arrived / check-in */}
        {isAtSalon && (clientArrivedAtSalon || canCheckInAtSalon) && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-3")}>At salon</Text>
            <Text style={twStyle("text-xs text-gray-600 leading-5 mb-3")}>{PROVIDER_SALON_CHECKIN_EXCELLENCE_NUDGE}</Text>
            {clientArrivedAtSalon ? (
              <View style={twStyle("rounded-lg bg-purple-50 border border-purple-200 py-2 px-3")}>
                <Text style={twStyle("text-sm font-medium text-purple-800")}>
                  Client arrived – ready for service
                </Text>
              </View>
            ) : canCheckInAtSalon ? (
              <TouchableOpacity
                onPress={handleClientArrived}
                disabled={isCheckingIn}
                style={twStyle("rounded-xl bg-purple-600 py-3 items-center")}
                accessibilityRole="button"
                accessibilityLabel="Mark client arrived"
              >
                {isCheckingIn ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={twStyle("text-white font-semibold")}>Client arrived</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Status & reschedule actions */}
        {(isActive || isStarted) && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-3")}>Actions</Text>
            <View style={twStyle("flex-row flex-wrap gap-2")}>
              <TouchableOpacity
                onPress={showStatusActions}
                disabled={patchLoading}
                style={twStyle("rounded-xl border border-gray-300 bg-white py-3 px-4")}
              >
                {patchLoading ? (
                  <ActivityIndicator size="small" color="#111" />
                ) : (
                  <Text style={twStyle("font-medium text-gray-800")}>Change status</Text>
                )}
              </TouchableOpacity>
              {b.scheduled_at && (
                <TouchableOpacity
                  onPress={() => {
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
                  }}
                  style={twStyle("rounded-xl border border-primary py-3 px-4")}
                >
                  <Text style={twStyle("font-medium text-primary")}>Reschedule</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Client rating (provider → customer via provider_client_ratings) */}
        {(b.status === "completed" || b.status === "no_show") && hasProviderClientRating !== null && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Client rating</Text>
            {hasProviderClientRating ? (
              <Text style={twStyle("text-sm text-gray-600")}>You have rated this client for this booking.</Text>
            ) : (
              <TouchableOpacity
                onPress={() => setShowRateClientSheet(true)}
                style={twStyle("rounded-xl py-3 px-4 self-start")}
                activeOpacity={0.85}
              >
                <Text style={twStyle("font-semibold text-primary")}>Rate this client</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Payment summary & Mark paid / Refund */}
        {showPaymentAndReceiptCard && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Payment</Text>
            {b.payment_status ? (
              <Text style={twStyle("text-xs text-gray-500 mb-2")}>Status: {b.payment_status}</Text>
            ) : null}
            {(typeof b.subtotal === "number" && b.subtotal > 0) ||
            (typeof b.discount_amount === "number" && b.discount_amount > 0) ||
            (typeof b.tax_amount === "number" && b.tax_amount > 0) ||
            (typeof b.service_fee_amount === "number" && b.service_fee_amount > 0) ||
            (typeof b.tip_amount === "number" && b.tip_amount > 0) ||
            (typeof b.travel_fee_amount === "number" && b.travel_fee_amount > 0) ? (
              <View style={twStyle("mb-2 border-b border-gray-100 pb-2")}>
                {typeof b.subtotal === "number" && b.subtotal > 0 ? (
                  <Text style={twStyle("text-sm text-gray-600")}>
                    Subtotal: {b.currency ?? getTenantDefaultCurrency()} {Math.max(0, b.subtotal - (b.travel_fee_amount ?? 0)).toLocaleString()}
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
                Total: {b.currency ?? getTenantDefaultCurrency()} {totalAmount.toLocaleString()}
              </Text>
            )}
            {b.deposit_required && b.payment_option === "deposit" && typeof b.deposit_amount === "number" && b.deposit_amount > 0 && (
              <Text style={twStyle("text-sm text-gray-600 mt-0.5")}>
                Deposit{b.deposit_percentage ? ` (${b.deposit_percentage}%)` : ""}:{" "}
                {b.currency ?? getTenantDefaultCurrency()} {b.deposit_amount.toLocaleString()}
              </Text>
            )}
            {totalPaid > 0 && (
              <Text style={twStyle("text-sm text-green-600 mt-0.5")}>
                Paid: {b.currency ?? getTenantDefaultCurrency()} {totalPaid.toLocaleString()}
              </Text>
            )}
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
                  {yocoIntegration?.is_enabled && yocoIntegration?.api_key_set && outstanding > 0 && (
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
                >
                  {requestingPayment ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={twStyle("font-medium text-gray-800")}>Request payment</Text>
                  )}
                </TouchableOpacity>
              )}
              {canRefund && (
                <TouchableOpacity
                  onPress={() => {
                    setRefundAmount(maxRefundable.toFixed(2));
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
        {id && b?.customer_id && b.status !== "completed" && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>
              Customer notifications
            </Text>
            <View style={twStyle("flex-row flex-wrap gap-2")}>
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
              {(b.status === "cancelled" || b.status === "no_show") && (
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
        )}

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
                  {(c.status === "pending" || c.status === "approved") && (
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
                    {formatTimeSafe(s.scheduled_start_at, b.display_time_zone)}
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
            {!editingNotes ? (
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

      {/* Reschedule modal */}
      <BottomSheet
        visible={showReschedule}
        onClose={() => setShowReschedule(false)}
        title="Reschedule"
      >
        <View>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-3")}>
            {Array.from({ length: 14 }, (_, i) => {
              const d = addDays(startOfDay(new Date()), i);
              const isSelected = isSameDay(d, rescheduleDate);
              return (
                <TouchableOpacity
                  key={d.toISOString()}
                  onPress={() => setRescheduleDate(d)}
                  style={[twStyle("items-center rounded-xl px-3 py-2.5 mr-2"), isSelected ? twStyle("bg-gray-900") : twStyle("border border-gray-200 bg-white")]}
                >
                  <Text style={twStyle(`text-[10px] ${isSelected ? "text-gray-300" : "text-gray-500"}`)}>{format(d, "EEE")}</Text>
                  <Text style={twStyle(`text-base font-bold ${isSelected ? "text-white" : "text-gray-900"}`)}>{format(d, "d")}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Time</Text>
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
            <View style={twStyle("flex-row flex-wrap")}>
              {rescheduleSlotsLoading && rescheduleTimeRows.length === 0 ? (
                <Text style={twStyle("text-sm text-gray-500")}>Loading slots…</Text>
              ) : null}
              {!rescheduleSlotsLoading && rescheduleTimeRows.length === 0 ? (
                <Text style={twStyle("text-sm text-gray-500")}>No times for this date</Text>
              ) : null}
              {rescheduleTimeRows.map((row) => {
                const isSelected = rescheduleTime === row.time;
                const unavailable = !row.available;
                const chip = unavailable
                  ? twStyle("border border-red-200 bg-red-50")
                  : isSelected
                    ? twStyle("bg-gray-900")
                    : twStyle("border border-gray-200 bg-white");
                return (
                  <TouchableOpacity
                    key={row.time}
                    disabled={unavailable}
                    onPress={() => {
                      if (unavailable) return;
                      setRescheduleTime(row.time);
                    }}
                    style={[twStyle("rounded-lg px-3 py-2 mr-2 mb-2"), chip]}
                    accessibilityState={{ disabled: unavailable, selected: isSelected }}
                  >
                    <Text
                      style={twStyle(
                        `text-sm font-medium ${
                          unavailable ? "text-red-300 line-through" : isSelected ? "text-white" : "text-gray-700"
                        }`,
                      )}
                    >
                      {row.time}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
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
            {PAYMENT_METHODS.map((pm) => (
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
          <Text style={twStyle("text-xs text-gray-500 mb-3")}>
            {
              "The refund amount will be credited to the customer's wallet balance. The booking balance will update after this succeeds."
            }
          </Text>
          <ActionButton label={refunding ? "Processing…" : "Confirm refund"} onPress={handleRefund} loading={refunding} fullWidth />
        </View>
      </BottomSheet>

      {/* Request payment (additional charge) */}
      <BottomSheet
        visible={showRequestPayment}
        onClose={() => { setShowRequestPayment(false); setRequestPaymentDescription(""); setRequestPaymentAmount(""); }}
        title="Request payment"
      >
        <View>
          <Text style={twStyle("text-sm text-gray-600 mb-2")}>
            Add an extra charge and notify the customer. They can pay online or you can mark as paid later.
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
            label={requestingPayment ? "Requesting…" : "Request payment"}
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
        description={`Booking ${b.booking_number ?? id}`}
        onPaymentSuccess={(result) => void finalizeYocoBookingPayment(result)}
      />

      {/* Provider post-completion modal: once per booking when opening a completed booking */}
      <Modal
        visible={showProviderCompletionModal}
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
                  setShowRateClientSheet(true);
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
              style={{ backgroundColor: "#ec4899", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 10 }}
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
                onPress={async () => {
                  setShowCancelModal(false);
                  const version = (b as BookingDetail & { version?: number }).version;
                  const { error: err } = await patchMutation(`/api/provider/bookings/${id}`, {
                    status: "cancelled",
                    cancellation_reason: cancelReason.trim() || "No reason provided",
                    ...(version !== undefined && { version }),
                  });
                  if (err) {
                    if (isConflictError(err)) {
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
                  await refresh();
                }}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#dc2626", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "600", color: "#fff" }}>Cancel Booking</Text>
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
        snapHeight="half"
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
            <ActivityIndicator size="large" color="#6366f1" />
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
                            <Ionicons name="document-text-outline" size={16} color="#6366f1" />
                            <Text style={twStyle("ml-1 text-sm font-medium text-indigo-600")}>View consent document</Text>
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
                if (customerId) router.push(`/(app)/(tabs)/more/clients/${customerId}` as never);
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
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : auditLogs.length === 0 ? (
          <Text style={twStyle("text-center text-gray-500 py-8")}>No audit log entries</Text>
        ) : (
          <ScrollView style={twStyle("max-h-96")} showsVerticalScrollIndicator>
            {auditLogs.map((entry) => (
              <View
                key={entry.id}
                style={twStyle("border border-gray-200 rounded-lg p-3 mb-2")}
              >
                <Text style={twStyle("font-medium text-gray-900")}>
                  {getAuditEventLabel(entry.event_type)}
                </Text>
                {entry.event_data?.reason ? (
                  <Text style={twStyle("text-sm text-gray-600 mt-1")}>
                    Reason: {entry.event_data.reason}
                  </Text>
                ) : null}
                <Text style={twStyle("text-xs text-gray-500 mt-2")}>
                  {entry.created_by_name ?? "System"} ·{" "}
                  {formatDateTimeSafe(entry.created_at)}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </BottomSheet>

      <ArrivalQrScannerModal
        visible={showArrivalQrScanner}
        onClose={() => setShowArrivalQrScanner(false)}
        onValidScan={(jsonPayload) => {
          void submitVerifyQrBody({ qr_data: jsonPayload });
        }}
      />
    </ScreenContainer>
  );
}
