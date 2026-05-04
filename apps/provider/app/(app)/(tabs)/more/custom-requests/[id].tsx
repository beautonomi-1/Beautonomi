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
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { ErrorState } from "@/components/ui/ErrorState";
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

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timeKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function labelDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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
  const selectedDateKey = dateKey(scheduledAt);
  const selectedTimeKey = timeKey(scheduledAt);
  const dateOptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

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
    priceNum > 0 &&
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
  const slotRows = useMemo(() => {
    if (Array.isArray(slotsData?.slot_grid) && slotsData.slot_grid.length > 0) return slotsData.slot_grid;
    if (Array.isArray(slotsData?.slots)) return slotsData.slots.map((time) => ({ time, available: true }));
    return [] as AvailableSlotRow[];
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
      const res = await api.post(`/api/provider/custom-requests/${requestId}/offers`, payload);
      if ((res as { error?: { message?: string } }).error) {
        const msg = (res as { error: { message?: string } }).error.message ?? "Failed to send offer";
        Alert.alert("Error", msg);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Offer sent", "The customer will be notified and can accept the offer.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to send offer");
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
  ]);

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
          <Text style={twStyle("mt-1 text-base text-gray-900")}>{request.description ?? "—"}</Text>
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
        </View>

        {request.attachments && request.attachments.length > 0 ? (
          <View style={twStyle("mb-4 rounded-xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Attachments</Text>
            {request.attachments.map((a) => (
              <TouchableOpacity
                key={a.id}
                onPress={() => Linking.openURL(a.url)}
                style={twStyle("mb-2 flex-row items-center")}
                accessibilityRole="link"
                accessibilityLabel="Open attachment"
              >
                <Text style={twStyle("text-sm font-medium text-primary")} numberOfLines={1}>
                  {a.url.replace(/^https?:\/\//, "").slice(0, 48)}
                  {a.url.length > 52 ? "…" : ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {request.offers && request.offers.length > 0 ? (
          <View style={twStyle("mb-4 rounded-xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Offers</Text>
            {request.offers.map((o) => (
              <View key={o.id} style={twStyle("mb-3 border-b border-gray-100 pb-3 last:mb-0 last:border-0")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>
                  {formatCurrency(Number(o.price ?? 0), o.currency ?? requestCurrency)} · {o.status ?? "—"}
                </Text>
                <Text style={twStyle("text-xs text-gray-500")}>
                  {o.duration_minutes != null ? `${o.duration_minutes} min` : ""}
                  {o.staff?.name ? ` · ${o.staff.name}` : ""}
                  {o.location?.name ? ` · ${o.location.name}` : ""}
                </Text>
                {o.expiration_at ? (
                  <Text style={twStyle("text-xs text-gray-400")}>Expires: {formatDateTimeSafe(o.expiration_at)}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {!canSendOffer ? (
          <View style={twStyle("mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4")}>
            <Text style={twStyle("text-sm text-amber-900")}>
              This request is {request.status ?? "closed"}. New offers cannot be sent from the app.
            </Text>
          </View>
        ) : (
          <>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Send offer</Text>
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

            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Proposed date and time</Text>
            <Text style={twStyle("mb-1 text-xs text-gray-500")}>
              Choose a real availability-engine slot so the customer can pay for a time you can honour.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-2")}>
              <View style={twStyle("flex-row")}>
                {dateOptions.map((d) => {
                  const key = dateKey(d);
                  const active = key === selectedDateKey;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => {
                        const iso = buildZonedIsoForWallClock(key, selectedTimeKey, slotsData?.provider_timezone ?? providerTz);
                        const next = new Date(iso);
                        if (Number.isFinite(next.getTime())) setScheduledAt(next);
                      }}
                      style={[twStyle(`rounded-2xl border px-3 py-2 ${active ? "border-emerald-600 bg-emerald-50" : "border-gray-200 bg-white"}`), { marginRight: 8 }]}
                    >
                      <Text style={twStyle(`text-xs font-semibold ${active ? "text-emerald-700" : "text-gray-700"}`)}>
                        {labelDate(d)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <View style={twStyle("mb-3 flex-row flex-wrap")}>
              {slotsLoading ? (
                <Text style={twStyle("text-xs text-gray-500")}>Loading available times...</Text>
              ) : slotRows.length === 0 ? (
                <Text style={twStyle("text-xs text-amber-700")}>No available slots for this date. Try another day, staff member, or duration.</Text>
              ) : (
                slotRows.slice(0, 30).map((slot) => {
                  const time = slot.time.slice(0, 5);
                  const available = slot.available !== false;
                  const active = selectedTimeKey === time;
                  return (
                    <TouchableOpacity
                      key={slot.time}
                      disabled={!available}
                      onPress={() => {
                        const iso = buildZonedIsoForWallClock(selectedDateKey, time, slotsData?.provider_timezone ?? providerTz);
                        const next = new Date(iso);
                        if (Number.isFinite(next.getTime())) setScheduledAt(next);
                      }}
                      style={[twStyle(`rounded-full border px-3 py-2 ${active ? "border-emerald-700 bg-emerald-600" : available ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-100"}`), { marginRight: 8, marginBottom: 8, opacity: available ? 1 : 0.45 }]}
                    >
                      <Text style={twStyle(`text-xs font-semibold ${active ? "text-white" : available ? "text-emerald-700" : "text-gray-400"}`)}>{time}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
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
                Enter a price greater than 0, duration between 15 and 480 minutes, and offer expiry of at least 1 day
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
    </ScreenContainer>
  );
}
