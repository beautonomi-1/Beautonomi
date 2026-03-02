/**
 * Shows a banner when the logged-in user's email is not verified (email_confirmed_at is null).
 * Only shows for recent accounts (created within 7 days) to avoid showing when
 * email verification is disabled in Supabase. Includes "Resend verification email".
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/providers/AuthProvider";

const DISMISS_KEY_PREFIX = "email-verification-dismissed-";

export function EmailVerificationBanner() {
  const { user, session, isEmailVerified, resendVerificationEmail } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    AsyncStorage.getItem(`${DISMISS_KEY_PREFIX}${user.id}`).then((v) => {
      if (mounted) setDismissed(v === "true");
    });
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    if (user?.id) AsyncStorage.setItem(`${DISMISS_KEY_PREFIX}${user.id}`, "true").catch(() => {});
  }, [user?.id]);

  const handleResend = useCallback(async () => {
    setResendSuccess(false);
    setResending(true);
    try {
      await resendVerificationEmail();
      setResendSuccess(true);
    } catch {
      // Error could be shown via a small toast; for now we just don't set success
    } finally {
      setResending(false);
    }
  }, [resendVerificationEmail]);

  if (!user || !session || isEmailVerified || dismissed) return null;

  const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
  const daysSinceCreation = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
  if (daysSinceCreation > 7) return null;

  return (
    <View className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
      <View className="flex-row items-start">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-amber-800">Verify your email address</Text>
          <Text className="mt-1 text-sm text-amber-700" numberOfLines={2}>
            We sent a verification email to <Text className="font-medium">{user.email}</Text>. Click the link to activate your account.
          </Text>
          <View className="mt-2 flex-row items-center gap-2">
            <TouchableOpacity
              onPress={handleResend}
              disabled={resending}
              className="flex-row items-center rounded-lg border border-amber-300 bg-white px-3 py-2"
              activeOpacity={0.7}
              accessibilityLabel={resending ? "Sending verification email" : resendSuccess ? "Verification email sent" : "Resend verification email"}
              accessibilityRole="button"
            >
              {resending ? (
                <ActivityIndicator size="small" color="#b45309" />
              ) : (
                <Ionicons name="mail-outline" size={16} color="#b45309" />
              )}
              <Text className="ml-2 text-sm font-medium text-amber-800">
                {resending ? "Sending…" : resendSuccess ? "Sent! Check your inbox" : "Resend email"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="p-1"
          accessibilityLabel="Dismiss verification banner"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={20} color="#b45309" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
