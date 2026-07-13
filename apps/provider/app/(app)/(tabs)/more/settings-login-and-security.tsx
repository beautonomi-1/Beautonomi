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

const COUNTRY_CODES = [
  { code: "+27", label: "ZA +27" },
  { code: "+254", label: "KE +254" },
  { code: "+233", label: "GH +233" },
  { code: "+234", label: "NG +234" },
  { code: "+255", label: "TZ +255" },
  { code: "+256", label: "UG +256" },
  { code: "+260", label: "ZM +260" },
  { code: "+263", label: "ZW +263" },
  { code: "+267", label: "BW +267" },
  { code: "+264", label: "NA +264" },
  { code: "+1", label: "US +1" },
  { code: "+44", label: "UK +44" },
];

export default function SettingsLoginAndSecurityScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const canUseQuietRefresh = useRef(false);

  const biometric = useBiometricAuth();

  const [profile, setProfile] = useState<{ email?: string; phone?: string; email_change_pending?: boolean; auth_security?: AuthSecurityState | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const emailChange = useEmailChangeOtp({
    onVerified: () => load(),
    strings: {
      verifiedTitle: "Email updated",
      verifiedBody: "Your email address has been verified and saved.",
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
        if (!quiet) setError(res.error.message || "Failed to load profile");
      } else {
        setProfile(res.data ?? null);
        if (!quiet) setError(null);
        canUseQuietRefresh.current = true;
      }
    } catch (e) {
      if (!quiet) setError(getApiErrorMessage(e, "Failed to load profile"));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

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
      Alert.alert("Validation", "Please enter a valid phone number.");
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
        "Code sent",
        `A ${SUPABASE_AUTH_OTP_LENGTH}-digit code has been sent to ${e164}. It's valid for about ${mins} minute${mins === 1 ? "" : "s"}.`,
      );
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error)?.message ?? "Failed to send verification code.");
    } finally {
      setPhoneSending(false);
    }
  };

  const handleVerifyPhoneOtp = async (otpOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(otpOverride ?? phoneOtpCode);
    if (!pendingPhoneE164 || !isCompleteSupabaseSmsOtp(token)) {
      Alert.alert("Validation", `Please enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code from your SMS.`);
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
      if (res.error) throw new Error(res.error.message ?? "Failed to save phone number.");
      setPhoneStep(null);
      setPendingPhoneE164("");
      setPhoneOtpCode("");
      setPhoneNational("");
      Alert.alert("Phone updated", "Your phone number has been updated successfully.");
      void load();
    } catch (e: unknown) {
      Alert.alert("Verification failed", (e as Error)?.message ?? "The code was incorrect or has expired.");
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
      Alert.alert("Error", `Could not ${value ? "enable" : "disable"} biometric authentication.`);
    }
  };

  const handleGlobalSignOut = useCallback(() => {
    const goToLogin = () => router.replace("/(auth)/login" as never);
    const perform = async () => {
      setSigningOutGlobal(true);
      try {
        const res = await api.post<{ ok?: boolean }>("/api/auth/sign-out-global", {});
        if (res.error) {
          Alert.alert("Error", res.error.message ?? "Could not sign out from all devices.");
          return;
        }
        await signOut();
        goToLogin();
      } catch (e) {
        Alert.alert("Error", getApiErrorMessage(e, "Could not sign out from all devices."));
      } finally {
        setSigningOutGlobal(false);
      }
    };
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Sign out from all devices?",
      "This ends every active session across all your phones, tablets and browsers. You'll need to log in again everywhere. Use this if you suspect unauthorised access.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out everywhere", style: "destructive", onPress: () => void perform() },
      ],
    );
  }, [router, signOut]);

  const rawEmail = profile?.email ?? user?.email ?? "";
  const currentEmail = isMailableEmail(rawEmail) ? rawEmail : "";
  const currentPhone = profile?.phone ?? "";
  const biometricLabel =
    biometric.biometricType === "face" ? "Face ID" :
    biometric.biometricType === "fingerprint" ? "Fingerprint" :
    biometric.biometricType === "iris" ? "Iris" : "Biometrics";

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Login & security" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Login & security" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <Text style={{ color: Colors.gray[500], textAlign: "center", marginBottom: 16 }}>{error}</Text>
          <TouchableOpacity
            onPress={() => void load()}
            style={{ backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 }}
          >
            <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader title="Login & security" subtitle="Email, phone, password & sessions" onBack={() => router.back()} />

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
                Security
              </Text>
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    <Ionicons
                      name={biometric.biometricType === "face" ? "scan-outline" : "finger-print-outline"}
                      size={18}
                      color="#6366f1"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[900] }}>{biometricLabel} lock</Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 1 }}>
                      Require {biometricLabel.toLowerCase()} to open the app
                    </Text>
                  </View>
                  <Switch
                    value={biometric.isEnabled}
                    onValueChange={handleBiometricToggle}
                    trackColor={{ false: Colors.gray[200], true: "#6366f1" }}
                    thumbColor={Colors.white}
                    accessibilityLabel={`Toggle ${biometricLabel} lock`}
                  />
                </View>
              </View>
            </View>
          )}

          {/* ── Email address ── */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Email address
            </Text>
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
              <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>
                Current:{" "}
                <Text style={{ fontWeight: "500", color: Colors.gray[800] }}>{currentEmail || "—"}</Text>
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
                    placeholder="New email address"
                    placeholderTextColor="#9ca3af"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="New email address"
                  />
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 10 }}>
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
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Send verification code"
                  >
                    {emailChange.sending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 14 }}>Send verification code</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 8 }}>
                    Code sent to {emailChange.pendingEmail}
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
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={emailChange.reset}
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.gray[300] }}
                    >
                      <Text style={{ color: Colors.gray[700], fontWeight: "600" }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void emailChange.verifyCode()}
                      disabled={emailChange.verifying}
                      style={{ flex: 1, backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: 12, alignItems: "center" }}
                    >
                      {emailChange.verifying ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: Colors.white, fontWeight: "600" }}>Verify & save</Text>
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
              Phone number
            </Text>
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
              <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>
                Current:{" "}
                <Text style={{ fontWeight: "500", color: Colors.gray[800] }}>
                  {currentPhone
                    ? currentPhone.replace(/(\+\d{2,3})(\d{3})(\d+)(\d{4})/, "$1 $2 *** $4")
                    : "—"}
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
                      accessibilityLabel={`Country code ${countryCode}`}
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
                      placeholder="New phone number"
                      placeholderTextColor="#9ca3af"
                      keyboardType="phone-pad"
                      accessibilityLabel="New phone number"
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
                          accessibilityLabel={c.label}
                        >
                          <Text style={{ fontSize: 14, color: Colors.gray[800] }}>{c.label}</Text>
                          {countryCode === c.code && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 10, lineHeight: 18 }}>
                    {`We'll SMS a ${SUPABASE_AUTH_OTP_LENGTH}-digit code to verify your number (valid ${Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60))} min).`}
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
                    accessibilityLabel="Send phone verification code"
                  >
                    {phoneSending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 14 }}>Send verification code</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {phoneStep === "enter_otp" && (
                <>
                  <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 4 }}>
                    Code sent to{" "}
                    <Text style={{ fontWeight: "600" }}>{pendingPhoneE164.replace(/(\+\d{2,3})(\d{3})(\d+)(\d{4})/, "$1 $2 *** $4")}</Text>
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 12 }}>
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
                      accessibilityLabel="Cancel phone change"
                    >
                      <Text style={{ color: Colors.gray[700], fontWeight: "600", fontSize: 14 }}>Cancel</Text>
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
                      accessibilityLabel="Verify and save phone"
                    >
                      {phoneVerifying ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 14 }}>Verify & save</Text>
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
              Password
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
              accessibilityLabel={profile?.auth_security?.has_password === false ? "Set password" : "Change password"}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.gray[600]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[900] }}>
                  {profile?.auth_security?.has_password === false ? "Set password" : "Change password"}
                </Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 1 }}>
                  {profile?.auth_security?.has_password === false
                    ? "Add password sign-in to your account"
                    : "Update your account password"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
            </TouchableOpacity>
          </View>

          {/* ── Active sessions ── */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Active sessions
            </Text>
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
              <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 12, lineHeight: 18 }}>
                Sign out from this app and every other phone, tablet or browser where your account is signed in.
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
                accessibilityLabel="Sign out from all devices"
              >
                {signingOutGlobal ? (
                  <ActivityIndicator size="small" color={Colors.gray[700]} />
                ) : (
                  <Text style={{ color: Colors.gray[900], fontWeight: "600", fontSize: 15 }}>Sign out from all devices</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Danger zone ── */}
          <View>
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Account
            </Text>
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#FEF2F2", overflow: "hidden" }}>
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/more/settings-deactivate-account" as never)}
                style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center" }}
                accessibilityRole="button"
                accessibilityLabel="Deactivate account"
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "#b91c1c" }}>Deactivate account</Text>
                  <Text style={{ fontSize: 12, color: "#dc2626", marginTop: 1 }}>Temporarily disable your account</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#dc2626" />
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
