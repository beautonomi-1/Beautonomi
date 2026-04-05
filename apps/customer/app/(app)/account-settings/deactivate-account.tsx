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
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { getApiErrorMessage } from "@/lib/api-error";

export default function DeactivateAccountScreen() {
  useScreenTracking("Deactivate account");
  const router = useRouter();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDeactivate = useCallback(async () => {
    const pwd = password.trim();
    if (!pwd) {
      Alert.alert("Required", "Enter your password to deactivate your account.");
      return;
    }

    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    Alert.alert(
      "Deactivate account?",
      "Your account will be disabled immediately. You can reactivate anytime by logging in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const res = (await api.post<unknown>("/api/me/deactivate", {
                password: pwd,
                reason: reason.trim() || null,
              })) as { error?: { message?: string } };
              if (res.error) {
                Alert.alert("Error", res.error.message ?? "Deactivation failed.");
                return;
              }
              await signOut();
              router.replace("/(auth)/login?deactivated=1" as never);
            } catch (e) {
              Alert.alert("Error", getApiErrorMessage(e, "Deactivation failed. Please try again."));
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [password, reason, signOut, router]);

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
          <Text style={{ fontSize: 14, color: "#92400e", lineHeight: 20 }}>
            Deactivating disables your account. Your data is kept. You can reactivate by signing in again; we will
            restore access when your deactivation was self-initiated.
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
              minHeight: 88,
              textAlignVertical: "top",
            }}
            placeholder="e.g. Taking a break"
            placeholderTextColor={Colors.gray[400]}
            value={reason}
            onChangeText={setReason}
            multiline
          />

          <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 12, lineHeight: 18 }}>
            Password confirmation matches the web app: your account email must have a password set. If you only use
            phone or social sign-in, set a password on the website first, or use the web app to deactivate.
          </Text>

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
            accessibilityLabel="Deactivate account"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Deactivate account</Text>
            )}
          </TouchableOpacity>
      </ScreenFrame>
    </KeyboardAvoidingView>
  );
}
