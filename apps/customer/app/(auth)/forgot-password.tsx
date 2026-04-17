import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useResponsive } from "@/hooks/useResponsive";
import { supabase } from "@/lib/supabase/client";
import { APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const formNarrow = isTablet || Platform.OS === "web";
  const containerStyle = formNarrow
    ? { width: "100%" as const, maxWidth: Math.min(420, contentMaxWidth), alignSelf: "center" as const }
    : { width: "100%" as const };

  const handleReset = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    const base = (APP_URL ?? "").replace(/\/$/, "");
    if (!base) {
      Alert.alert("Configuration Error", "App URL is not configured. Please contact support.");
      return;
    }
    const redirectTo = `${base}/auth/callback`;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo,
      });

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      setSent(true);
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.white }}
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: contentPadding,
          paddingTop: 60,
          paddingBottom: 220,
          ...(formNarrow ? { alignItems: "center" as const } : {}),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={containerStyle}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginBottom: 32, width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center" }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={Colors.gray[900]} />
        </TouchableOpacity>

        {sent ? (
          <View style={{ alignItems: "center", paddingTop: 32 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#F0FDF4", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
              <Ionicons name="mail-outline" size={40} color="#059669" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], textAlign: "center", marginBottom: 12 }}>Check your email</Text>
            <Text style={{ fontSize: 16, color: Colors.gray[500], textAlign: "center", marginBottom: 8, lineHeight: 24 }}>We sent a password reset link to</Text>
            <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], textAlign: "center", marginBottom: 32 }}>{email.trim().toLowerCase()}</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[400], textAlign: "center", marginBottom: 32, lineHeight: 20 }}>Didn&apos;t receive the email? Check your spam folder, or try again with a different email.</Text>

            <TouchableOpacity
              style={{ width: "100%", borderRadius: 12, paddingVertical: 14, marginBottom: 16, backgroundColor: Colors.primary }}
              onPress={() => { setSent(false); setEmail(""); }}
              accessibilityRole="button"
              accessibilityLabel="Try a different email"
            >
              <Text style={{ textAlign: "center", fontSize: 16, fontWeight: "600", color: Colors.white }}>Try different email</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} accessibilityRole="link" accessibilityLabel="Back to login">
              <Text style={{ textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>Back to <Text style={{ color: Colors.primary, fontWeight: "600" }}>Log In</Text></Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>Reset your password</Text>
              <Text style={{ fontSize: 16, color: Colors.gray[500], lineHeight: 24 }}>Enter the email address linked to your account and we&apos;ll send you a link to reset your password.</Text>
            </View>

            <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Email address</Text>
            <TextInput
              style={{ marginBottom: 24, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              placeholder="you@example.com"
              placeholderTextColor={Colors.gray[400]}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="done"
              onSubmitEditing={handleReset}
              accessibilityLabel="Email input"
            />

            <TouchableOpacity
              style={{ borderRadius: 12, paddingVertical: 14, backgroundColor: Colors.primary }}
              onPress={handleReset}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Send reset link"
              accessibilityState={{ disabled: loading }}
            >
              {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={{ textAlign: "center", fontSize: 16, fontWeight: "600", color: Colors.white }}>Send Reset Link</Text>}
            </TouchableOpacity>

            <View style={{ marginTop: 32 }}>
              <TouchableOpacity onPress={() => router.back()} accessibilityRole="link" accessibilityLabel="Back to login">
                <Text style={{ textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>Remember your password? <Text style={{ color: Colors.primary, fontWeight: "600" }}>Log In</Text></Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
