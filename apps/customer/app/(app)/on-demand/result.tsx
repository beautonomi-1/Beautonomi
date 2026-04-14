import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { useApi } from "@/hooks/useApi";
import { Colors } from "@/constants/colors";

interface OnDemandRequest {
  id: string;
  status: string;
  booking_id?: string | null;
  provider_name?: string | null;
}

export default function OnDemandResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string; requestId?: string }>();
  const status = params.status ?? "expired";
  const requestId = typeof params.requestId === "string" ? params.requestId : Array.isArray(params.requestId) ? params.requestId[0] : undefined;
  const onDemandConfig = useModuleConfig("on_demand");
  const uiCopy = (onDemandConfig.ui_copy ?? {}) as Record<string, string>;

  const { data: request, loading: requestLoading, error: requestError } = useApi<OnDemandRequest>(
    requestId ? `/api/me/on-demand/requests/${requestId}` : "",
    { enabled: !!requestId }
  );

  const isAccepted = status === "accepted";
  const title = isAccepted
    ? (uiCopy.accepted_title ?? "Request accepted!")
    : status === "declined"
      ? (uiCopy.declined_title ?? "Not accepted")
      : status === "cancelled"
        ? "Request cancelled"
        : (uiCopy.expired_title ?? "Request expired");
  const subtitle = isAccepted
    ? (uiCopy.accepted_subtitle ?? "Your booking is confirmed. View details below.")
    : status === "declined"
      ? (uiCopy.declined_subtitle ?? "The provider was unable to accept. Try another time or book a scheduled appointment.")
      : status === "cancelled"
        ? "You cancelled this request."
        : (uiCopy.expired_subtitle ?? "The request timed out. You can try again or book a scheduled appointment.");

  const bookingId = request?.booking_id ?? null;
  const providerName = request?.provider_name?.trim();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top", "bottom"]}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 48 }}>
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
              backgroundColor: isAccepted ? "#DCFCE7" : Colors.gray[100],
            }}
          >
            <Ionicons name={isAccepted ? "checkmark-circle" : "time-outline"} size={48} color={isAccepted ? "#16a34a" : Colors.gray[600]} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], textAlign: "center" }}>{title}</Text>
          <Text style={{ color: Colors.gray[600], textAlign: "center", marginTop: 8 }}>{subtitle}</Text>
          {isAccepted && providerName && (
            <Text style={{ color: Colors.gray[600], textAlign: "center", marginTop: 4 }}>with {providerName}</Text>
          )}
        </View>

        <View>
          {isAccepted && requestLoading && !bookingId && (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginBottom: 16 }} />
          )}
          {isAccepted && requestError && !bookingId && (
            <Text style={{ color: Colors.gray[500], textAlign: "center", marginBottom: 16, fontSize: 13 }}>
              Could not load booking details. Check your bookings list.
            </Text>
          )}
          {isAccepted && bookingId && (
            <TouchableOpacity
              onPress={() => router.replace({ pathname: "/(app)/booking-detail", params: { id: bookingId } } as never)}
              style={{ backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: "center", marginBottom: 12 }}
            >
              <Text style={{ color: Colors.white, fontWeight: "600" }}>View booking</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.replace("/(app)/(tabs)/bookings" as never)}
            style={{
              backgroundColor: isAccepted && bookingId ? undefined : Colors.primary,
              borderWidth: isAccepted && bookingId ? 1 : 0,
              borderColor: Colors.gray[300],
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ color: isAccepted && bookingId ? Colors.gray[700] : Colors.white, fontWeight: "600" }}>View my bookings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.replace("/(app)/(tabs)" as never)}
            style={{ borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 12 }}
          >
            <Text style={{ color: Colors.gray[700], fontWeight: "500" }}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
