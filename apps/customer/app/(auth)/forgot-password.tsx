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
import { supabase } from "@/lib/supabase/client";
import { Colors } from "@/constants/colors";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${process.env.EXPO_PUBLIC_APP_URL || "https://beautonomi.com"}/account-settings/login-and-security/reset-password`,
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
      className="flex-1 bg-white"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mb-8 w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color="#111827" />
        </TouchableOpacity>

        {sent ? (
          <View className="items-center pt-8">
            <View className="w-20 h-20 rounded-full bg-green-50 items-center justify-center mb-6">
              <Ionicons name="mail-outline" size={40} color="#059669" />
            </View>
            <Text className="text-2xl font-bold text-gray-900 text-center mb-3">
              Check your email
            </Text>
            <Text className="text-base text-gray-500 text-center mb-2 leading-6">
              We sent a password reset link to
            </Text>
            <Text className="text-base font-semibold text-gray-900 text-center mb-8">
              {email.trim().toLowerCase()}
            </Text>
            <Text className="text-sm text-gray-400 text-center mb-8 leading-5">
              Didn&apos;t receive the email? Check your spam folder, or try again with a different email.
            </Text>

            <TouchableOpacity
              className="w-full rounded-xl py-3.5 mb-4"
              style={{ backgroundColor: Colors.primary }}
              onPress={() => { setSent(false); setEmail(""); }}
              accessibilityRole="button"
              accessibilityLabel="Try a different email"
            >
              <Text className="text-center text-base font-semibold text-white">
                Try different email
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityRole="link"
              accessibilityLabel="Back to login"
            >
              <Text className="text-center text-sm text-gray-500">
                Back to{" "}
                <Text style={{ color: Colors.primary }} className="font-semibold">Log In</Text>
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View className="mb-8">
              <Text className="text-2xl font-bold text-gray-900 mb-2">
                Reset your password
              </Text>
              <Text className="text-base text-gray-500 leading-6">
                Enter the email address linked to your account and we&apos;ll send you a link to reset your password.
              </Text>
            </View>

            <Text className="mb-1 text-sm font-medium text-gray-700">
              Email address
            </Text>
            <TextInput
              className="mb-6 rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900"
              placeholder="you@example.com"
              placeholderTextColor="#9ca3af"
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
              className="rounded-xl py-3.5"
              style={{ backgroundColor: Colors.primary }}
              onPress={handleReset}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Send reset link"
              accessibilityState={{ disabled: loading }}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-center text-base font-semibold text-white">
                  Send Reset Link
                </Text>
              )}
            </TouchableOpacity>

            <View className="mt-8">
              <TouchableOpacity
                onPress={() => router.back()}
                accessibilityRole="link"
                accessibilityLabel="Back to login"
              >
                <Text className="text-center text-sm text-gray-500">
                  Remember your password?{" "}
                  <Text style={{ color: Colors.primary }} className="font-semibold">Log In</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
