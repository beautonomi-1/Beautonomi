/**
 * Deactivate account screen – required for App Store / Play Store compliance.
 * Calls POST /api/me/deactivate with password (and optional reason), then signs out.
 */
import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";

export default function SettingsDeactivateAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDeactivate = useCallback(async () => {
    const pwd = password.trim();
    if (!pwd) {
      Alert.alert("Required", "Please enter your password to deactivate.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    Alert.alert(
      "Deactivate account",
      "Your account will be disabled. You can reactivate anytime by logging in again or opening the reactivate page in the web app. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const res = await api.post<unknown>("/api/me/deactivate", {
                password: pwd,
                reason: reason.trim() || null,
              }) as { data?: unknown; error?: { message?: string } };
              if (res.error) {
                Alert.alert("Error", res.error.message ?? "Deactivation failed.");
                setLoading(false);
                return;
              }
              await signOut();
              router.replace("/(auth)/login?deactivated=1" as never);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Deactivation failed. Please try again.";
              Alert.alert("Error", msg);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }, [password, reason, signOut, router]);

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader title="Deactivate account" subtitle="Temporarily disable your account" onBack={() => router.back()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>
            <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: "#fcd34d", backgroundColor: "rgba(254,243,199,0.8)", padding: 12 }}>
              <Text style={{ fontSize: 14, color: "#92400e" }}>
                Deactivating disables your account. Your data is kept. You can reactivate anytime by logging in again or opening the reactivate page in the web app.
              </Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Password</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder="Enter your password"
                placeholderTextColor="#9ca3af"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Reason (optional)</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder="e.g. Taking a break"
                placeholderTextColor="#9ca3af"
                value={reason}
                onChangeText={setReason}
              />
            </View>
            <View style={{ marginTop: 16 }}>
              <ActionButton
                label={loading ? "Deactivating…" : "Deactivate account"}
                onPress={handleDeactivate}
                fullWidth
                disabled={loading}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
