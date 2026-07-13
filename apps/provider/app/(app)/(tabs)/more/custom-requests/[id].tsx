/**
 * Custom request detail: view request and send an offer (POST /api/provider/custom-requests/[id]/offers).
 * Loads request via GET /api/provider/custom-requests/[id]. Supports travel_fee when request is at_home.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { ErrorState } from "@/components/ui/ErrorState";
import { BookingDateStrip, BookingTimeSlotGrid } from "@/components/bookings/BookingDateTimePicker";
import type { BookingSlotRow } from "@/lib/booking-date-time-helpers";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatCurrency } from "@/lib/format";
import { useProvider } from "@/providers/ProviderContext";
import { buildZonedIsoForWallClock } from "@/lib/tz";

type CustomRequest = {
  id: string;
  description?: string | null;
  status?: string | null;
  declined_reason?: string | null;
  created_at: string;
  currency?: string | null;
  location_type?: string | null;
  duration_minutes?: number | null;
  preferred_start_at?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  service_category_id?: string | null;
  /** Joined from `global_service_categories` (GET detail). */
  service_category?: { id?: string; name?: string | null; slug?: string | null } | null;
  service_name?: string | null;
  customer?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  attachments?: { id: string; url: string; created_at?: string }[];
  offers?: {
    id: string;
    status?: string;
    price?: number;
    currency?: string;
    created_at?: string;
    duration_minutes?: number;
    expiration_at?: string;
    notes?: string | null;
    travel_fee?: number | null;
    booking_id?: string | null;
    staff?: { name?: string | null } | null;
    location?: { name?: string | null } | null;
  }[];
  /** Filled when customer submitted a house-call address with the request (migration 265). */
  address_line1?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_country?: string | null;
  address_postal_code?: string | null;
};

interface AvailableSlotRow {
  time: string;
  available?: boolean;
}

interface AvailableSlotsResponse {
  slots?: string[];
  slot_grid?: AvailableSlotRow[];
  provider_timezone?: string | null;
}

interface CrOfferDetail {
  id: string;
  status: string;
  price?: number;
  currency?: string;
  duration_minutes?: number;
  expiration_at?: string | null;
  notes?: string | null;
  travel_fee?: number | null;
  booking_id?: string | null;
  request?: {
    service_name?: string | null;
    description?: string | null;
    location_type?: string | null;
    preferred_start_at?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    address_city?: string | null;
    address_state?: string | null;
    address_postal_code?: string | null;
  } | null;
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timeKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}


function formatDateTimeSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

