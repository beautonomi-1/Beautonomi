import { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";
import {
  canVerifySensitiveActionWithCode,
  describeReauthOtpDestination,
  isAuthSecurityLoaded,
  sensitiveActionSubmitReady,
  userHasPassword,
} from "@beautonomi/utils";

interface AccountStatus {
  is_deactivated?: boolean;
  deactivated_at?: string;
  deactivated_by?: string | null;
  is_suspended?: boolean;
  suspension_reason?: string;
  suspended_at?: string;
  provider_id?: string;
}

type AuthSecurityState = {
  has_password: boolean;
  has_mailable_email: boolean;
  has_phone: boolean;
};

type ProfileForDelete = {
  email?: string;
  phone?: string;
  auth_security?: AuthSecurityState | null;
};

export default function DeleteAccountInfoScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: status, loading, error, refresh } = useApi<AccountStatus>("/api/me/account-status");
  const { data: roleData } = useApi<{ role?: string }>("/api/me/role");
  const { data: profile } = useApi<ProfileForDelete>("/api/me/profile");
  const { execute: deleteAccount, loading: deleting } = useApiMutation("post");
  const [password, setPassword] = useState("");
  const [verificationNonce, setVerificationNonce] = useState("");
  const [requestingNonce, setRequestingNonce] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const DELETE_PHRASE = "DELETE";
  const confirmOk = confirmText.trim().toUpperCase() === DELETE_PHRASE;
  const authSecurity = profile?.auth_security ?? null;
  const authSecurityLoaded = isAuthSecurityLoaded(authSecurity);
  const hasPassword = userHasPassword(authSecurity);
  const canVerifyWithCode = canVerifySensitiveActionWithCode(authSecurity);
  const isProviderOwner = roleData?.role === "provider_owner";

  const otpDestination = useMemo(
    () =>
      describeReauthOtpDestination(authSecurity, {
        email: profile?.email,
        phone: profile?.phone,
      }),
    [authSecurity, profile?.email, profile?.phone],
  );

  const handleDeleteAccount = async () => {
    if (!authSecurityLoaded) {
      Alert.alert("Please wait", "Still loading account security settings. Please try again.");
      return;
    }
    if (hasPassword && !password.trim()) {
      Alert.alert("Password required", "Enter your password to confirm account deletion.");
      return;
    }
    if (!hasPassword && !verificationNonce.trim()) {
      Alert.alert("Verification required", "Enter the verification code to confirm account deletion.");
      return;
    }
    if (!confirmOk) {
      Alert.alert("Confirmation required", `Type ${DELETE_PHRASE} in the confirmation field.`);
      return;
    }
    Alert.alert(
      "Delete account permanently?",
      isProviderOwner
        ? "This cannot be undone. Your provider profile, services, bookings, and business data will be permanently removed."
        : "This action cannot be undone and will permanently remove your account and profile data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete permanently",
          style: "destructive",
          onPress: async () => {
            const { error: deleteError } = await deleteAccount("/api/me/delete-account", {
              password: hasPassword ? password.trim() : undefined,
              verificationNonce: hasPassword ? undefined : verificationNonce.trim(),
              reason: reason.trim() || "Deleted from mobile app",
            });
            if (deleteError) {
              Alert.alert("Could not delete account", deleteError);
              return;
            }
            await signOut();
            Alert.alert("Account deleted", "Your account has been deleted.");
            router.replace("/(auth)/login" as never);
          },
        },
      ],
    );
  };

  const requestVerificationCode = async () => {
    if (!canVerifyWithCode) {
      Alert.alert("Add contact method", otpDestination.codeSentMessage);
      return;
    }
    setRequestingNonce(true);
    try {
      const { error: reauthError } = await supabase.auth.reauthenticate();
      if (reauthError) throw reauthError;
      Alert.alert("Code sent", otpDestination.codeSentMessage);
    } catch (e) {
      Alert.alert("Could not send code", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setRequestingNonce(false);
    }
  };

  if (loading && status == null) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Delete account" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && status == null) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Delete account" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const isDeactivated = status?.is_deactivated === true;
  const isSuspended = status?.is_suspended === true;

  return (
    <ScreenContainer>
      <ScreenHeader title="Delete account" onBack={() => router.back()} />
      <View style={twStyle("px-4 pt-4 pb-8")}>
        {isProviderOwner && (
          <View style={twStyle("mb-4 rounded-xl border border-red-200 bg-red-50 p-4")}>
            <Text style={twStyle("font-medium text-red-800")}>Provider business account</Text>
            <Text style={twStyle("mt-1 text-sm text-red-700 leading-5")}>
              Deleting permanently removes your provider profile, services, and linked business data. Team members
              may lose access to this business. To take a break instead, use Deactivate account in Settings.
            </Text>
          </View>
        )}

        {isDeactivated && (
          <View style={twStyle("mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4")}>
            <Text style={twStyle("font-medium text-amber-800")}>Account deactivated</Text>
            <Text style={twStyle("mt-1 text-sm text-amber-700")}>
              Your account is currently deactivated. You can still permanently delete it below.
            </Text>
          </View>
        )}

        {isSuspended && (
          <View style={twStyle("mb-4 rounded-xl border border-red-200 bg-red-50 p-4")}>
            <Text style={twStyle("font-medium text-red-800")}>Account suspended</Text>
            <Text style={twStyle("mt-1 text-sm text-red-700")}>
              {status?.suspension_reason ?? "Your account has been suspended. Please contact support."}
            </Text>
          </View>
        )}

        <Text style={twStyle("text-base text-gray-700 leading-6")}>
          Permanently delete your account and associated personal data directly from the app.
        </Text>
        <Text style={twStyle("mt-4 text-sm text-gray-500")}>
          Confirm with your password or a one-time verification code. This action cannot be undone.
        </Text>

        <View style={twStyle("mt-5 rounded-xl border border-gray-200 bg-white p-4")}>
          {!authSecurityLoaded ? (
            <View style={twStyle("items-center py-4")}>
              <ActivityIndicator color="#6b7280" />
              <Text style={twStyle("mt-2 text-sm text-gray-600")}>Loading verification options…</Text>
            </View>
          ) : hasPassword ? (
            <>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Current password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Enter password"
                placeholderTextColor="#9ca3af"
                style={twStyle("mb-3 rounded-lg border border-gray-200 px-3 py-2.5 text-gray-900")}
              />
            </>
          ) : (
            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-2 text-sm text-gray-600")}>
                Confirm with a one-time verification code.
              </Text>
              <Text style={twStyle("mb-2 text-xs text-gray-500")}>{otpDestination.sendButtonHint}</Text>
              <TouchableOpacity
                onPress={requestVerificationCode}
                disabled={requestingNonce || !canVerifyWithCode}
                style={twStyle("mb-2 rounded-lg border border-gray-200 bg-white px-3 py-3")}
              >
                <Text style={twStyle("text-center font-semibold text-gray-900")}>
                  {requestingNonce ? "Sending..." : "Send verification code"}
                </Text>
              </TouchableOpacity>
              <TextInput
                value={verificationNonce}
                onChangeText={(value) => setVerificationNonce(value.replace(/\D/g, ""))}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                placeholder="Enter code"
                placeholderTextColor="#9ca3af"
                style={twStyle("rounded-lg border border-gray-200 px-3 py-2.5 text-gray-900")}
              />
            </View>
          )}
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Reason (optional)</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Why are you leaving?"
            placeholderTextColor="#9ca3af"
            multiline
            style={twStyle("min-h-[88px] rounded-lg border border-gray-200 px-3 py-2.5 text-gray-900")}
          />
          <Text style={twStyle("mb-1 mt-4 text-sm font-medium text-gray-700")}>
            Type{" "}
            <Text style={twStyle("font-mono text-red-600")}>{DELETE_PHRASE}</Text> to confirm
          </Text>
          <TextInput
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={DELETE_PHRASE}
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
            autoCorrect={false}
            style={twStyle(
              `rounded-lg border px-3 py-2.5 text-gray-900 ${confirmOk ? "border-gray-200" : "border-red-200"}`,
            )}
          />
          <Text style={twStyle("mt-2 text-xs text-gray-500")}>
            Same safeguards as the website. Passwordless accounts receive a code by{" "}
            {otpDestination.channel === "sms" ? "SMS" : "email"}.
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleDeleteAccount}
          style={twStyle(
            `mt-6 rounded-xl border py-4 px-4 ${
              deleting ||
              !confirmOk ||
              !sensitiveActionSubmitReady(authSecurity, { password, verificationNonce })
                ? "border-gray-200 bg-gray-100"
                : "border-red-300 bg-red-50"
            }`,
          )}
          activeOpacity={0.7}
          disabled={
            deleting ||
            !confirmOk ||
            !sensitiveActionSubmitReady(authSecurity, { password, verificationNonce })
          }
        >
          <Text
            style={twStyle(
              `text-center font-semibold ${
                deleting ||
                !confirmOk ||
                !sensitiveActionSubmitReady(authSecurity, { password, verificationNonce })
                  ? "text-gray-400"
                  : "text-red-700"
              }`,
            )}
          >
            {deleting ? "Deleting..." : "Delete account permanently"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
