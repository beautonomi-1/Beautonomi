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
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";

function getRedirectUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`;
  }
  const base = APP_URL?.replace(/\/$/, "") || "";
  return base ? `${base}/auth/callback` : "";
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert("Required", "Enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
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
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo,
      });
      if (error) {
        Alert.alert("Error", error.message);
        return;
      }
      setSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  }, [email]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 12, padding: 8 }}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>Reset password</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: screenPadding, paddingTop: 24, paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {sent ? (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", padding: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "500", color: "#166534" }}>Check your email</Text>
              <Text style={{ marginTop: 8, fontSize: 14, color: "#15803d" }}>
                We sent a password reset link to {email.trim()}. Open the link in your browser to set a new password.
              </Text>
              <TouchableOpacity
                onPress={() => router.replace("/(auth)/login" as never)}
                style={{ marginTop: 16, borderRadius: 12, backgroundColor: "#15803d", paddingVertical: 12 }}
                accessibilityLabel="Back to login"
                accessibilityRole="button"
              >
                <Text style={{ textAlign: "center", fontWeight: "500", color: Colors.white }}>Back to login</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
                Enter the email address for your account and we&apos;ll send you a link to reset your password.
              </Text>
              <Text style={{ marginTop: 16, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Email</Text>
              <TextInput
                style={{ marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder="you@example.com"
                placeholderTextColor={Colors.gray[400]}
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
                style={{ marginTop: 24, borderRadius: 12, backgroundColor: Colors.primary, paddingVertical: 16 }}
                accessibilityLabel={loading ? "Sending reset link" : "Send reset link"}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.white }}>Send reset link</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ marginTop: 16, paddingVertical: 8 }}
                accessibilityLabel="Back to login"
                accessibilityRole="button"
              >
                <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>Back to login</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
