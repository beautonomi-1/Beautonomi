/**
 * Self-service account deactivation (App Store / Play parity with web).
 * POST /api/me/deactivate, then sign out → login with deactivated messaging.
 */
import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { getApiErrorMessage } from "@/lib/api-error";

export default function DeactivateAccountScreen() {
  useScreenTracking("Deactivate account");
  const { t } = useTranslation();
  const da = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.deactivateAccount.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const router = useRouter();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDeactivate = useCallback(async () => {
    const pwd = password.trim();
    if (!pwd) {
      Alert.alert(da("requiredPasswordTitle"), da("requiredPasswordBody"));
      return;
    }

    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    Alert.alert(
      da("confirmTitle"),
      da("confirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: da("confirmDeactivateCta"),
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const res = (await api.post<unknown>("/api/me/deactivate", {
                password: pwd,
                reason: reason.trim() || null,
              })) as { error?: { message?: string } };
              if (res.error) {
                Alert.alert(errTitle, res.error.message ?? da("deactivateFailed"));
                return;
              }
              await signOut();
              router.replace("/(auth)/login?deactivated=1" as never);
            } catch (e) {
              Alert.alert(errTitle, getApiErrorMessage(e, da("deactivateRetry")));
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [password, reason, signOut, router, da, errTitle, t]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScreenFrame loading={false} error={null}>
        <View
          style={{
            marginBottom: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#fcd34d",
            backgroundColor: "rgba(254, 243, 199, 0.85)",
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 14, color: "#92400e", lineHeight: 20 }}>{da("infoBanner")}</Text>
        </View>

          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 6 }}>{da("passwordLabel")}</Text>
          <TextInput
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.gray[300],
              backgroundColor: Colors.white,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 16,
              color: Colors.gray[900],
            }}
            placeholder="Enter your password"
            placeholderTextColor={Colors.gray[400]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginTop: 16, marginBottom: 6 }}>
            {da("reasonLabel")}
          </Text>
          <TextInput
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.gray[300],
              backgroundColor: Colors.white,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 16,
              color: Colors.gray[900],
              minHeight: 88,
              textAlignVertical: "top",
            }}
            placeholder={da("reasonPlaceholder")}
            placeholderTextColor={Colors.gray[400]}
            value={reason}
            onChangeText={setReason}
            multiline
          />

          <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 12, lineHeight: 18 }}>{da("footerHint")}</Text>

          <TouchableOpacity
            onPress={() => void handleDeactivate()}
            disabled={loading}
            style={{
              marginTop: 24,
              backgroundColor: "#dc2626",
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              opacity: loading ? 0.7 : 1,
            }}
            accessibilityRole="button"
            accessibilityLabel={da("submitA11y")}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{da("submitLabel")}</Text>
            )}
          </TouchableOpacity>
      </ScreenFrame>
    </KeyboardAvoidingView>
  );
}
