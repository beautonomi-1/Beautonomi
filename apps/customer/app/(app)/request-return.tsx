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
import { useResponsive } from "@/hooks/useResponsive";
import { api } from "@/lib/api-client";
import { trackReturnRequested } from "@/lib/analytics";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

const PRIMARY = Colors.primary;

const REASONS = [
  { value: "damaged", labelKey: "reasonDamaged", icon: "alert-circle-outline" },
  { value: "wrong_item", labelKey: "reasonWrongItem", icon: "swap-horizontal-outline" },
  { value: "not_as_described", labelKey: "reasonNotAsDescribed", icon: "document-text-outline" },
  { value: "quality_issue", labelKey: "reasonQuality", icon: "warning-outline" },
  { value: "changed_mind", labelKey: "reasonChangedMind", icon: "refresh-outline" },
  { value: "arrived_late", labelKey: "reasonArrivedLate", icon: "time-outline" },
  { value: "other", labelKey: "reasonOther", icon: "ellipsis-horizontal-outline" },
] as const;

export default function RequestReturnScreen() {
  const { t } = useTranslation();
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const rr = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.requestReturn.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const router = useRouter();
  const { contentMaxWidth, isTablet, contentPadding } = useResponsive();
  const { order_id, order_item_id } = useLocalSearchParams<{
    order_id: string;
    order_item_id?: string;
  }>();

  const [reason, setReason] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!reason) {
      Alert.alert(rr("selectReasonTitle"), rr("selectReasonBody"));
      return;
    }
    if (!order_id) {
      Alert.alert(errTitle, rr("orderMissingBody"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{ return_request: any }>("/api/me/returns", {
        order_id,
        order_item_id: order_item_id || undefined,
        reason,
        description: description.trim() || undefined,
      });

      if (res.error) {
        Alert.alert(errTitle, res.error.message || rr("submitError"));
        return;
      }

      trackReturnRequested(order_id, reason, 0);

      Alert.alert(rr("submitSuccessTitle"), rr("submitSuccessBody"), [{ text: t("common.ok"), onPress: () => router.back() }]);
    } catch {
      Alert.alert(errTitle, rr("networkError"));
    } finally {
      setSubmitting(false);
    }
  }, [reason, description, order_id, order_item_id, router, rr, errTitle, t]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: contentPadding,
          paddingVertical: 14,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginEnd: 12 }}>
          <DirectionalIcon name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>
          {t("customer.mobile.stackTitles.requestReturn")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: contentPadding,
          paddingBottom: 40,
          ...((isTablet || Platform.OS === "web") ? { maxWidth: Math.min(500, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {}),
        }}
      >
        <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 }}>
            {rr("whyReturning")}
          </Text>
          <Text style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 16 }}>
            {rr("selectReasonHint")}
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
                  padding: contentPadding,
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
                    marginStart: 12,
                    fontSize: 15,
                    fontWeight: active ? "600" : "400",
                    color: active ? PRIMARY : "#374151",
                  }}
                >
                  {rr(r.labelKey)}
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

        <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 12 }}>
            {rr("additionalDetails")}
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
            placeholder={rr("detailPlaceholder")}
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={1000}
          />
        </View>

        <View style={{ backgroundColor: "#FFF7ED", borderRadius: 12, padding: contentPadding, marginBottom: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#92400E", marginStart: 8 }}>
              {rr("returnPolicy")}
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: "#78350F", lineHeight: 20 }}>
            {rr("returnPolicyBody")}
          </Text>
        </View>

        <View style={{ paddingHorizontal: contentPadding }}>
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
                {rr("submitCta")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
