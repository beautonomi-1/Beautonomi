/**
 * Shows a banner when the logged-in user has a mailable email that is not verified.
 * Phone-only and placeholder-email accounts are excluded.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/providers/AuthProvider";
import { twStyle } from "@/lib/twStyle";
import {
  resolveMailableAccountEmail,
  shouldShowEmailVerificationBanner,
} from "@beautonomi/utils";

const DISMISS_KEY_PREFIX = "email-verification-dismissed-";

export function EmailVerificationBanner() {
  const { user, session, resendVerificationEmail } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const authUser = session?.user;
  const mailableEmail = useMemo(
    () => resolveMailableAccountEmail(authUser?.email, user?.email),
    [authUser?.email, user?.email],
  );

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

  const shouldShow = Boolean(
    user &&
      session &&
      authUser &&
      !dismissed &&
      mailableEmail &&
      shouldShowEmailVerificationBanner({
        authEmail: authUser.email,
        profileEmail: user.email,
        emailConfirmedAt: authUser.email_confirmed_at,
        accountCreatedAt: user.created_at ?? authUser.created_at,
      }),
  );

  if (!shouldShow || !mailableEmail) return null;

  return (
    <View style={twStyle("border-l-4 border-amber-400 bg-amber-50 px-4 py-3")}>
      <View style={twStyle("flex-row items-start")}>
        <View style={twStyle("flex-1")}>
          <Text style={twStyle("text-sm font-semibold text-amber-800")}>Verify your email address</Text>
          <Text style={twStyle("mt-1 text-sm text-amber-700")} numberOfLines={2}>
            We sent a verification email to <Text style={twStyle("font-medium")}>{mailableEmail}</Text>. Click the link to activate your account.
          </Text>
          <View style={twStyle("mt-2 flex-row items-center")}>
            <TouchableOpacity
              onPress={handleResend}
              disabled={resending}
              style={twStyle("flex-row items-center rounded-lg border border-amber-300 bg-white px-3 py-2")}
              activeOpacity={0.7}
              accessibilityLabel={resending ? "Sending verification email" : resendSuccess ? "Verification email sent" : "Resend verification email"}
              accessibilityRole="button"
            >
              {resending ? (
                <ActivityIndicator size="small" color="#b45309" />
              ) : (
                <Ionicons name="mail-outline" size={16} color="#b45309" />
              )}
              <Text style={twStyle("ml-2 text-sm font-medium text-amber-800")}>
                {resending ? "Sending…" : resendSuccess ? "Sent! Check your inbox" : "Resend email"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={twStyle("p-1")}
          accessibilityLabel="Dismiss verification banner"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={20} color="#b45309" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
