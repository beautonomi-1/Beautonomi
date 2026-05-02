/**
 * Permanent account deletion – parity with web (password + type DELETE).
 * POST /api/me/delete-account, then sign out.
 */
import { useCallback, useEffect, useState } from "react";
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
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { getApiErrorMessage } from "@/lib/api-error";
import { useTranslation } from "@beautonomi/i18n";

const DELETE_PHRASE = "DELETE";

interface AccountStatus {
  is_deactivated?: boolean;
  deactivated_at?: string;
  deactivated_by?: string | null;
  is_suspended?: boolean;
  suspension_reason?: string | null;
}

export default function DeleteAccountScreen() {
  useScreenTracking("Delete account");
  const { t } = useTranslation();
  const da = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.deleteAccount.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const router = useRouter();
  const { signOut } = useAuth();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await api.get<AccountStatus>("/api/me/account-status");
      if (!res.error && res.data) setStatus(res.data);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const confirmOk = confirmText.trim().toUpperCase() === DELETE_PHRASE;

  const handleDelete = useCallback(async () => {
    if (!password.trim()) {
      Alert.alert(da("passwordRequiredTitle"), da("passwordRequiredBody"));
      return;
    }
    if (!confirmOk) {
      Alert.alert(da("confirmationRequiredTitle"), da("confirmationRequiredBody", { phrase: DELETE_PHRASE }));
      return;
    }

    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    Alert.alert(da("deleteConfirmTitle"), da("deleteConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: da("deletePermanentlyCta"),
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          try {
            const res = (await api.post<unknown>("/api/me/delete-account", {
              password: password.trim(),
              reason: reason.trim() || null,
            })) as { error?: { message?: string } };
            if (res.error) {
              Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), res.error.message ?? da("deleteError"));
              return;
            }
            await signOut();
            Alert.alert(da("deletedTitle"), da("deletedBody"), [
              {
                text: t("common.ok"),
                onPress: () => router.replace("/(auth)/login" as never),
              },
            ]);
          } catch (e) {
            Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), getApiErrorMessage(e, da("deleteFailed")));
          } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [password, reason, confirmOk, signOut, router, da, t]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScreenFrame loading={statusLoading} error={null} onRetry={loadStatus}>
        <View>
          {status?.is_deactivated === true && (
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
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#92400e" }}>Account deactivated</Text>
              <Text style={{ fontSize: 14, color: "#92400e", marginTop: 4, lineHeight: 20 }}>
                You can still permanently delete your account below if you want all personal data removed.
              </Text>
            </View>
          )}

          {status?.is_suspended === true && (
            <View
              style={{
                marginBottom: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#fecaca",
                backgroundColor: "#fef2f2",
                padding: 14,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#991b1b" }}>Account suspended</Text>
              <Text style={{ fontSize: 14, color: "#b91c1c", marginTop: 4, lineHeight: 20 }}>
                {status.suspension_reason ?? "Your account has been suspended. Contact support if you need help."}
              </Text>
            </View>
          )}

          <View
            style={{
              marginBottom: 16,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#fecaca",
              backgroundColor: "#fff1f2",
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>Permanent deletion</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[700], marginTop: 8, lineHeight: 20 }}>
              Prefer a break instead? Use{" "}
              <Text style={{ fontWeight: "600" }}>Login & security → Deactivate account</Text> to disable your account
              without deleting data.
            </Text>
          </View>

          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 6 }}>Password</Text>
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
            Reason (optional)
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
              minHeight: 72,
              textAlignVertical: "top",
            }}
            placeholder="Why are you leaving?"
            placeholderTextColor={Colors.gray[400]}
            value={reason}
            onChangeText={setReason}
            multiline
          />

          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginTop: 16, marginBottom: 6 }}>
            Type <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: "#dc2626" }}>{DELETE_PHRASE}</Text> to confirm
          </Text>
          <TextInput
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: confirmOk ? Colors.gray[300] : "#fca5a5",
              backgroundColor: Colors.white,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 16,
              color: Colors.gray[900],
            }}
            placeholder={DELETE_PHRASE}
            placeholderTextColor={Colors.gray[400]}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 12, lineHeight: 18 }}>
            Same requirement as the website: you need a password on your account. If you use only phone or social
            sign-in, set a password on the web first.
          </Text>

          <TouchableOpacity
            onPress={() => void handleDelete()}
            disabled={loading || !password.trim() || !confirmOk}
            style={{
              marginTop: 24,
              backgroundColor: loading || !password.trim() || !confirmOk ? Colors.gray[300] : "#b91c1c",
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel="Delete account permanently"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Delete account permanently</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScreenFrame>
    </KeyboardAvoidingView>
  );
}