export default function CustomRequestDetailScreen() {
  const router = useRouter();
  const { selectedLocationId, provider: providerFromContext } = useProvider();
  const providerTz = providerFromContext?.timezone ?? null;
  const tenantCurrency = getTenantDefaultCurrency();
  const { id } = useLocalSearchParams<{ id: string }>();
  const requestId = id ?? "";

  const { data: requestData, loading: detailLoading, error: detailError, refresh } = useApi<
    CustomRequest | { data?: CustomRequest }
  >(`/api/provider/custom-requests/${requestId}`, { enabled: !!requestId });
  const request = (requestData && !Array.isArray(requestData) && "id" in requestData
    ? requestData
    : (requestData as { data?: CustomRequest })?.data) ?? null;

  const { data: locationsData } = useApi<{ id: string; name: string }[]>("/api/provider/locations", {
    enabled: !!request,
  });
  const teamUrl = useMemo(
    () =>
      selectedLocationId
        ? `/api/provider/team?location_id=${encodeURIComponent(selectedLocationId)}`
        : "/api/provider/team",
    [selectedLocationId],
  );
  const { data: teamData } = useApi<{ id: string; name: string }[]>(teamUrl, {
    enabled: !!request,
  });
  const locations = locationsData ?? [];
  const staffList = Array.isArray(teamData) ? teamData : [];

  const [price, setPrice] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [expirationDays, setExpirationDays] = useState("7");
  const [notes, setNotes] = useState("");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<Date>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  });
  const [travelFee, setTravelFee] = useState("");
  const travelFeeUserLockedRef = useRef(false);
  const [travelFeePreviewLoading, setTravelFeePreviewLoading] = useState(false);
  const [travelPreviewMinutes, setTravelPreviewMinutes] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [offerDetailVisible, setOfferDetailVisible] = useState(false);
  const [offerDetailLoading, setOfferDetailLoading] = useState(false);
  const [offerDetailData, setOfferDetailData] = useState<CrOfferDetail | null>(null);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const selectedDateKey = dateKey(scheduledAt);
  const selectedTimeKey = timeKey(scheduledAt);
  const isAtHome = request?.location_type === "at_home";
  const defaultDuration = request?.duration_minutes ?? 60;
  const requestCurrency = request?.currency ?? tenantCurrency;
  const canSendOffer =
    !!request && ["pending", "offered"].includes(String(request.status ?? "pending").toLowerCase());
  const priceNum = price.trim() === "" ? NaN : Number(price);
  const durationNum = Number(durationMinutes);
  const expDaysNum = Number(expirationDays);
  const isValid =
    request &&
    canSendOffer &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    Number.isFinite(durationNum) &&
    durationNum >= 15 &&
    durationNum <= 480 &&
    Number.isFinite(expDaysNum) &&
    expDaysNum >= 1;
  const atHomeTravelBufferMinutes = useMemo(() => {
    if (!isAtHome) return 0;
    if (travelPreviewMinutes != null && Number.isFinite(travelPreviewMinutes) && travelPreviewMinutes > 0) {
      return Math.ceil(travelPreviewMinutes);
    }
    return 30;
  }, [isAtHome, travelPreviewMinutes]);

  const slotsUrl = useMemo(() => {
    if (!request || !selectedDateKey) return "";
    if (!Number.isFinite(durationNum) || durationNum < 15) return "";
    let q = `/api/provider/bookings/available-slots?date=${encodeURIComponent(selectedDateKey)}&duration_minutes=${encodeURIComponent(String(durationNum))}`;
    if (staffId) q += `&staff_ids=${encodeURIComponent(staffId)}`;
    if (!isAtHome && locationId) q += `&location_id=${encodeURIComponent(locationId)}`;
    q += isAtHome
      ? `&mode=mobile&travel_buffer=${encodeURIComponent(String(atHomeTravelBufferMinutes))}`
      : "&mode=salon&travel_buffer=0";
    return q;
  }, [durationNum, isAtHome, locationId, request, selectedDateKey, staffId, atHomeTravelBufferMinutes]);
  const { data: slotsData, loading: slotsLoading } = useApi<AvailableSlotsResponse>(slotsUrl, {
    enabled: slotsUrl.length > 0,
  });
  const slotRows = useMemo<BookingSlotRow[]>(() => {
    if (Array.isArray(slotsData?.slot_grid) && slotsData.slot_grid.length > 0) {
      return slotsData.slot_grid.map((row) => ({ time: row.time, available: row.available !== false }));
    }
    if (Array.isArray(slotsData?.slots)) return slotsData.slots.map((time) => ({ time, available: true }));
    return [];
  }, [slotsData]);

  useEffect(() => {
    travelFeeUserLockedRef.current = false;
  }, [
    request?.address_line1,
    request?.address_line2,
    request?.address_city,
    request?.address_postal_code,
    request?.address_country,
  ]);

  useEffect(() => {
    if (!isAtHome || !request || !providerFromContext?.id) {
      setTravelPreviewMinutes(null);
      return;
    }
    const line1 = request.address_line1?.trim() ?? "";
    const city = request.address_city?.trim() ?? "";
    if (!line1 || !city) {
      setTravelPreviewMinutes(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setTravelFeePreviewLoading(true);
        try {
          const country = (request.address_country?.trim() || "South Africa");
          const addressString = [
            line1,
            request.address_line2,
            city,
            request.address_postal_code,
            request.address_state,
            country,
          ]
            .filter((x) => (x != null && String(x).trim().length > 0))
            .map((x) => String(x).trim())
            .join(", ");
          const res = await api.post<{
            valid?: boolean;
            travelFee?: number;
            travelTimeMinutes?: number;
          }>("/api/location/validate", {
            address: addressString,
            provider_id: providerFromContext.id,
          });
          if (cancelled) return;
          if (res.error) {
            setTravelPreviewMinutes(null);
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
            if (!travelFeeUserLockedRef.current) {
              setTravelFee(fee === 0 ? "" : fee.toFixed(2));
            }
          } else {
            setTravelPreviewMinutes(null);
            if (!travelFeeUserLockedRef.current) setTravelFee("");
          }
        } catch {
          if (!cancelled) setTravelPreviewMinutes(null);
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
    isAtHome,
    request?.id,
    request?.address_line1,
    request?.address_line2,
    request?.address_city,
    request?.address_state,
    request?.address_country,
    request?.address_postal_code,
    providerFromContext?.id,
    request,
  ]);

  useEffect(() => {
    if (request?.duration_minutes != null && request.duration_minutes > 0) {
      setDurationMinutes(String(request.duration_minutes));
    }
    // §Provider-audit 2026-04 (round 7): pre-fill the offer's proposed time
    // with the customer's preferred slot when they supplied one. Previously
    // the sheet always opened at "now + 1h" even when the customer's request
    // explicitly asked for, say, Saturday 2pm — forcing the provider to
    // re-enter it and risking an accidental mismatch.
    if (request?.preferred_start_at) {
      const preferred = new Date(request.preferred_start_at);
      if (Number.isFinite(preferred.getTime()) && preferred.getTime() > Date.now()) {
        setScheduledAt(preferred);
      }
    }
  }, [request?.id, request?.duration_minutes, request?.preferred_start_at]);

  useEffect(() => {
    const available = slotRows.filter((slot) => slot.available !== false).map((slot) => slot.time.slice(0, 5));
    if (available.length === 0 || available.includes(selectedTimeKey)) return;
    const iso = buildZonedIsoForWallClock(selectedDateKey, available[0], slotsData?.provider_timezone ?? providerTz);
    const next = new Date(iso);
    if (Number.isFinite(next.getTime())) setScheduledAt(next);
  }, [providerTz, selectedDateKey, selectedTimeKey, slotRows, slotsData?.provider_timezone]);

  const sendOffer = useCallback(async () => {
    if (!requestId || !request || !isValid) return;
    setSubmitting(true);
    try {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + Number(expirationDays));
      const payload: Record<string, unknown> = {
        price: Number(price),
        currency: requestCurrency || tenantCurrency,
        duration_minutes: Number(durationMinutes),
        expiration_at: expDate.toISOString(),
        notes: notes.trim() || null,
        staff_id: staffId || null,
        location_id: locationId || null,
        scheduled_at: buildZonedIsoForWallClock(
          selectedDateKey,
          selectedTimeKey,
          slotsData?.provider_timezone ?? providerTz,
        ),
      };
      if (isAtHome) {
        const fee = Number(travelFee);
        if (!Number.isNaN(fee) && fee >= 0) payload.travel_fee = fee;
      }
      const res = editingOfferId
        ? await api.patch(`/api/provider/custom-offers/${editingOfferId}`, payload)
        : await api.post(`/api/provider/custom-requests/${requestId}/offers`, payload);
      if ((res as { error?: { message?: string } }).error) {
        const msg = (res as { error: { message?: string } }).error.message ?? (editingOfferId ? "Failed to update offer" : "Failed to send offer");
        Alert.alert("Error", msg);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(editingOfferId ? "Offer updated" : "Offer sent", editingOfferId ? "The customer will be notified of your revised offer." : "The customer will be notified and can accept the offer.", [
        { text: "OK", onPress: () => { setEditingOfferId(null); router.back(); } },
      ]);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : (editingOfferId ? "Failed to update offer" : "Failed to send offer"));
    } finally {
      setSubmitting(false);
    }
  }, [
    requestId,
    request,
    isValid,
    price,
    durationMinutes,
    expirationDays,
    notes,
    staffId,
    locationId,
    selectedDateKey,
    selectedTimeKey,
    slotsData?.provider_timezone,
    providerTz,
    isAtHome,
    travelFee,
    tenantCurrency,
    requestCurrency,
    router,
    editingOfferId,
  ]);

  const declineRequest = useCallback(() => {
    if (!requestId) return;
    Alert.prompt?.(
      "Decline request",
      "Optionally tell the customer why you cannot fulfil this request.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async (reason?: string) => {
            try {
              const res = await api.post(`/api/provider/custom-requests/${requestId}/decline`, {
                reason: reason?.trim() || null,
              });
              if (res.error) {
                Alert.alert("Error", (res.error as { message?: string }).message ?? "Failed to decline request");
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to decline request");
            }
          },
        },
      ],
      "plain-text",
    ) ?? Alert.alert("Decline request", "Are you sure you want to decline this custom request?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await api.post(`/api/provider/custom-requests/${requestId}/decline`, {});
            if (res.error) {
              Alert.alert("Error", (res.error as { message?: string }).message ?? "Failed to decline request");
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to decline request");
          }
        },
      },
    ]);
  }, [requestId, router]);

  const openOfferDetail = useCallback(async (offerId: string) => {
    setOfferDetailData(null);
    setOfferDetailVisible(true);
    setOfferDetailLoading(true);
    try {
      const res = await api.get<CrOfferDetail>(`/api/provider/custom-offers/${offerId}`);
      if (res.data) setOfferDetailData(res.data);
    } catch {
      // sheet shows error state
    } finally {
      setOfferDetailLoading(false);
    }
  }, []);

  if (!requestId) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Request" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message="Request not found" />
        </View>
      </ScreenContainer>
    );
  }

  if (detailLoading && !request) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Request" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center")}>
          <ActivityIndicator size="large" />
        </View>
      </ScreenContainer>
    );
  }

  if (detailError || !request) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Request" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState
            message={detailError ?? "Request not found"}
            onRetry={refresh}
            retryLabel="Retry"
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Custom request"
        subtitle={request.customer?.full_name ?? request.customer?.email ?? "Customer"}
        onBack={() => router.back()}
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4")}>
          <View style={twStyle("mb-2 flex-row items-center justify-between")}>
            <Text style={twStyle("text-xs font-medium uppercase tracking-wide text-gray-500")}>Request</Text>
            {request.status ? (
              <View style={twStyle("rounded-full bg-white px-2 py-0.5")}>
                <Text style={twStyle("text-xs font-semibold capitalize text-gray-800")}>{request.status}</Text>
              </View>
            ) : null}
          </View>
          {canSendOffer ? (
            <TouchableOpacity
              onPress={declineRequest}
              style={twStyle("mb-3 self-start rounded-lg border border-red-200 bg-red-50 px-3 py-2")}
            >
              <Text style={twStyle("text-sm font-semibold text-red-700")}>Decline request</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={twStyle("mt-1 text-base text-gray-900")}>{request.description ?? "—"}</Text>
          {request.status === "declined" && request.declined_reason ? (
            <View style={twStyle("mt-3 rounded-lg border border-red-200 bg-red-50 p-3")}>
              <Text style={twStyle("text-sm text-red-800")}>Declined: {request.declined_reason}</Text>
            </View>
          ) : null}
          {(request.service_name || request.service_category?.name) ? (
            <View style={twStyle("mt-2 flex-row flex-wrap")}>
              {request.service_category?.name ? (
                <View style={twStyle("mr-2 mb-2 rounded-full bg-white px-2 py-1")}>
                  <Text style={twStyle("text-xs font-medium text-gray-800")}>
                    Category: {request.service_category.name}
                  </Text>
                </View>
              ) : null}
              {request.service_name ? (
                <View style={twStyle("mb-2 rounded-full bg-white px-2 py-1")}>
                  <Text style={twStyle("text-xs font-medium text-gray-800")}>
                    Service: {request.service_name}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {request.customer?.phone ? (
            <Text style={twStyle("mt-2 text-sm text-gray-600")}>Customer phone: {request.customer.phone}</Text>
          ) : null}
          <View style={twStyle("mt-2 flex-row flex-wrap")}>
            <Text style={[twStyle("text-sm text-gray-600"), { marginRight: 8, marginBottom: 8 }]}>
              {request.location_type === "at_home" ? "At home" : "At salon"}
            </Text>
            {request.duration_minutes != null && (
              <Text style={[twStyle("text-sm text-gray-600"), { marginRight: 8, marginBottom: 8 }]}>· {request.duration_minutes} min</Text>
            )}
            {(request.budget_min != null || request.budget_max != null) && (
              <Text style={twStyle("text-sm text-gray-600")}>
                · Budget: {formatCurrency(Number(request.budget_min ?? 0), requestCurrency)} –{" "}
                {formatCurrency(Number(request.budget_max ?? 0), requestCurrency)}
              </Text>
            )}
          </View>
            {request.preferred_start_at && (
              <Text style={twStyle("mt-1 text-sm text-gray-600")}>
                Preferred: {formatDateTimeSafe(request.preferred_start_at)}
              </Text>
            )}
            {request.location_type === "at_home" && (request.address_line1 || request.address_city) && (
              <Text style={twStyle("mt-1 text-sm text-gray-600")}>
                Address: {[request.address_line1, request.address_line2, request.address_city, request.address_state, request.address_postal_code, request.address_country].filter(Boolean).join(", ")}
              </Text>
            )}
          </View>

        {request.attachments && request.attachments.length > 0 ? (
          <View style={twStyle("mb-4 rounded-xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Attachments</Text>
            <View style={twStyle("flex-row flex-wrap gap-2")}>
              {request.attachments.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => pushInAppBrowser(router, a.url, "Attachment")}
                  style={twStyle("overflow-hidden rounded-lg")}
                  accessibilityRole="button"
                  accessibilityLabel="View attachment image"
                >
                  <Image
                    source={{ uri: a.url }}
                    style={{ width: 96, height: 96 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {request.offers && request.offers.length > 0 ? (() => {
          const allInactive = request.offers!.every((o) => {
            if (o.status === "withdrawn" || o.status === "paid" || o.status === "expired") return true;
            if (o.expiration_at && new Date(o.expiration_at).getTime() < Date.now()) return true;
            return false;
          });
          const hasWithdrawnOrExpired = request.offers!.some((o) => o.status === "withdrawn" || o.status === "expired" || (o.expiration_at && new Date(o.expiration_at).getTime() < Date.now()));
          const noneActive = allInactive && !request.offers!.some((o) => o.status === "paid");
          return (
          <View style={twStyle("mb-4 rounded-xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Offers</Text>
            {noneActive && canSendOffer ? (
              <View style={twStyle("mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2")}>
                <Text style={twStyle("text-xs text-blue-800")}>
                  {hasWithdrawnOrExpired ? "Your previous offer was withdrawn or expired." : "No active offer."} You can send a new one below.
                </Text>
              </View>
            ) : null}
            {request.offers!.map((o) => {
              const isInactive = o.status === "withdrawn" || o.status === "expired" || (o.expiration_at && new Date(o.expiration_at).getTime() < Date.now());
              const isPaid = o.status === "paid";
              const statusColour = isPaid ? "#166534" : isInactive ? "#6b7280" : "#1E40AF";
              const statusBg = isPaid ? "#DCFCE7" : isInactive ? "#F3F4F6" : "#EFF6FF";
              return (
              <TouchableOpacity
                key={o.id}
                activeOpacity={0.8}
                onPress={() => openOfferDetail(o.id)}
                style={twStyle("mb-3 border-b border-gray-100 pb-3 last:mb-0 last:border-0")}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>
                    {formatCurrency(Number(o.price ?? 0), o.currency ?? requestCurrency)}
                    {typeof o.travel_fee === "number" && o.travel_fee > 0
                      ? `  + ${formatCurrency(o.travel_fee, o.currency ?? requestCurrency)} travel`
                      : ""}
                  </Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: statusBg }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: statusColour, textTransform: "capitalize" }}>
                      {o.status ?? "pending"}
                    </Text>
                  </View>
                </View>
                <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>
                  {o.duration_minutes != null ? `${o.duration_minutes} min` : ""}
                  {o.staff?.name ? ` · ${o.staff.name}` : ""}
                  {o.location?.name ? ` · ${o.location.name}` : ""}
                </Text>
                {o.expiration_at ? (
                  <Text style={[twStyle("text-xs mt-0.5"), { color: isInactive ? "#B45309" : "#6b7280" }]}>
                    {isInactive && o.status !== "paid" && o.status !== "withdrawn" ? "Expired: " : "Expires: "}
                    {formatDateTimeSafe(o.expiration_at)}
                  </Text>
                ) : null}
                {o.notes ? (
                  <Text style={twStyle("text-xs text-gray-500 mt-1 italic")}>{o.notes}</Text>
                ) : null}
                <Text style={twStyle("text-[10px] text-gray-400 mt-1 text-right")}>Tap for full details</Text>
              </TouchableOpacity>
              );
            })}
          </View>
          );
        })() : null}

        {!canSendOffer ? (
          <View style={twStyle("mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4")}>
            <Text style={twStyle("text-sm text-amber-900")}>
              This request is {request.status ?? "closed"}. New offers cannot be sent from the app.
            </Text>
          </View>
        ) : (
          <>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>
              {editingOfferId ? "Edit offer" : "Send offer"}
            </Text>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Price ({requestCurrency}) *</Text>
            <TextInput
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#9ca3af"
            />

            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Duration (minutes) *</Text>
            <TextInput
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              value={durationMinutes}
              onChangeText={setDurationMinutes}
              keyboardType="number-pad"
              placeholder={String(defaultDuration)}
              placeholderTextColor="#9ca3af"
            />

            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Offer expires in (days)</Text>
            <TextInput
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              value={expirationDays}
              onChangeText={setExpirationDays}
              keyboardType="number-pad"
              placeholder="7"
              placeholderTextColor="#9ca3af"
            />

            {request.location_type === "at_salon" && locations.length > 0 && (
              <>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Venue (optional)</Text>
                <View style={twStyle("mb-3 flex-row flex-wrap")}>
                  {locations.map((loc) => (
                    <TouchableOpacity
                      key={loc.id}
                      onPress={() => setLocationId(locationId === loc.id ? null : loc.id)}
                      style={[twStyle(`rounded-xl border px-3 py-2 ${
                        locationId === loc.id ? "border-primary bg-primary/10" : "border-gray-200 bg-gray-50"
                      }`), { marginRight: 8, marginBottom: 8 }]}
                    >
                      <Text
                        style={twStyle(`text-sm ${locationId === loc.id ? "font-medium text-primary" : "text-gray-600"}`)}
                      >
                        {loc.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {staffList.length > 0 && (
              <>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Assigned staff (optional)</Text>
                <View style={twStyle("mb-3 flex-row flex-wrap")}>
                  {staffList.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setStaffId(staffId === s.id ? null : s.id)}
                      style={[twStyle(`rounded-xl border px-3 py-2 ${
                        staffId === s.id ? "border-primary bg-primary/10" : "border-gray-200 bg-gray-50"
                      }`), { marginRight: 8, marginBottom: 8 }]}
                    >
                      <Text
                        style={twStyle(`text-sm ${staffId === s.id ? "font-medium text-primary" : "text-gray-600"}`)}
                      >
                        {s.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={twStyle("mb-1 text-sm font-semibold text-gray-700")}>Proposed date and time</Text>
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>
              Choose a real availability-engine slot so the customer can pay for a time you can honour.
            </Text>
            {/* Date strip — 14-day window matches the offer flow */}
            <View style={twStyle("mb-3")}>
              <BookingDateStrip
                selectedDate={scheduledAt}
                onSelectDate={(d) => {
                  const key = dateKey(d);
                  const iso = buildZonedIsoForWallClock(key, selectedTimeKey, slotsData?.provider_timezone ?? providerTz);
                  const next = new Date(iso);
                  if (Number.isFinite(next.getTime())) setScheduledAt(next);
                }}
                rangeDays={14}
              />
            </View>
            {/* Slot grid — no truncation, period-grouped, consistent with all other booking flows */}
            <View style={twStyle("mb-3")}>
              <BookingTimeSlotGrid
                rows={slotRows}
                selectedTime={selectedTimeKey}
                onSelectTime={(time) => {
                  const iso = buildZonedIsoForWallClock(selectedDateKey, time, slotsData?.provider_timezone ?? providerTz);
                  const next = new Date(iso);
                  if (Number.isFinite(next.getTime())) setScheduledAt(next);
                }}
                loading={slotsLoading}
                providerTimezone={slotsData?.provider_timezone ?? null}
                showNextAvailable
                showLegend
              />
            </View>

            {isAtHome && (
              <>
                {(request.address_line1?.trim() || request.address_city?.trim()) ? (
                  <Text style={twStyle("mb-2 text-xs text-gray-600")}>
                    Customer address on file:{" "}
                    {[request.address_line1, request.address_city, request.address_postal_code]
                      .filter(Boolean)
                      .join(", ")}
                  </Text>
                ) : (
                  <Text style={twStyle("mb-2 text-xs text-amber-800")}>
                    No street address on this request — enter a travel fee manually or ask the customer to update their
                    request with a full address.
                  </Text>
                )}
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                  Travel fee ({requestCurrency}) — calculated when address is on file (override optional)
                </Text>
                {travelFeePreviewLoading ? (
                  <View style={twStyle("mb-2 flex-row items-center")}>
                    <ActivityIndicator size="small" color="#6366f1" />
                    <Text style={twStyle("ml-2 text-xs text-gray-600")}>Calculating travel fee…</Text>
                  </View>
                ) : null}
                <TextInput
                  style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  value={travelFee}
                  onChangeText={(t) => {
                    travelFeeUserLockedRef.current = true;
                    setTravelFee(t);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                />
              </>
            )}

            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Notes (optional)</Text>
            <TextInput
              style={twStyle("mb-4 min-h-[80px] rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional details for the customer..."
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
            />

            {!isValid ? (
              <Text style={twStyle("mb-2 text-xs text-amber-800")}>
                Enter a price (0 or more), duration between 15 and 480 minutes, and offer expiry of at least 1 day
                to send an offer.
              </Text>
            ) : null}
            <ActionButton
              label="Send offer"
              onPress={sendOffer}
              loading={submitting}
              fullWidth
              disabled={!isValid}
            />
          </>
        )}
      </ScrollView>

      {/* Offer detail sheet */}
      <Modal
        visible={offerDetailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOfferDetailVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          onPress={() => setOfferDetailVisible(false)}
        >
          <Pressable
            style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 36, maxHeight: "88%" }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginBottom: 14 }} />
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 18 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: "#111827" }}>Offer details</Text>
              <TouchableOpacity onPress={() => setOfferDetailVisible(false)} hitSlop={12}>
                <Text style={{ fontSize: 22, color: "#9ca3af" }}>×</Text>
              </TouchableOpacity>
            </View>
            {offerDetailLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator size="large" color="#0f3460" />
              </View>
            ) : !offerDetailData ? (
              <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 20 }}>
                <Text style={{ color: "#6b7280", textAlign: "center" }}>Could not load offer details.</Text>
              </View>
            ) : (() => {
              const d = offerDetailData;
              const req = d.request;
              const isExpired = d.status === "expired" || (d.expiration_at && new Date(d.expiration_at).getTime() < Date.now());
              const isWithdrawn = d.status === "withdrawn";
              const isPaid = d.status === "paid";
              const isPending = d.status === "pending";
              const isChangesRequested = d.status === "changes_requested";

              const fmtDate = (iso: string | null | undefined) => {
                if (!iso) return "—";
                return new Date(iso).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
              };

              const statusBadge = isWithdrawn
                ? { label: "Withdrawn", bg: "#FEF3C7", text: "#92400E" }
                : isExpired
                ? { label: "Expired", bg: "#F3F4F6", text: "#6B7280" }
                : isPaid
                ? { label: "Paid / Booked", bg: "#DCFCE7", text: "#166534" }
                : d.status === "payment_pending"
                ? { label: "Payment in progress", bg: "#DBEAFE", text: "#1D4ED8" }
                : isChangesRequested
                ? { label: "Changes requested", bg: "#E0E7FF", text: "#3730A3" }
                : { label: "Pending acceptance", bg: "#EFF6FF", text: "#1E40AF" };

              const locLabel = req?.location_type === "at_home" ? "At home" : req?.location_type === "at_salon" ? "At salon" : req?.location_type ?? "—";
              const addrParts = [req?.address_line1, req?.address_line2, req?.address_city, req?.address_state, req?.address_postal_code].filter(Boolean);

              return (
                <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                  <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: statusBadge.bg, marginBottom: 16 }}>
                    <Text style={{ color: statusBadge.text, fontSize: 12, fontWeight: "700" }}>{statusBadge.label}</Text>
                  </View>
                  {req?.service_name ? (
                    <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 4 }}>{req.service_name}</Text>
                  ) : null}
                  <Text style={{ fontSize: 28, fontWeight: "800", color: "#0f3460", marginBottom: 4 }}>
                    {formatCurrency(d.price ?? 0, d.currency ?? "")}
                    {typeof d.travel_fee === "number" && d.travel_fee > 0
                      ? `  + ${formatCurrency(d.travel_fee, d.currency ?? "")} travel`
                      : ""}
                  </Text>
                  {req?.description ? (
                    <Text style={{ color: "#4b5563", fontSize: 14, marginBottom: 14, lineHeight: 20 }}>{req.description}</Text>
                  ) : null}
                  <View style={{ gap: 10 }}>
                    {d.duration_minutes ? (
                      <Text style={{ color: "#374151", fontSize: 14 }}>⏱ {d.duration_minutes} min</Text>
                    ) : null}
                    {req?.preferred_start_at ? (
                      <Text style={{ color: "#374151", fontSize: 14 }}>📅 {fmtDate(req.preferred_start_at)}</Text>
                    ) : null}
                    {d.expiration_at ? (
                      <Text style={{ color: isExpired ? "#B45309" : "#374151", fontSize: 14 }}>⏳ Offer expires: {fmtDate(d.expiration_at)}</Text>
                    ) : null}
                    {req?.location_type ? (
                      <View>
                        <Text style={{ color: "#374151", fontSize: 14 }}>📍 {locLabel}</Text>
                        {addrParts.length > 0 ? (
                          <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 2, marginLeft: 20 }}>{addrParts.join(", ")}</Text>
                        ) : null}
                      </View>
                    ) : null}
                    {d.notes ? (
                      <Text style={{ color: "#374151", fontSize: 14, lineHeight: 20 }}>📝 {d.notes}</Text>
                    ) : null}
                  </View>
                  {(isPending || isChangesRequested) && d.id ? (
                    <TouchableOpacity
                      onPress={() => {
                        setOfferDetailVisible(false);
                        setTimeout(() => {
                          Alert.alert("Withdraw offer", "Are you sure you want to withdraw this offer?", [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Withdraw",
                              style: "destructive",
                              onPress: async () => {
                                try {
                                  await api.post(`/api/provider/custom-offers/${d.id}/retract`, {});
                                  refresh();
                                } catch {
                                  Alert.alert("Error", "Could not withdraw the offer.");
                                }
                              },
                            },
                          ]);
                        }, 300);
                      }}
                      style={{ marginTop: 24, borderRadius: 12, backgroundColor: "#F59E0B", alignItems: "center", paddingVertical: 14 }}
                    >
                      <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Withdraw offer</Text>
                    </TouchableOpacity>
                  ) : null}
                  {(isPending || isChangesRequested) && d.id ? (
                    <TouchableOpacity
                      onPress={async () => {
                        setOfferDetailVisible(false);
                        setEditingOfferId(d.id);
                        setPrice(String(d.price ?? ""));
                        setDurationMinutes(String(d.duration_minutes ?? defaultDuration));
                        setNotes(d.notes ?? "");
                        if (d.expiration_at) {
                          const daysLeft = Math.max(1, Math.ceil((new Date(d.expiration_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
                          setExpirationDays(String(daysLeft));
                        }
                      }}
                      style={{ marginTop: 12, borderRadius: 12, backgroundColor: "#1D4ED8", alignItems: "center", paddingVertical: 14 }}
                    >
                      <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Edit offer</Text>
                    </TouchableOpacity>
                  ) : null}
                </ScrollView>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}
