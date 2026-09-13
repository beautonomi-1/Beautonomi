import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Switch, Platform } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Colors } from "@/constants/colors";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS,
} from "@/lib/supabase-sms-otp";
import { isMailableEmail } from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";
import { useEmailChangeOtp } from "@/lib/auth/useEmailChangeOtp";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

type PhoneStep = "enter_phone" | "enter_otp" | null;
type AuthSecurityState = {
  has_password: boolean;
  has_mailable_email: boolean;
  has_phone: boolean;
  email_is_placeholder: boolean;
  password_changed_at: string | null;
  policy: { minimum_password_length: number };
};

const COUNTRY_CODES = [
  { code: "+27", labelKey: "countryZa" },
  { code: "+254", labelKey: "countryKe" },
  { code: "+233", labelKey: "countryGh" },
  { code: "+234", labelKey: "countryNg" },
  { code: "+255", labelKey: "countryTz" },
  { code: "+256", labelKey: "countryUg" },
  { code: "+260", labelKey: "countryZm" },
  { code: "+263", labelKey: "countryZw" },
  { code: "+267", labelKey: "countryBw" },
  { code: "+264", labelKey: "countryNa" },
  { code: "+1", labelKey: "countryUs" },
  { code: "+44", labelKey: "countryUk" },
];

export default function SettingsLoginAndSecurityScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const ls = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.loginSecurity.${key}`, opts) as string,
    [t],
  );
  const { user, signOut } = useAuth();
  const canUseQuietRefresh = useRef(false);

  const biometric = useBiometricAuth();

  const [profile, setProfile] = useState<{ email?: string; phone?: string; email_change_pending?: boolean; auth_security?: AuthSecurityState | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const emailChange = useEmailChangeOtp({
    onVerified: () => load(),
    errorTitle: ls("errorTitle"),
    strings: {
      verifiedTitle: ls("emailUpdatedTitle"),
      verifiedBody: ls("emailUpdatedBody"),
      invalidEmail: ls("invalidEmail"),
      enterOtp: ls("enterEmailOtp", { digits: SUPABASE_AUTH_OTP_LENGTH }),
      sendFailed: ls("sendFailed"),
      verifyFailedTitle: ls("verifyFailedTitle"),
      verifyFailedBody: ls("verifyFailedBody"),
    },
  });

  // Phone change
  const [phoneStep, setPhoneStep] = useState<PhoneStep>(null);
  const [countryCode, setCountryCode] = useState("+27");
  const [phoneNational, setPhoneNational] = useState("");
  const [pendingPhoneE164, setPendingPhoneE164] = useState("");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // Global sign-out
  const [signingOutGlobal, setSigningOutGlobal] = useState(false);

  const load = useCallback(async () => {
    const quiet = canUseQuietRefresh.current;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api.get<{ email?: string; phone?: string; email_change_pending?: boolean; auth_security?: AuthSecurityState | null }>("/api/me/profile");
      if (res.error) {
        if (!quiet) setError(res.error.message || ls("loadFailed"));
      } else {
        setProfile(res.data ?? null);
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

  const handleSendPhoneOtp = async () => {
    const digits = phoneNational.replace(/\D/g, "");
    if (!digits || digits.length < 7) {
      Alert.alert(ls("validationTitle"), ls("invalidPhone"));
      return;
    }
    const raw = `${countryCode}${digits}`;
    const e164 = normalizeSupabaseAuthPhone(raw);
    setPhoneSending(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ phone: e164 });
      if (updateError) throw updateError;
      setPendingPhoneE164(e164);
      setPhoneStep("enter_otp");
      setPhoneOtpCode("");
      const mins = Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60));
      Alert.alert(
        ls("codeSentTitle"),
        ls("codeSentBody", { digits: SUPABASE_AUTH_OTP_LENGTH, phone: e164, count: mins }),
      );
    } catch (e: unknown) {
      Alert.alert(ls("errorTitle"), (e as Error)?.message ?? ls("sendCodeFailed"));
    } finally {
      setPhoneSending(false);
    }
  };

  const handleVerifyPhoneOtp = async (otpOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(otpOverride ?? phoneOtpCode);
    if (!pendingPhoneE164 || !isCompleteSupabaseSmsOtp(token)) {
      Alert.alert(ls("validationTitle"), ls("enterSmsOtp", { digits: SUPABASE_AUTH_OTP_LENGTH }));
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
      const res = await api.patch<{ phone?: string }>("/api/me/profile", {
        phone: normalizeSupabaseAuthPhone(pendingPhoneE164),
      });
      if (res.error) throw new Error(res.error.message ?? ls("savePhoneFailed"));
      setPhoneStep(null);
      setPendingPhoneE164("");
      setPhoneOtpCode("");
      setPhoneNational("");
      Alert.alert(ls("phoneUpdatedTitle"), ls("phoneUpdatedBody"));
      void load();
    } catch (e: unknown) {
      Alert.alert(ls("verificationFailedTitle"), (e as Error)?.message ?? ls("verificationFailedBody"));
    } finally {
      setPhoneVerifying(false);
    }
  };

  const handleBiometricToggle = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (value) {
        await biometric.enable();
      } else {
        await biometric.disable();
      }
    } catch {
      Alert.alert(ls("errorTitle"), value ? ls("biometricEnableFailed") : ls("biometricDisableFailed"));
    }
  };

  const handleGlobalSignOut = useCallback(() => {
    const goToLogin = () => router.replace("/(auth)/login" as never);
    const perform = async () => {
      setSigningOutGlobal(true);
      try {
        const res = await api.post<{ ok?: boolean }>("/api/auth/sign-out-global", {});
        if (res.error) {
          Alert.alert(ls("errorTitle"), res.error.message ?? ls("signOutAllFailed"));
          return;
        }
        await signOut();
        goToLogin();
      } catch (e) {
        Alert.alert(ls("errorTitle"), getApiErrorMessage(e, ls("signOutAllFailed")));
      } finally {
        setSigningOutGlobal(false);
      }
    };
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      ls("signOutAllTitle"),
      ls("signOutAllBody"),
      [
        { text: ls("cancel"), style: "cancel" },
        { text: ls("signOutEverywhere"), style: "destructive", onPress: () => void perform() },
      ],
    );
  }, [router, signOut, ls]);

  const rawEmail = profile?.email ?? user?.email ?? "";
  const currentEmail = isMailableEmail(rawEmail) ? rawEmail : "";
  const currentPhone = profile?.phone ?? "";
  const biometricLabel =
    biometric.biometricType === "face" ? ls("biometricFace") :
    biometric.biometricType === "fingerprint" ? ls("biometricFingerprint") :
    biometric.biometricType === "iris" ? ls("biometricIris") : ls("biometricGeneric");

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenHeader title={ls("title")} onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
        <ScreenHeader title={ls("title")} onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <Text style={{ color: Colors.gray[500], textAlign: "center", marginBottom: 16 }}>{error}</Text>
          <TouchableOpacity
            onPress={() => void load()}
            style={{ backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 }}
          >
            <Text style={{ color: Colors.white, fontWeight: "600" }}>{ls("retry")}</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader title={ls("title")} subtitle={ls("subtitle")} onBack={() => router.back()} />

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Biometric ── */}
          {Platform.OS !== "web" && biometric.isAvailable && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                {ls("sectionSecurity")}
              </Text>
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", marginEnd: 12 }}>
                    <Ionicons
                      name={biometric.biometricType === "face" ? "scan-outline" : "finger-print-outline"}
                      size={18}
                      color="#6366f1"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[900] }}>{ls("lockLabel", { label: biometricLabel })}</Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 1 }}>
                      {ls("requireBiometric", { label: biometricLabel.toLowerCase() })}
                    </Text>
                  </View>
                  <Switch
                    value={biometric.isEnabled}
                    onValueChange={handleBiometricToggle}
                    trackColor={{ false: Colors.gray[200], true: "#6366f1" }}
                    thumbColor={Colors.white}
                    accessibilityLabel={ls("toggleLockA11y", { label: biometricLabel })}
                  />
                </View>
              </View>
            </View>
          )}

          {/* ── Email address ── */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              {ls("sectionEmail")}
            </Text>
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
              <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>
                {ls("currentLabel")}{" "}
                <Text style={{ fontWeight: "500", color: Colors.gray[800] }}>{currentEmail || ls("emptyValue")}</Text>
              </Text>
              {emailChange.step === null ? (
                <>
                  <TextInput
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: Colors.gray[200],
                      backgroundColor: Colors.gray[50],
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 15,
                      color: Colors.gray[900],
                      marginBottom: 10,
                    }}
                    value={emailChange.newEmail}
                    onChangeText={emailChange.setNewEmail}
                    placeholder={ls("newEmailPlaceholder")}
                    placeholderTextColor="#9ca3af"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={ls("newEmailA11y")}
                  />
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 10 }}>
                    {ls("emailOtpHint", { digits: emailChange.otpLength })}
                  </Text>
                  <TouchableOpacity
                    onPress={() => void emailChange.sendCode()}
                    disabled={emailChange.sending}
                    style={{
                      backgroundColor: Colors.primary,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={ls("sendVerificationA11y")}
                  >
                    {emailChange.sending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 14 }}>{ls("sendVerification")}</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 8 }}>
                    {ls("codeSentTo", { destination: emailChange.pendingEmail })}
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
                    accessibilityLabelPrefix={ls("emailOtpA11yPrefix")}
                  />
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={emailChange.reset}
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.gray[300] }}
                    >
                      <Text style={{ color: Colors.gray[700], fontWeight: "600" }}>{ls("cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void emailChange.verifyCode()}
                      disabled={emailChange.verifying}
                      style={{ flex: 1, backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: 12, alignItems: "center" }}
                    >
                      {emailChange.verifying ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: Colors.white, fontWeight: "600" }}>{ls("verifyAndSave")}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* ── Phone number ── */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              {ls("sectionPhone")}
            </Text>
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
              <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>
                {ls("currentLabel")}{" "}
                <Text style={{ fontWeight: "500", color: Colors.gray[800] }}>
                  {currentPhone
                    ? currentPhone.replace(/(\+\d{2,3})(\d{3})(\d+)(\d{4})/, "$1 $2 *** $4")
                    : ls("emptyValue")}
                </Text>
              </Text>

              {phoneStep === null && (
                <>
                  {/* Country code + national number row */}
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                    <TouchableOpacity
                      onPress={() => setShowCountryPicker((v) => !v)}
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: Colors.gray[200],
                        backgroundColor: Colors.gray[50],
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                      accessibilityLabel={ls("countryCodeA11y", { code: countryCode })}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[800] }}>{countryCode}</Text>
                      <Ionicons name="chevron-down" size={14} color={Colors.gray[500]} />
                    </TouchableOpacity>
                    <TextInput
                      style={{
                        flex: 1,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: Colors.gray[200],
                        backgroundColor: Colors.gray[50],
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 15,
                        color: Colors.gray[900],
                      }}
                      value={phoneNational}
                      onChangeText={setPhoneNational}
                      placeholder={ls("newPhonePlaceholder")}
                      placeholderTextColor="#9ca3af"
                      keyboardType="phone-pad"
                      accessibilityLabel={ls("newPhoneA11y")}
                    />
                  </View>

                  {showCountryPicker && (
                    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, marginBottom: 10, overflow: "hidden" }}>
                      {COUNTRY_CODES.map((c, idx) => (
                        <TouchableOpacity
                          key={c.code}
                          onPress={() => { setCountryCode(c.code); setShowCountryPicker(false); }}
                          style={{
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderBottomWidth: idx < COUNTRY_CODES.length - 1 ? 1 : 0,
                            borderBottomColor: Colors.gray[100],
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={ls(c.labelKey)}
                        >
                          <Text style={{ fontSize: 14, color: Colors.gray[800] }}>{ls(c.labelKey)}</Text>
                          {countryCode === c.code && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 10, lineHeight: 18 }}>
                    {ls("phoneOtpHint", { digits: SUPABASE_AUTH_OTP_LENGTH, minutes: Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60)) })}
                  </Text>
                  <TouchableOpacity
                    onPress={handleSendPhoneOtp}
                    disabled={phoneSending}
                    style={{
                      backgroundColor: Colors.primary,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={ls("sendPhoneVerificationA11y")}
                  >
                    {phoneSending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 14 }}>{ls("sendVerification")}</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {phoneStep === "enter_otp" && (
                <>
                  <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 4 }}>
                    {ls("codeSentTo", { destination: pendingPhoneE164.replace(/(\+\d{2,3})(\d{3})(\d+)(\d{4})/, "$1 $2 *** $4") })}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 12 }}>
                    {ls("enterSmsOtpHint", { digits: SUPABASE_AUTH_OTP_LENGTH })}
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
                    accessibilityLabelPrefix={ls("phoneOtpA11yPrefix")}
                  />
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={() => { setPhoneStep(null); setPhoneOtpCode(""); setPendingPhoneE164(""); }}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: Colors.gray[200],
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={ls("cancelPhoneChangeA11y")}
                    >
                      <Text style={{ color: Colors.gray[700], fontWeight: "600", fontSize: 14 }}>{ls("cancel")}</Text>
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
                      accessibilityRole="button"
                      accessibilityLabel={ls("verifySavePhoneA11y")}
                    >
                      {phoneVerifying ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 14 }}>{ls("verifyAndSave")}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* ── Password ── */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              {ls("sectionPassword")}
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/settings-change-password" as never)}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                backgroundColor: Colors.white,
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
              }}
              accessibilityRole="button"
              accessibilityLabel={profile?.auth_security?.has_password === false ? ls("setPassword") : ls("changePassword")}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginEnd: 12 }}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.gray[600]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[900] }}>
                  {profile?.auth_security?.has_password === false ? ls("setPassword") : ls("changePassword")}
                </Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 1 }}>
                  {profile?.auth_security?.has_password === false
                    ? ls("setPasswordDesc")
                    : ls("changePasswordDesc")}
                </Text>
              </View>
              <DirectionalIcon name="chevron-forward" size={18} color={Colors.gray[400]} />
            </TouchableOpacity>
          </View>

          {/* ── Active sessions ── */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              {ls("sectionSessions")}
            </Text>
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
              <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 12, lineHeight: 18 }}>
                {ls("sessionsBody")}
              </Text>
              <TouchableOpacity
                onPress={handleGlobalSignOut}
                disabled={signingOutGlobal}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  backgroundColor: Colors.white,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel={ls("signOutAllA11y")}
              >
                {signingOutGlobal ? (
                  <ActivityIndicator size="small" color={Colors.gray[700]} />
                ) : (
                  <Text style={{ color: Colors.gray[900], fontWeight: "600", fontSize: 15 }}>{ls("signOutAllCta")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Danger zone ── */}
          <View>
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              {ls("sectionAccount")}
            </Text>
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#FEF2F2", overflow: "hidden" }}>
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/more/settings-deactivate-account" as never)}
                style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center" }}
                accessibilityRole="button"
                accessibilityLabel={ls("deactivateA11y")}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "#b91c1c" }}>{ls("deactivateAccount")}</Text>
                  <Text style={{ fontSize: 12, color: "#dc2626", marginTop: 1 }}>{ls("deactivateDesc")}</Text>
                </View>
                <DirectionalIcon name="chevron-forward" size={18} color="#dc2626" />
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
