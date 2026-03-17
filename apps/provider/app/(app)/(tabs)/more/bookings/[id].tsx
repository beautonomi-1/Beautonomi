import { useState, useEffect, useRef, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Platform,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  TextInput,
  Linking,
  Modal,
  Pressable,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format, addDays, isSameDay, parseISO, startOfDay } from "date-fns";
import * as Location from "expo-location";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useYocoIntegration } from "@/hooks/useYoco";
import { YocoPaymentSheet } from "@/components/YocoPaymentSheet";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { SafetyPanicButton } from "@/components/SafetyPanicButton";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { twStyle } from "@/lib/twStyle";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

type BookingDetail = {
  id: string;
  booking_number?: string | null;
  status: string;
  scheduled_at: string;
  total_amount?: number;
  currency?: string;
  location_type?: "at_salon" | "at_home";
  current_stage?: string | null;
  arrival_otp_verified?: boolean;
  customers?: { full_name?: string | null } | null;
  locations?: { name?: string | null } | null;
  address?: { line1?: string; city?: string; latitude?: number; longitude?: number } | null;
  special_requests?: string | null;
  version?: number;
  total_paid?: number;
  total_refunded?: number;
  services?: {
    offering_name?: string;
    staff_name?: string | null;
    scheduled_start_at?: string;
    duration_minutes?: number;
    price?: number;
  }[];
  /** Points earned for this booking (when completed); from provider_point_transactions */
  provider_points_earned?: number | null;
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
  { label: "Card", value: "card" },
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

export default function BookingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const { data, loading, error, refresh } = useApi<BookingDetail>(`/api/provider/bookings/${id}`);
  const { execute: postMutation, loading: mutating } = useApiMutation<{ booking?: BookingDetail; message?: string }>("post");
  const { execute: patchMutation, loading: patchLoading } = useApiMutation<{ booking?: BookingDetail }>("patch");
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const durationMinutes = useMemo(
    () =>
      (data?.services ?? []).reduce((s, svc) => s + (svc.duration_minutes ?? 0), 0) || 60,
    [data?.services]
  );

  // Reschedule
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(() => new Date());
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const rescheduleDateStr = format(rescheduleDate, "yyyy-MM-dd");
  const { data: rescheduleSlotsData } = useApi<{ slots: string[] }>(
    `/api/provider/bookings/available-slots?date=${rescheduleDateStr}&duration_minutes=${durationMinutes}`,
    { enabled: showReschedule && !!rescheduleDateStr }
  );
  const rescheduleSlots = rescheduleSlotsData?.slots ?? [];

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

  // Pay with Yoco (card payment then mark paid)
  const [showYocoPayment, setShowYocoPayment] = useState(false);
  const { integration: yocoIntegration } = useYocoIntegration();

  // Additional charges (fetch when booking loaded)
  const { data: additionalChargesData, refresh: refreshCharges } = useApi<{ charges: AdditionalCharge[] }>(
    `/api/provider/bookings/${id}/additional-charges`,
    { enabled: !!id }
  );
  const additionalCharges: AdditionalCharge[] = additionalChargesData?.charges ?? [];

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

  // Arrival verification (provider enters code from customer)
  const [arrivalPinInput, setArrivalPinInput] = useState("");
  const [isVerifyingArrival, setIsVerifyingArrival] = useState(false);
  const [isResendingArrivalOtp, setIsResendingArrivalOtp] = useState(false);

  // At-salon check-in (Client arrived)
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Audit log
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAuditLog, setLoadingAuditLog] = useState(false);

  // Post-completion modal (once per booking when opening a completed booking)
  const [showProviderCompletionModal, setShowProviderCompletionModal] = useState(false);
  const [showRateClientSheet, setShowRateClientSheet] = useState(false);
  const [rateClientStars, setRateClientStars] = useState(0);
  const [rateClientComment, setRateClientComment] = useState("");
  const [submittingRateClient, setSubmittingRateClient] = useState(false);

  const isAtHomeFromData = data?.location_type === "at_home";
  const isEnRouteFromData = data?.current_stage === "provider_on_way";
  useEffect(() => {
    if (!id || !isAtHomeFromData || !isEnRouteFromData || Platform.OS === "web") return;
    const sendLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await api.post(`/api/provider/bookings/${id}/location`, {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? undefined,
        });
      } catch {
        // Ignore; next interval will retry
      }
    };
    sendLocation();
    const interval = setInterval(sendLocation, 45000);
    locationIntervalRef.current = interval;
    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    };
  }, [id, isAtHomeFromData, isEnRouteFromData]);

  // Reschedule form sync (must be before early return to satisfy rules of hooks)
  useEffect(() => {
    if (data?.scheduled_at && showReschedule) {
      try {
        setRescheduleDate(parseISO(data.scheduled_at.split("T")[0] ?? ""));
        setRescheduleTime(data.scheduled_at.slice(11, 16) ?? "");
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

  // Normalize id (Expo params can be string | string[])
  const bookingIdStr = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

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
      const reviewRes = await api.get<{ data?: { id?: string }; id?: string }>(`/api/me/reviews?booking_id=${encodeURIComponent(bookingIdStr)}`);
      const body = reviewRes?.data ?? reviewRes;
      const reviewId = typeof body?.data?.id === "string" ? body.data.id : typeof (body as { id?: string })?.id === "string" ? (body as { id: string }).id : null;
      if (!reviewId) {
        Alert.alert("Review not found", "The customer must leave a review first. You can rate them after they review.");
        return;
      }
      const comment = typeof rateClientComment === "string" ? rateClientComment.trim() : "";
      await api.patch(`/api/reviews/${reviewId}`, {
        customer_rating: Math.min(5, Math.max(1, Math.floor(Number(rateClientStars)) || 0)),
        customer_comment: comment || null,
      });
      setShowRateClientSheet(false);
      setRateClientStars(0);
      setRateClientComment("");
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
  const locationName = b.locations?.name ?? null;
  const addressLine = b.address
    ? [b.address.line1, b.address.city].filter(Boolean).join(", ")
    : locationName;

  const isAtHome = b.location_type === "at_home";
  const isAtSalon = b.location_type === "at_salon";
  const canStartJourney =
    isAtHome &&
    (b.status === "confirmed" || b.status === "pending") &&
    (b.current_stage == null || b.current_stage === "confirmed");
  const canMarkArrived = isAtHome && b.current_stage === "provider_on_way";
  const isEnRoute = b.current_stage === "provider_on_way";
  const isArrived = b.current_stage === "provider_arrived";

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
  const outstanding = totalAmount - totalPaid + totalRefunded;
  const canMarkPaid = outstanding > 0 && (b.status === "completed" || isStarted);
  const canRefund = totalPaid > 0 && totalRefunded < totalPaid;

  const isConflictError = (msg: string | null) =>
    msg != null && msg.includes("modified by another user");

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      actions.push({ label: "Confirm", status: "confirmed" });
    }
    if (b.status === "confirmed" || b.status === "booked") {
      actions.push({ label: "Start service", status: "started" });
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
    const newScheduledAt = `${rescheduleDateStr}T${rescheduleTime}:00`;
    try {
      const checkRes = await api.get<{ available?: boolean }>(
        `/api/provider/bookings/check-availability?scheduled_at=${encodeURIComponent(newScheduledAt)}&duration_minutes=${durationMinutes}`
      );
      if (checkRes.data?.available === false) {
        Alert.alert("Slot unavailable", "This time is no longer available. Choose another.");
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
    setMarkingPaid(true);
    const res = await postMutation(`/api/provider/bookings/${id}/mark-paid`, {
      payment_method: markPaidMethod,
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
    if (code.length < 4) {
      Alert.alert("Required", "Enter the 4 or 6 digit code from the customer.");
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
    Linking.openURL(url).catch(() => {});
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
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
          <View style={twStyle("flex-row items-center justify-between mb-3")}>
            <Text style={twStyle("font-semibold text-gray-900")}>{customerName}</Text>
            <View style={twStyle(`rounded-full px-2 py-1 ${statusColor(b.status)}`)}>
              <Text style={twStyle("text-xs font-medium text-gray-800")}>{b.status}</Text>
            </View>
          </View>
          <Text style={twStyle("text-sm text-gray-600")}>
            {b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "—"}
          </Text>
          {addressLine ? (
            <Text style={twStyle("mt-2 text-sm text-gray-500")}>{addressLine}</Text>
          ) : null}
          {typeof b.total_amount === "number" && (
            <Text style={twStyle("mt-2 text-base font-medium text-gray-900")}>
              {b.currency ?? "ZAR"} {b.total_amount.toLocaleString()}
            </Text>
          )}
        </View>

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
                    {b.arrival_otp_verified ? "Customer verified – you can start service" : "Provider arrived"}
                  </Text>
                </View>
                {isArrived && !b.arrival_otp_verified && (
                  <View style={twStyle("rounded-lg bg-blue-50 border border-blue-200 p-3 mb-3")}>
                    <Text style={twStyle("text-sm font-medium text-blue-900 mb-2")}>Enter the verification code from the customer</Text>
                    <TextInput
                      value={arrivalPinInput}
                      onChangeText={(t) => setArrivalPinInput(t.replace(/\D/g, "").slice(0, 6))}
                      placeholder="1234"
                      keyboardType="number-pad"
                      maxLength={6}
                      style={twStyle("border border-gray-300 rounded-lg px-3 py-2.5 text-base mb-2 bg-white")}
                      accessibilityLabel="Verification code from customer"
                    />
                    <View style={twStyle("flex-row gap-2")}>
                      <TouchableOpacity
                        onPress={handleVerifyArrival}
                        disabled={isVerifyingArrival || arrivalPinInput.replace(/\D/g, "").length < 4}
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
                          <Text style={twStyle("text-gray-700 font-medium")}>Resend code</Text>
                        )}
                      </TouchableOpacity>
                    </View>
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
                      setRescheduleDate(parseISO(b.scheduled_at.split("T")[0] ?? ""));
                      setRescheduleTime(b.scheduled_at.slice(11, 16) ?? "");
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

        {/* Payment summary & Mark paid / Refund */}
        {(totalAmount > 0 || totalPaid > 0) && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Payment</Text>
            {totalAmount > 0 && (
              <Text style={twStyle("text-sm text-gray-600")}>
                Total: {b.currency ?? "ZAR"} {totalAmount.toLocaleString()}
              </Text>
            )}
            {totalPaid > 0 && (
              <Text style={twStyle("text-sm text-green-600 mt-0.5")}>
                Paid: {b.currency ?? "ZAR"} {totalPaid.toLocaleString()}
              </Text>
            )}
            {outstanding > 0 && (
              <Text style={twStyle("text-sm font-medium text-amber-600 mt-0.5")}>
                Outstanding: {b.currency ?? "ZAR"} {outstanding.toLocaleString()}
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
                  {yocoIntegration?.is_enabled && outstanding > 0 && (
                    <TouchableOpacity
                      onPress={() => setShowYocoPayment(true)}
                      style={twStyle("rounded-xl border border-primary bg-primary/10 py-2.5 px-4")}
                    >
                      <Text style={twStyle("font-medium text-primary")}>Pay with Yoco</Text>
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
                    setRefundAmount(totalPaid.toFixed(2));
                    setShowRefund(true);
                  }}
                  style={twStyle("rounded-xl border border-red-300 py-2.5 px-4")}
                >
                  <Text style={twStyle("font-medium text-red-700")}>Refund</Text>
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
                </Text>
                {s.staff_name && (
                  <Text style={twStyle("text-sm text-gray-500")}>{s.staff_name}</Text>
                )}
                {s.scheduled_start_at && (
                  <Text style={twStyle("text-xs text-gray-500 mt-1")}>
                    {new Date(s.scheduled_start_at).toLocaleTimeString()}
                    {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
                  </Text>
                )}
                {typeof s.price === "number" && (
                  <Text style={twStyle("text-sm text-gray-600 mt-1")}>ZAR {s.price.toLocaleString()}</Text>
                )}
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
          <View style={twStyle("flex-row flex-wrap")}>
            {rescheduleSlots.length > 0 ? (
              rescheduleSlots.slice(0, 24).map((slot) => {
                const isSelected = rescheduleTime === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    onPress={() => setRescheduleTime(slot)}
                    style={[twStyle("rounded-lg px-3 py-2 mr-2 mb-2"), isSelected ? twStyle("bg-gray-900") : twStyle("border border-gray-200 bg-white")]}
                  >
                    <Text style={twStyle(`text-sm font-medium ${isSelected ? "text-white" : "text-gray-700"}`)}>{slot}</Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={twStyle("text-sm text-gray-500")}>Loading slots…</Text>
            )}
          </View>
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
          <Text style={twStyle("text-sm text-gray-600 mb-2")}>Outstanding: {b.currency ?? "ZAR"} {outstanding.toFixed(2)}</Text>
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
          <Text style={twStyle("text-sm text-gray-600 mb-2")}>Total paid: {b.currency ?? "ZAR"} {totalPaid.toFixed(2)}</Text>
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
          <Text style={twStyle("text-xs text-gray-500 mb-3")}>{"Refund will be added to the customer's wallet."}</Text>
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
          <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Amount ({b.currency ?? "ZAR"})</Text>
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
            Send a link to the customer so they can pay online (Paystack). Outstanding: {b.currency ?? "ZAR"} {outstanding.toFixed(2)}
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

      {/* Yoco card payment then mark paid */}
      <YocoPaymentSheet
        visible={showYocoPayment}
        onClose={() => setShowYocoPayment(false)}
        amountCents={Math.round(outstanding * 100)}
        currency={b.currency ?? "ZAR"}
        bookingId={id}
        description={`Booking ${b.booking_number ?? id}`}
        onPaymentSuccess={async (result) => {
          if (!id) return;
          await postMutation(`/api/provider/bookings/${id}/mark-paid`, {
            payment_method: "card",
            reference: result.reference,
          });
          refresh();
          setShowYocoPayment(false);
        }}
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
            <TouchableOpacity
              onPress={() => {
                dismissProviderCompletionModal(true);
                router.push("/(app)/(tabs)/more/explore-posts?create=1" as any);
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
          <Text style={twStyle("text-sm text-gray-600 mb-3")}>How was your experience with this client?</Text>
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
                  {new Date(entry.created_at).toLocaleString()}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
