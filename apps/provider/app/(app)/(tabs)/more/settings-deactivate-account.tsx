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
      "Your account will be disabled. You can reactivate it by logging in again. Continue?",
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
              router.replace("/(auth)/login" as never);
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
    <ScreenContainer>
      <ScreenHeader title="Deactivate account" subtitle="Temporarily disable your account" onBack={() => router.back()} />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-2 pt-2">
            <View className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
              <Text className="text-sm text-amber-800">
                Deactivating disables your account. Your data is kept. You can log in again anytime to reactivate.
              </Text>
            </View>
            <View className="mb-3">
              <Text className="mb-1 text-sm font-medium text-gray-700">Password</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                placeholder="Enter your password"
                placeholderTextColor="#9ca3af"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View className="mb-3">
              <Text className="mb-1 text-sm font-medium text-gray-700">Reason (optional)</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                placeholder="e.g. Taking a break"
                placeholderTextColor="#9ca3af"
                value={reason}
                onChangeText={setReason}
              />
            </View>
            <View className="mt-4">
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
