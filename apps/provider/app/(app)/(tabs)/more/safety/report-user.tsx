import { useCallback, useState } from "react";
import {
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  StyleSheet,
} from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useRouter } from "expo-router";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { Colors } from "@/constants/colors";
import { TrustScreenShell } from "@/components/safety/TrustScreenShell";
import { useSafetyStackBack } from "@/lib/provider-tab-navigation";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { trackUserReportSubmitted } from "@/lib/analytics";

export default function ReportUserScreen() {
  useScreenTracking("Report user");
  const { t } = useTranslation();
  const router = useRouter();
  const handleBack = useSafetyStackBack();
  const ru = useCallback(
    (key: string) =>
      t(`provider.mobile.screens.reportUser.${key}`, {
        defaultValue: t(`customer.mobile.screens.reportUser.${key}`),
      }) as string,
    [t],
  );

  const [identifier, setIdentifier] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = identifier.trim().length >= 2 && description.trim().length >= 10;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitting(true);
    try {
      const trimmedId = identifier.trim();
      const payload: Record<string, string> = {
        report_type: "safety_report_user",
        description: description.trim(),
      };
      if (trimmedId.includes("-")) {
        payload.reported_user_id = trimmedId;
      } else {
        payload.reported_handle = trimmedId.replace(/^@+/, "");
      }

      const res = await api.post<{ id?: string }>("/api/reports", payload);
      if (res.error) {
        Alert.alert(ru("submitFailedTitle"), getApiErrorMessage(res.error, ru("submitFailedFallback")));
        return;
      }
      trackUserReportSubmitted("safety_report_user");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(ru("submittedTitle"), ru("submittedBody"), [
        { text: t("common.ok"), onPress: handleBack },
      ]);
    } catch (e) {
      Alert.alert(
        t("customer.mobile.screens.authLogin.errorTitle"),
        e instanceof Error ? e.message : ru("submitGenericError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openSupportFallback = () => {
    router.push({
      pathname: "/(app)/(tabs)/more/support-tickets/new",
      params: { category: "safety_report_user" },
    } as never);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TrustScreenShell title={ru("title")} breadcrumbSegment={ru("breadcrumb")} />
        <Text style={styles.intro}>{ru("intro")}</Text>

        <Text style={styles.label}>{ru("identifierLabel")}</Text>
        <TextInput
          style={styles.input}
          value={identifier}
          onChangeText={setIdentifier}
          placeholder={ru("identifierPlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={ru("identifierLabel")}
        />
        <Text style={styles.hint}>{ru("identifierHint")}</Text>

        <Text style={styles.label}>{ru("descriptionLabel")}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder={ru("descriptionPlaceholder")}
          multiline
          textAlignVertical="top"
          accessibilityLabel={ru("descriptionLabel")}
        />

        <TouchableOpacity
          style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
          onPress={() => void handleSubmit()}
          disabled={!canSubmit || submitting}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit || submitting }}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>{ru("submit")}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={openSupportFallback} style={styles.fallbackLink} accessibilityRole="button">
          <Text style={styles.fallbackText}>{ru("supportFallback")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.gray[50] },
  scrollContent: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 15, lineHeight: 22, color: Colors.gray[700], marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "600", color: Colors.gray[800], marginBottom: 6 },
  hint: { fontSize: 12, color: Colors.gray[500], marginTop: 4, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    marginBottom: 4,
  },
  textArea: { minHeight: 120, paddingTop: 12 },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  fallbackLink: { marginTop: 20, alignItems: "center" },
  fallbackText: { color: Colors.primary, fontSize: 14, textDecorationLine: "underline" },
});
