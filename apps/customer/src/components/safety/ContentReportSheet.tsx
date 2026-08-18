import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { api } from "@/lib/api-client";
import { haptic } from "@/lib/haptics";
import { trackContentReportSubmitted } from "@/lib/analytics";

export type ContentReportTargetType =
  | "explore_post"
  | "explore_comment"
  | "message"
  | "review"
  | "product_review";

export type ContentReportReason =
  | "inappropriate"
  | "misleading"
  | "harassment"
  | "spam"
  | "safety"
  | "other";

const REASONS: ContentReportReason[] = [
  "inappropriate",
  "misleading",
  "harassment",
  "spam",
  "safety",
  "other",
];

type ContentReportSheetProps = {
  visible: boolean;
  onClose: () => void;
  targetType: ContentReportTargetType;
  targetId: string;
  title?: string;
};

export function ContentReportSheet({
  visible,
  onClose,
  targetType,
  targetId,
  title,
}: ContentReportSheetProps) {
  const { t } = useTranslation();
  const tr = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.contentReport.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );

  const reasonLabels = useMemo(
    () =>
      Object.fromEntries(
        REASONS.map((reason) => [reason, tr(`reason.${reason}`)]),
      ) as Record<ContentReportReason, string>,
    [tr],
  );

  const [selectedReason, setSelectedReason] = useState<ContentReportReason | "">("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setSelectedReason("");
    setDetails("");
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleSubmit = useCallback(async () => {
    if (!targetId) return;
    if (!selectedReason) {
      Alert.alert(tr("selectReasonTitle"), tr("selectReasonBody"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/api/reports/content", {
        target_type: targetType,
        target_id: targetId,
        reason: selectedReason,
        details: details.trim() || undefined,
      });

      if (res.error) {
        haptic.error();
        Alert.alert(t("common.error"), res.error.message || tr("submitError"));
        return;
      }

      haptic.success();
      trackContentReportSubmitted(targetType);
      handleClose();
      Alert.alert(tr("submittedTitle"), tr("submittedBody"));
    } catch {
      haptic.error();
      Alert.alert(t("common.error"), tr("submitError"));
    } finally {
      setSubmitting(false);
    }
  }, [details, handleClose, selectedReason, t, targetId, targetType, tr]);

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={title ?? tr("modalTitle")}
      snapHeight="auto"
    >
      <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
        {tr("modalLead")}
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
        {REASONS.map((reason) => {
          const active = selectedReason === reason;
          return (
            <TouchableOpacity
              key={reason}
              onPress={() => {
                haptic.light();
                setSelectedReason(reason);
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: active ? "#EF4444" : "#E5E7EB",
                backgroundColor: active ? "#FEF2F2" : "#fff",
                marginRight: 8,
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: active ? "600" : "400",
                  color: active ? "#B91C1C" : "#374151",
                }}
              >
                {reasonLabels[reason]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        placeholder={tr("detailsPlaceholder")}
        placeholderTextColor="#9CA3AF"
        value={details}
        onChangeText={setDetails}
        multiline
        numberOfLines={4}
        maxLength={2000}
        style={{
          borderWidth: 1,
          borderColor: "#E5E7EB",
          borderRadius: 12,
          padding: 14,
          fontSize: 14,
          color: "#111827",
          textAlignVertical: "top",
          minHeight: 100,
          marginBottom: 8,
        }}
      />
      <Text style={{ fontSize: 11, color: "#9CA3AF", textAlign: "right", marginBottom: 16 }}>
        {details.length}/2000
      </Text>

      <TouchableOpacity
        onPress={() => void handleSubmit()}
        disabled={submitting || !selectedReason}
        style={{
          backgroundColor: !selectedReason ? "#D1D5DB" : "#EF4444",
          borderRadius: 12,
          paddingVertical: 14,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="flag" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              {tr("submitCta")}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </BottomSheet>
  );
}
