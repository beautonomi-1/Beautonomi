import { useState, useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Platform,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Location from "expo-location";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { twStyle } from "@/lib/twStyle";

type BookingDetail = {
  id: string;
  booking_number?: string | null;
  status: string;
  scheduled_at: string;
  total_amount?: number;
  currency?: string;
  location_type?: "at_salon" | "at_home";
  current_stage?: string | null;
  customers?: { full_name?: string | null } | null;
  locations?: { name?: string | null } | null;
  address?: { line1?: string; city?: string } | null;
  special_requests?: string | null;
  services?: {
    offering_name?: string;
    staff_name?: string | null;
    scheduled_start_at?: string;
    duration_minutes?: number;
    price?: number;
  }[];
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

export default function BookingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const { data, loading, error, refresh } = useApi<BookingDetail>(`/api/provider/bookings/${id}`);
  const { execute: postMutation, loading: mutating } = useApiMutation<{ booking?: BookingDetail; message?: string }>("post");
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const canStartJourney =
    isAtHome &&
    (b.status === "confirmed" || b.status === "pending") &&
    (b.current_stage == null || b.current_stage === "confirmed");
  const canMarkArrived = isAtHome && b.current_stage === "provider_on_way";
  const isEnRoute = b.current_stage === "provider_on_way";
  const isArrived = b.current_stage === "provider_arrived";

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

  return (
    <ScreenContainer>
      <ScreenHeader
        title={b.booking_number ?? "Booking"}
        subtitle={b.status}
        onBack={() => router.back()}
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

        {isAtHome && (canStartJourney || isEnRoute || isArrived) && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-3")}>At-home visit</Text>
            {isArrived && (
              <View style={twStyle("rounded-lg bg-green-50 border border-green-100 py-2 px-3")}>
                <Text style={twStyle("text-sm font-medium text-green-800")}>Provider arrived</Text>
              </View>
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
                  accessibilityLabel="Start journey"
                >
                  {mutating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={twStyle("text-white font-semibold")}>Start journey</Text>
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

        {b.special_requests && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50 p-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>Special requests</Text>
            <Text style={twStyle("text-sm text-gray-600")}>{b.special_requests}</Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
