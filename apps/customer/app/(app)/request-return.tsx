import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { trackReturnRequested } from "@/lib/analytics";

const PRIMARY = Colors.primary;

const REASONS = [
  { value: "damaged", label: "Item arrived damaged", icon: "alert-circle-outline" },
  { value: "wrong_item", label: "Received wrong item", icon: "swap-horizontal-outline" },
  { value: "not_as_described", label: "Not as described", icon: "document-text-outline" },
  { value: "quality_issue", label: "Quality issue", icon: "warning-outline" },
  { value: "changed_mind", label: "Changed my mind", icon: "refresh-outline" },
  { value: "arrived_late", label: "Arrived too late", icon: "time-outline" },
  { value: "other", label: "Other reason", icon: "ellipsis-horizontal-outline" },
] as const;

export default function RequestReturnScreen() {
  const router = useRouter();
  const { order_id, order_item_id } = useLocalSearchParams<{
    order_id: string;
    order_item_id?: string;
  }>();

  const [reason, setReason] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!reason) {
      Alert.alert("Select Reason", "Please select a reason for your return");
      return;
    }
    if (!order_id) return;

    setSubmitting(true);
    const res = await api.post<{ return_request: any }>("/api/me/returns", {
      order_id,
      order_item_id: order_item_id || undefined,
      reason,
      description: description.trim() || undefined,
    });
    setSubmitting(false);

    if (res.error) {
      Alert.alert("Error", res.error.message);
      return;
    }

    trackReturnRequested(order_id, reason, 0);

    Alert.alert(
      "Return Requested",
      "Your return request has been submitted. The provider will review it shortly.",
      [{ text: "OK", onPress: () => router.back() }],
    );
  }, [reason, description, order_id, order_item_id, router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>
          Request Return
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: 40,
          ...(Platform.OS === "web"
            ? ({ maxWidth: 500, alignSelf: "center", width: "100%" } as any)
            : {}),
        }}
      >
        <View style={{ backgroundColor: "#fff", padding: 20, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 }}>
            Why are you returning this item?
          </Text>
          <Text style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 16 }}>
            Select the reason that best describes your issue
          </Text>

          {REASONS.map((r) => {
            const active = reason === r.value;
            return (
              <TouchableOpacity
                key={r.value}
                onPress={() => setReason(r.value)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 16,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: active ? PRIMARY : "#E5E7EB",
                  backgroundColor: active ? "rgba(255,0,119,0.04)" : "#fff",
                  marginBottom: 8,
                }}
              >
                <Ionicons
                  name={r.icon as any}
                  size={22}
                  color={active ? PRIMARY : "#6B7280"}
                />
                <Text
                  style={{
                    flex: 1,
                    marginLeft: 12,
                    fontSize: 15,
                    fontWeight: active ? "600" : "400",
                    color: active ? PRIMARY : "#374151",
                  }}
                >
                  {r.label}
                </Text>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: active ? PRIMARY : "#D1D5DB",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {active && (
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: PRIMARY,
                      }}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ backgroundColor: "#fff", padding: 20, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 12 }}>
            Additional Details (optional)
          </Text>
          <TextInput
            style={{
              borderWidth: 1.5,
              borderColor: "#E5E7EB",
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              color: "#111827",
              minHeight: 100,
              textAlignVertical: "top",
            }}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue in more detail..."
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={1000}
          />
        </View>

        <View style={{ backgroundColor: "#FFF7ED", marginHorizontal: 16, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#92400E", marginLeft: 8 }}>
              Return Policy
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: "#78350F", lineHeight: 20 }}>
            Returns must be requested within 14 days of delivery. Items must be in their original
            condition. The provider will review your request and respond within 2 business days.
            If your request is rejected, you can escalate to our support team.
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!reason || submitting}
            style={{
              backgroundColor: !reason ? "#D1D5DB" : PRIMARY,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                Submit Return Request
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
