import { useCallback, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
  const da = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.deleteAccount." + key, opts) as string,
    [t],
  );
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
      Alert.alert(da("pleaseWaitTitle"), da("stillLoadingSecurity"));
      return;
    }
    if (hasPassword && !password.trim()) {
      Alert.alert(da("passwordRequiredTitle"), da("passwordRequiredBody"));
      return;
    }
    if (!hasPassword && !verificationNonce.trim()) {
      Alert.alert(da("verificationRequiredTitle"), da("verificationRequiredBody"));
      return;
    }
    if (!confirmOk) {
      Alert.alert(da("confirmationRequiredTitle"), da("confirmationRequiredBody", { phrase: DELETE_PHRASE }));
      return;
    }
    Alert.alert(
      da("deleteConfirmTitle"),
      isProviderOwner ? da("deleteConfirmBodyOwner") : da("deleteConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: da("deletePermanentlyCta"),
          style: "destructive",
          onPress: async () => {
            const result = await deleteAccount("/api/me/delete-account", {
              password: hasPassword ? password.trim() : undefined,
              verificationNonce: hasPassword ? undefined : verificationNonce.trim(),
              reason: reason.trim() || "Deleted from mobile app",
            });
            if (result.error) {
              Alert.alert(da("deleteFailedTitle"), result.error);
              return;
            }
            const payload = result.data as { scheduled?: boolean; message?: string; grace_days?: number } | undefined;
            await signOut();
            const scheduled = payload?.scheduled === true;
            Alert.alert(
              scheduled ? da("deletionScheduledTitle") : da("deletedTitle"),
              payload?.message ??
                (scheduled
                  ? da("deletionScheduledBody", { days: payload?.grace_days ?? 30 })
                  : da("deletedBody")),
            );
            router.replace(
              (scheduled ? "/(auth)/login?deletion_scheduled=1" : "/(auth)/login") as never,
            );
          },
        },
      ],
    );
  };

  const requestVerificationCode = async () => {
    if (!canVerifyWithCode) {
      Alert.alert(da("addContactMethodTitle"), otpDestination.codeSentMessage);
      return;
    }
    setRequestingNonce(true);
    try {
      const { error: reauthError } = await supabase.auth.reauthenticate();
      if (reauthError) throw reauthError;
      Alert.alert(t("provider.mobile.screens.loginSecurity.codeSentTitle"), otpDestination.codeSentMessage);
    } catch (e) {
      Alert.alert(da("sendCodeFailedTitle"), e instanceof Error ? e.message : da("sendCodeFailedBody"));
    } finally {
      setRequestingNonce(false);
    }
  };

  if (loading && status == null) {
    return (
      <ScreenContainer>
        <ScreenHeader title={da("title")} onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && status == null) {
    return (
      <ScreenContainer>
        <ScreenHeader title={da("title")} onBack={() => router.back()} />
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
      <ScreenHeader title={da("title")} onBack={() => router.back()} />
      <View style={twStyle("px-4 pt-4 pb-8")}>
        {isProviderOwner && (
          <View style={twStyle("mb-4 rounded-xl border border-red-200 bg-red-50 p-4")}>
            <Text style={twStyle("font-medium text-red-800")}>{da("providerBannerTitle")}</Text>
            <Text style={twStyle("mt-1 text-sm text-red-700 leading-5")}>
              {da("providerBannerBody")}
            </Text>
          </View>
        )}

        {isDeactivated && (
          <View style={twStyle("mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4")}>
            <Text style={twStyle("font-medium text-amber-800")}>{da("accountDeactivatedTitle")}</Text>
            <Text style={twStyle("mt-1 text-sm text-amber-700")}>
              {da("accountDeactivatedBody")}
            </Text>
          </View>
        )}

        {isSuspended && (
          <View style={twStyle("mb-4 rounded-xl border border-red-200 bg-red-50 p-4")}>
            <Text style={twStyle("font-medium text-red-800")}>{da("accountSuspendedTitle")}</Text>
            <Text style={twStyle("mt-1 text-sm text-red-700")}>
              {status?.suspension_reason ?? da("accountSuspendedBodyDefault")}
            </Text>
          </View>
        )}

        <Text style={twStyle("text-base text-gray-700 leading-6")}>
          {da("introBody")}
        </Text>
        <Text style={twStyle("mt-4 text-sm text-gray-500")}>
          {da("confirmHint", { phrase: DELETE_PHRASE })}
        </Text>

        <View style={twStyle("mt-5 rounded-xl border border-gray-200 bg-white p-4")}>
          {!authSecurityLoaded ? (
            <View style={twStyle("items-center py-4")}>
              <ActivityIndicator color="#6b7280" />
              <Text style={twStyle("mt-2 text-sm text-gray-600")}>{da("loadingVerificationOptions")}</Text>
            </View>
          ) : hasPassword ? (
            <>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{da("passwordLabel")}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder={da("passwordPlaceholder")}
                placeholderTextColor="#9ca3af"
                style={twStyle("mb-3 rounded-lg border border-gray-200 px-3 py-2.5 text-gray-900")}
              />
            </>
          ) : (
            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-2 text-sm text-gray-600")}>
                {da("confirmWithOtpBody")}
              </Text>
              <Text style={twStyle("mb-2 text-xs text-gray-500")}>{otpDestination.sendButtonHint}</Text>
              <TouchableOpacity
                onPress={requestVerificationCode}
                disabled={requestingNonce || !canVerifyWithCode}
                style={twStyle("mb-2 rounded-lg border border-gray-200 bg-white px-3 py-3")}
              >
                <Text style={twStyle("text-center font-semibold text-gray-900")}>
                  {requestingNonce ? da("sending") : da("sendVerificationCode")}
                </Text>
              </TouchableOpacity>
              <TextInput
                value={verificationNonce}
                onChangeText={(value) => setVerificationNonce(value.replace(/\D/g, ""))}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                placeholder={da("enterCodePlaceholder")}
                placeholderTextColor="#9ca3af"
                style={twStyle("rounded-lg border border-gray-200 px-3 py-2.5 text-gray-900")}
              />
            </View>
          )}
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{da("reasonLabel")}</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={da("reasonPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
            style={twStyle("min-h-[88px] rounded-lg border border-gray-200 px-3 py-2.5 text-gray-900")}
          />
          <Text style={twStyle("mb-1 mt-4 text-sm font-medium text-gray-700")}>
            {da("typeConfirmPrefix")}{" "}
            <Text style={twStyle("font-mono text-red-600")}>{DELETE_PHRASE}</Text> {da("typeConfirmSuffix")}
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
            {da("safeguardsBody", {
              channel: otpDestination.channel === "sms" ? da("channelSms") : da("channelEmail"),
            })}
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
            {deleting ? da("deleting") : da("deleteAccountPermanently")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
