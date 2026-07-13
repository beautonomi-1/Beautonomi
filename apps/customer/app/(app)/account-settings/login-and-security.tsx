import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { View, Text, TextInput, TouchableOpacity, Alert, Platform, Switch, ScrollView, ActivityIndicator } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import { PhoneInputWithCountry } from "@/components/PhoneInputWithCountry";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { parsePhoneToCountryAndNational } from "@/constants/phone";
import { getDeviceDefaultCountryDial } from "@/lib/device-default-country-dial";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS,
} from "@/lib/supabase-sms-otp";
import { isMailableEmail } from "@beautonomi/utils";
import { useEmailChangeOtp } from "@/lib/auth/useEmailChangeOtp";

type PhoneStep = "enter_phone" | "enter_otp" | null;
type AuthSecurityState = {
  has_password: boolean;
  has_mailable_email: boolean;
  has_phone: boolean;
  email_is_placeholder: boolean;
  password_changed_at: string | null;
  policy: { minimum_password_length: number };
};

export default function LoginAndSecurityScreen() {
  const { t } = useTranslation();
  const ls = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.loginSecurity.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const { user, signOut } = useAuth();
  const canUseQuietRefresh = useRef(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNonce, setPasswordNonce] = useState("");
  const [updating, setUpdating] = useState(false);
  const [requestingPasswordNonce, setRequestingPasswordNonce] = useState(false);

  const emailChange = useEmailChangeOtp({
    onVerified: () => load(),
    errorTitle: t("customer.mobile.screens.authLogin.errorTitle"),
    strings: {
      invalidEmail: ls("invalidEmail"),
      enterOtp: ls("enterEmailOtp", { digits: String(SUPABASE_AUTH_OTP_LENGTH) }),
      sendFailed: ls("sendVerificationFailed"),
      verifyFailedTitle: ls("verificationFailedTitle"),
      verifyFailedBody: ls("verificationFailedBody"),
      verifiedTitle: ls("emailSavedTitle"),
      verifiedBody: ls("emailSavedBody"),
    },
  });

  const [phoneStep, setPhoneStep] = useState<PhoneStep>(null);
  const [phoneCountryCode, setPhoneCountryCode] = useState(getDeviceDefaultCountryDial);
  const [phoneNational, setPhoneNational] = useState("");
  const [pendingPhoneE164, setPendingPhoneE164] = useState("");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);

  const biometric = useBiometricAuth();
  const authSecurity = (profile as { auth_security?: AuthSecurityState | null } | null)?.auth_security ?? null;
  const isSettingFirstPassword = authSecurity?.has_password === false;
  const minimumPasswordLength = authSecurity?.policy?.minimum_password_length ?? 8;
  const canVerifyPasswordAction = Boolean(
    authSecurity == null ||
      authSecurity.has_password ||
      authSecurity.has_mailable_email ||
      authSecurity.has_phone,
  );

  const load = useCallback(async () => {
    const quiet = canUseQuietRefresh.current;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api.get<any>("/api/me/profile");
      if (res.error) {
        if (!quiet) setError(res.error.message || ls("loadFailed"));
      } else {
        setProfile(res.data);
        if (!quiet) setError(null);
        canUseQuietRefresh.current = true;
      }
    } catch (e) {
      if (!quiet) setError(getApiErrorMessage(e, ls("loadFailed")));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [ls]);

  useEffect(() => {
    canUseQuietRefresh.current = false;
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const updatePassword = async () => {
    if (!isSettingFirstPassword && !currentPassword?.trim()) {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), ls("enterCurrentPassword"));
      return;
    }
    if (isSettingFirstPassword && !passwordNonce.trim()) {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), "Enter the verification code before setting a password.");
      return;
    }
    if (!password || password.length < minimumPasswordLength) {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), `Password must be at least ${minimumPasswordLength} characters long.`);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), ls("passwordsMismatch"));
      return;
    }
    setUpdating(true);
    try {
      const res = await api.put<any>("/api/me/password", {
        mode: isSettingFirstPassword ? "set" : "change",
        currentPassword: isSettingFirstPassword ? undefined : currentPassword.trim(),
        nonce: isSettingFirstPassword ? passwordNonce.trim() : undefined,
        newPassword: password,
      });
      if (res.error) {
        Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), res.error.message ?? ls("updatePasswordFailed"));
      } else {
        Alert.alert(
          isSettingFirstPassword ? "Password set" : ls("passwordUpdatedTitle"),
          isSettingFirstPassword ? "You can now sign in with your password as well as one-time codes." : ls("passwordUpdatedBody"),
        );
        setCurrentPassword("");
        setPassword("");
        setConfirmPassword("");
        setPasswordNonce("");
        void load();
      }
    } catch (e) {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), getApiErrorMessage(e, ls("updateFailed")));
    } finally {
      setUpdating(false);
    }
  };

  const requestPasswordNonce = async () => {
    if (!canVerifyPasswordAction) {
      Alert.alert("Add contact method", "Add and verify an email or phone number before setting a password.");
      return;
    }
    setRequestingPasswordNonce(true);
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      Alert.alert("Code sent", "Enter the verification code below to set your password.");
    } catch (e) {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), getApiErrorMessage(e, "Failed to send verification code."));
    } finally {
      setRequestingPasswordNonce(false);
    }
  };

  const handleSendPhoneOtp = async () => {
    const fullPhone = `${phoneCountryCode}${phoneNational.replace(/\D/g, "")}`.trim();
    const raw = fullPhone.startsWith("+") ? fullPhone : `+${fullPhone}`;
    const e164 = normalizeSupabaseAuthPhone(raw);
    if (e164.replace(/\D/g, "").length < 10) {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), ls("invalidPhone"));
      return;
    }
    setPhoneSending(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ phone: e164 });
      if (updateError) throw updateError;
      setPendingPhoneE164(e164);
      setPhoneStep("enter_otp");
      setPhoneOtpCode("");
      const mins = Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60));
      const minuteUnit = mins === 1 ? ls("minuteSingular") : ls("minutePlural");
      Alert.alert(
        ls("codeSentTitle"),
        ls("codeSentBody", {
          digits: String(SUPABASE_AUTH_OTP_LENGTH),
          minutes: String(mins),
          minuteUnit,
        }),
      );
    } catch (e: any) {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), e?.message ?? ls("sendCodeFailed"));
    } finally {
      setPhoneSending(false);
    }
  };

  const handleVerifyPhoneOtp = async (otpOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(otpOverride ?? phoneOtpCode);
    if (!pendingPhoneE164 || !isCompleteSupabaseSmsOtp(token)) {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), ls("enterOtp", { digits: String(SUPABASE_AUTH_OTP_LENGTH) }));
      return;
    }
    setPhoneVerifying(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: normalizeSupabaseAuthPhone(pendingPhoneE164),
        token,
        type: "phone_change",
      });
      if (verifyError) throw verifyError;
      const res = await api.patch<any>("/api/me/profile", {
        phone: normalizeSupabaseAuthPhone(pendingPhoneE164),
      });
      if (res.error) throw new Error(res.error.message ?? ls("savePhoneFailed"));
      setPhoneStep(null);
      setPendingPhoneE164("");
      setPhoneOtpCode("");
      Alert.alert(ls("phoneSavedTitle"), ls("phoneSavedBody"));
      load();
    } catch (e: any) {
      Alert.alert(ls("verificationFailedTitle"), e?.message ?? ls("verificationFailedBody"));
    } finally {
      setPhoneVerifying(false);
    }
  };

  const biometricLabel =
    biometric.biometricType === "face"
      ? "Face ID"
      : biometric.biometricType === "fingerprint"
        ? "fingerprint"
        : "biometrics";

  const handleBiometricToggle = async (value: boolean) => {
    if (value) await biometric.enable();
    else await biometric.disable();
  };

  const [signingOutGlobal, setSigningOutGlobal] = useState(false);

  const handleGlobalSignOut = () => {
    Alert.alert(
      ls("globalSignOutTitle"),
      ls("globalSignOutBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: ls("signOutEverywhereCta"),
          style: "destructive",
          onPress: async () => {
            setSigningOutGlobal(true);
            try {
              const res = await api.post<{ ok?: boolean }>(
                "/api/auth/sign-out-global",
                {},
              );
              if (res.error) {
                Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), res.error.message ?? ls("signOutEverywhereFailed"));
                return;
              }
              await signOut();
              router.replace("/(auth)/login");
            } catch (e) {
              Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), getApiErrorMessage(e, ls("signOutEverywhereError")));
            } finally {
              setSigningOutGlobal(false);
            }
          },
        },
      ],
    );
  };

  const rawEmail = profile?.email ?? user?.email ?? "";
  const currentEmail = isMailableEmail(rawEmail) ? rawEmail : "";
  const currentPhone = profile?.phone ?? user?.phone ?? "";
  const parsedPhone = parsePhoneToCountryAndNational(currentPhone, getDeviceDefaultCountryDial());

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScreenFrame loading={loading} error={error} onRetry={load}>
        {profile && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {/* Biometric */}
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[300],
                backgroundColor: Colors.white,
                paddingHorizontal: 16,
                paddingVertical: 16,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>{ls("appLockTitle")}</Text>
                  {biometric.isAvailable ? (
                    <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
                      {ls("appLockSubtitle", { label: biometricLabel })}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 14, color: Colors.gray[400], marginTop: 4 }}>
                      Biometric authentication is not available on this device
                    </Text>
                  )}
                </View>
                <Switch
                  value={biometric.isEnabled}
                  onValueChange={handleBiometricToggle}
                  disabled={!biometric.isAvailable}
                  trackColor={{ false: Colors.gray[300], true: Colors.primary }}
                  thumbColor={Colors.white}
                  accessibilityRole="switch"
                  accessibilityLabel={ls("appLockTitle")}
                  accessibilityState={{ checked: biometric.isEnabled }}
                />
              </View>
            </View>

            {/* Change Email */}
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], marginBottom: 4 }}>
                Email address
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 12 }}>
                Current: {currentEmail || "—"}
              </Text>
              {emailChange.step === null ? (
                <>
                  <TextInput
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: Colors.gray[300],
                      backgroundColor: Colors.white,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      fontSize: 16,
                      color: Colors.gray[900],
                    }}
                    value={emailChange.newEmail}
                    onChangeText={emailChange.setNewEmail}
                    placeholder="New email address"
                    placeholderTextColor={Colors.gray[400]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 8, lineHeight: 18 }}>
                    We&apos;ll email a {emailChange.otpLength}-digit code to verify your new address.
                  </Text>
                  <TouchableOpacity
                    onPress={() => void emailChange.sendCode()}
                    disabled={emailChange.sending}
                    style={{
                      backgroundColor: Colors.primary,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                      marginTop: 12,
                    }}
                  >
                    {emailChange.sending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: Colors.white, fontWeight: "600" }}>Send verification code</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>
                    Code sent to {emailChange.pendingEmail}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 10 }}>
                    Enter the {emailChange.otpLength}-digit code from your email
                  </Text>
                  <OtpDigitRow
                    value={emailChange.otpCode}
                    onChange={emailChange.setOtpCode}
                    onComplete={(code) => {
                      if (!emailChange.verifying && isCompleteSupabaseSmsOtp(code))
                        void emailChange.verifyCode(code);
                    }}
                    disabled={emailChange.verifying}
                    autoFocus
                    accessibilityLabelPrefix="Email change verification code"
                  />
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={emailChange.reset}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: Colors.gray[300],
                      }}
                    >
                      <Text style={{ color: Colors.gray[700], fontWeight: "600" }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void emailChange.verifyCode()}
                      disabled={emailChange.verifying || !isCompleteSupabaseSmsOtp(emailChange.otpCode)}
                      style={{
                        flex: 1,
                        backgroundColor: Colors.primary,
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: "center",
                      }}
                    >
                      {emailChange.verifying ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: Colors.white, fontWeight: "600" }}>Verify & save</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {emailChange.resendCooldown > 0 ? (
                    <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 10, textAlign: "center" }}>
                      Resend in {emailChange.resendCooldown}s
                    </Text>
                  ) : (
                    <TouchableOpacity onPress={() => void emailChange.resendCode()} style={{ marginTop: 10, alignItems: "center" }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.primary }}>Resend code</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            {/* Change Phone */}
            <View style={{ marginTop: 28 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], marginBottom: 4 }}>
                Phone number
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 12 }}>
                Current: {currentPhone ? `${parsedPhone.countryCode} *** ***${(parsedPhone.national || "").slice(-4)}` : "—"}
              </Text>
              {phoneStep === null ? (
                <>
                  <PhoneInputWithCountry
                    countryCode={phoneCountryCode}
                    onCountryCodeChange={setPhoneCountryCode}
                    nationalValue={phoneNational}
                    onNationalChange={setPhoneNational}
                    placeholder="New phone number"
                    accessibilityLabel="New phone number"
                  />
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 8, lineHeight: 18 }}>
                    We&apos;ll SMS a {SUPABASE_AUTH_OTP_LENGTH}-digit code (valid about{" "}
                    {Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60))}{" "}
                    {Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1 ? "minute" : "minutes"}).
                  </Text>
                  <TouchableOpacity
                    onPress={handleSendPhoneOtp}
                    disabled={phoneSending}
                    style={{
                      backgroundColor: Colors.primary,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                      marginTop: 12,
                    }}
                  >
                    {phoneSending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: Colors.white, fontWeight: "600" }}>Send verification code</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>
                    Code sent to {pendingPhoneE164.replace(/(\+\d{2,3})(\d{3})(\d+)(\d{4})/, "$1 $2 *** $4")}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 10 }}>
                    Enter the {SUPABASE_AUTH_OTP_LENGTH}-digit code from your SMS
                  </Text>
                  <OtpDigitRow
                    value={phoneOtpCode}
                    onChange={setPhoneOtpCode}
                    onComplete={(code) => {
                      if (!phoneVerifying && isCompleteSupabaseSmsOtp(code)) void handleVerifyPhoneOtp(code);
                    }}
                    disabled={phoneVerifying}
                    autoFocus
                    smsAutofill
                    accessibilityLabelPrefix="Phone change verification code"
                  />
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setPhoneStep(null);
                        setPhoneOtpCode("");
                        setPendingPhoneE164("");
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: Colors.gray[300],
                      }}
                    >
                      <Text style={{ color: Colors.gray[700], fontWeight: "600" }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void handleVerifyPhoneOtp()}
                      disabled={phoneVerifying || !isCompleteSupabaseSmsOtp(phoneOtpCode)}
                      style={{
                        flex: 1,
                        backgroundColor: Colors.primary,
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: "center",
                      }}
                    >
                      {phoneVerifying ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: Colors.white, fontWeight: "600" }}>Verify & save</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            {/* Password */}
            <View style={{ marginTop: 28 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], marginBottom: 12 }}>
                {isSettingFirstPassword ? "Set password" : "Change password"}
              </Text>
              {isSettingFirstPassword ? (
                <View style={{ borderRadius: 12, backgroundColor: "#EEF2FF", padding: 12, marginBottom: 16 }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[700], lineHeight: 20 }}>
                    Your account uses one-time codes or social login. Send a verification code, then choose a password.
                  </Text>
                  {!canVerifyPasswordAction ? (
                    <Text style={{ marginTop: 8, fontSize: 13, color: "#b91c1c" }}>
                      Add and verify an email or phone number before setting a password.
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    onPress={requestPasswordNonce}
                    disabled={requestingPasswordNonce || !canVerifyPasswordAction}
                    style={{
                      backgroundColor: Colors.white,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                      marginTop: 12,
                      borderWidth: 1,
                      borderColor: Colors.gray[300],
                    }}
                  >
                    <Text style={{ color: Colors.gray[900], fontWeight: "600" }}>
                      {requestingPasswordNonce ? "Sending..." : "Send verification code"}
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4, marginTop: 12 }}>
                    Verification code
                  </Text>
                  <TextInput
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: Colors.gray[300],
                      backgroundColor: Colors.white,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      fontSize: 16,
                      color: Colors.gray[900],
                    }}
                    value={passwordNonce}
                    onChangeText={(value) => setPasswordNonce(value.replace(/\D/g, ""))}
                    placeholder="Enter code"
                    placeholderTextColor={Colors.gray[400]}
                    keyboardType="number-pad"
                    autoComplete="sms-otp"
                    textContentType="oneTimeCode"
                  />
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>
                    Current password
                  </Text>
                  <TextInput
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: Colors.gray[300],
                      backgroundColor: Colors.white,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      fontSize: 16,
                      color: Colors.gray[900],
                    }}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="••••••••"
                    placeholderTextColor={Colors.gray[400]}
                    secureTextEntry
                  />
                  <TouchableOpacity
                    onPress={() => router.push("/(auth)/forgot-password")}
                    style={{ marginTop: 8 }}
                    accessibilityRole="link"
                    accessibilityLabel="Forgot password"
                  >
                    <Text style={{ color: Colors.primary, fontWeight: "600" }}>Forgot password?</Text>
                  </TouchableOpacity>
                </>
              )}
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>
                  New password
                </Text>
                <TextInput
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: Colors.gray[300],
                    backgroundColor: Colors.white,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    fontSize: 16,
                    color: Colors.gray[900],
                  }}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={`At least ${minimumPasswordLength} characters`}
                  placeholderTextColor={Colors.gray[400]}
                  secureTextEntry
                />
              </View>
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>
                  Confirm new password
                </Text>
                <TextInput
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: Colors.gray[300],
                    backgroundColor: Colors.white,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    fontSize: 16,
                    color: Colors.gray[900],
                  }}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.gray[400]}
                  secureTextEntry
                />
              </View>
              <TouchableOpacity
                onPress={updatePassword}
                disabled={updating}
                style={{
                  backgroundColor: Colors.primary,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                  marginTop: 16,
                }}
              >
                <Text style={{ color: Colors.white, fontWeight: "600" }}>
                  {updating ? (isSettingFirstPassword ? "Setting..." : "Updating...") : (isSettingFirstPassword ? "Set password" : "Update password")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Wave 2.4 (audit 2026-04 final 100/100): global sign-out */}
            <View style={{ marginTop: 32 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Active sessions</Text>
              <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12, lineHeight: 20 }}>
                Sign out from this app and every other phone, tablet or browser where your Beautonomi account is signed in.
              </Text>
              <TouchableOpacity
                onPress={handleGlobalSignOut}
                disabled={signingOutGlobal}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.gray[300],
                  backgroundColor: Colors.white,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  alignItems: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Sign out from all devices"
              >
                {signingOutGlobal ? (
                  <ActivityIndicator size="small" color={Colors.gray[700]} />
                ) : (
                  <Text style={{ color: Colors.gray[900], fontWeight: "600", fontSize: 16 }}>
                    Sign out from all devices
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 32 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Account</Text>
              <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12, lineHeight: 20 }}>
                Temporarily disable your account. You can reactivate later by signing in again.
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(app)/account-settings/deactivate-account")}
                style={{
                  borderWidth: 1,
                  borderColor: "#fecaca",
                  backgroundColor: "#FEF2F2",
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  alignItems: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Deactivate account"
              >
                <Text style={{ color: "#b91c1c", fontWeight: "700", fontSize: 16 }}>Deactivate account</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </ScreenFrame>
    </KeyboardAvoidingView>
  );
}
