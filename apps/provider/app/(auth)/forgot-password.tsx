/**
 * Forgot password – request a password reset link via email.
 * Uses Supabase auth resetPasswordForEmail; the link opens in browser and completes on web.
 *
 * Flow: user enters email → we call resetPasswordForEmail(redirectTo: APP_URL/auth/callback)
 * → Supabase emails a link → user opens link in browser → web app auth/callback
 * verifies token_hash (type=recovery) and redirects to reset-password page.
 * Requires EXPO_PUBLIC_APP_URL to point at the web app so the email link works.
 */
import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase/client";
import { APP_URL } from "@/config/public-env";

function getRedirectUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`;
  }
  const base = APP_URL?.replace(/\/$/, "") || "";
  return base ? `${base}/auth/callback` : "";
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert("Required", "Enter your email address.");
      return;
    }
    const redirectTo = getRedirectUrl();
    if (!redirectTo) {
      Alert.alert(
        "Not available",
        "Password reset is not configured for this build. Please use the provider dashboard on the web to reset your password."
      );
      return;
    }
    setLoading(true);
    setSent(false);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo,
    });
    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    setSent(true);
  }, [email]);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <View className="flex-row items-center border-b border-gray-200 px-4 py-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-3 p-2"
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-900">Reset password</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {sent ? (
            <View className="rounded-xl border border-green-200 bg-green-50 p-4">
              <Text className="text-base font-medium text-green-800">Check your email</Text>
              <Text className="mt-2 text-sm text-green-700">
                We sent a password reset link to {email.trim()}. Open the link in your browser to set a new password.
              </Text>
              <TouchableOpacity
                onPress={() => router.replace("/(auth)/login" as never)}
                className="mt-4 rounded-xl bg-green-700 py-3"
                accessibilityLabel="Back to login"
                accessibilityRole="button"
              >
                <Text className="text-center font-medium text-white">Back to login</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text className="text-sm text-gray-600">
                Enter the email address for your account and we&apos;ll send you a link to reset your password.
              </Text>
              <Text className="mt-4 text-sm font-medium text-gray-700">Email</Text>
              <TextInput
                className="mt-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                placeholder="you@example.com"
                placeholderTextColor="#9ca3af"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                accessibilityLabel="Email address"
              />
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={loading}
                className="mt-6 rounded-xl bg-indigo-600 py-4"
                accessibilityLabel={loading ? "Sending reset link" : "Send reset link"}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-center font-semibold text-white">Send reset link</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.back()}
                className="mt-4 py-2"
                accessibilityLabel="Back to login"
                accessibilityRole="button"
              >
                <Text className="text-center text-sm font-medium text-gray-600">Back to login</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
