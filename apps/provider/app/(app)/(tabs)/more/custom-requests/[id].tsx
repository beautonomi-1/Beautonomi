/**
 * Custom request detail: view request and send an offer (POST /api/provider/custom-requests/[id]/offers).
 * Loads request via GET /api/provider/custom-requests/[id]. Supports travel_fee when request is at_home.
 */
import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

type CustomRequest = {
  id: string;
  description?: string | null;
  status?: string | null;
  created_at: string;
  location_type?: string | null;
  duration_minutes?: number | null;
  preferred_start_at?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  customer?: { full_name?: string | null; email?: string | null } | null;
  offers?: { id: string; status?: string; price?: number; currency?: string; created_at?: string }[];
};

function formatDateTimeSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

export default function CustomRequestDetailScreen() {
  const router = useRouter();
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
  const { data: teamData } = useApi<{ id: string; name: string }[]>("/api/provider/team", {
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
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const isAtHome = request?.location_type === "at_home";
  const defaultDuration = request?.duration_minutes ?? 60;
  const isValid =
    request &&
    price !== "" &&
    Number(price) >= 0 &&
    Number(durationMinutes) >= 15 &&
    Number(durationMinutes) <= 480 &&
    Number(expirationDays) >= 1;

  const sendOffer = useCallback(async () => {
    if (!requestId || !request || !isValid) return;
    setSubmitting(true);
    try {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + Number(expirationDays));
      const payload: Record<string, unknown> = {
        price: Number(price),
        currency: tenantCurrency,
        duration_minutes: Number(durationMinutes),
        expiration_at: expDate.toISOString(),
        notes: notes.trim() || null,
        staff_id: staffId || null,
        location_id: locationId || null,
        scheduled_at: scheduledAt.toISOString(),
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
    scheduledAt,
    isAtHome,
    travelFee,
    tenantCurrency,
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
        title="Send offer"
        subtitle={request.customer?.full_name ?? request.customer?.email ?? "Customer"}
        onBack={() => router.back()}
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4")}>
          <Text style={twStyle("text-xs font-medium uppercase tracking-wide text-gray-500")}>Request</Text>
          <Text style={twStyle("mt-1 text-base text-gray-900")}>{request.description ?? "—"}</Text>
          <View style={twStyle("mt-2 flex-row flex-wrap")}>
            <Text style={[twStyle("text-sm text-gray-600"), { marginRight: 8, marginBottom: 8 }]}>
              {request.location_type === "at_home" ? "At home" : "At salon"}
            </Text>
            {request.duration_minutes != null && (
              <Text style={[twStyle("text-sm text-gray-600"), { marginRight: 8, marginBottom: 8 }]}>· {request.duration_minutes} min</Text>
            )}
            {(request.budget_min != null || request.budget_max != null) && (
              <Text style={twStyle("text-sm text-gray-600")}>
                · Budget: {request.budget_min ?? "?"} – {request.budget_max ?? "?"} {tenantCurrency}
              </Text>
            )}
          </View>
          {request.preferred_start_at && (
            <Text style={twStyle("mt-1 text-sm text-gray-600")}>
              Preferred: {formatDateTimeSafe(request.preferred_start_at)}
            </Text>
          )}
          {request.offers && request.offers.length > 0 && (
            <Text style={twStyle("mt-2 text-sm text-gray-500")}>
              {request.offers.length} offer(s) already sent
            </Text>
          )}
        </View>

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Price ({tenantCurrency}) *</Text>
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

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Appointment date & time (optional)</Text>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3")}
        >
          <Text style={twStyle("text-base text-gray-900")}>
            {scheduledAt.toLocaleString()}
          </Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={scheduledAt}
            mode="datetime"
            minimumDate={new Date()}
            onChange={(_, d) => {
              if (d) setScheduledAt(d);
              setShowDatePicker(Platform.OS !== "ios");
            }}
            display={Platform.OS === "ios" ? "spinner" : "default"}
          />
        )}

        {isAtHome && (
          <>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Travel fee ({tenantCurrency}, optional)</Text>
            <TextInput
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              value={travelFee}
              onChangeText={setTravelFee}
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

        <ActionButton
          label="Send offer"
          onPress={sendOffer}
          loading={submitting}
          fullWidth
          disabled={!isValid}
        />
      </ScrollView>
    </ScreenContainer>
  );
}
