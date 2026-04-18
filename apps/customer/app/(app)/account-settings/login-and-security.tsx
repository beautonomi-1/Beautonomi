import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
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

type PhoneStep = "enter_phone" | "enter_otp" | null;

export default function LoginAndSecurityScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updating, setUpdating] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailChangePending, setEmailChangePending] = useState(false);

  const [phoneStep, setPhoneStep] = useState<PhoneStep>(null);
  const [phoneCountryCode, setPhoneCountryCode] = useState(getDeviceDefaultCountryDial);
  const [phoneNational, setPhoneNational] = useState("");
  const [pendingPhoneE164, setPendingPhoneE164] = useState("");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);

  const biometric = useBiometricAuth();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/profile");
      if (res.error) setError(res.error.message || "Failed to load");
      else {
        setProfile(res.data);
        setEmailChangePending(!!(res.data as any)?.email_change_pending);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updatePassword = async () => {
    if (!currentPassword?.trim()) {
      Alert.alert("Error", "Enter your current password");
      return;
    }
    if (!password || password.length < 8) {
      Alert.alert("Error", "New password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }
    setUpdating(true);
    try {
      const res = await api.put<any>("/api/me/password", {
        currentPassword: currentPassword.trim(),
        newPassword: password,
      });
      if (res.error) {
        Alert.alert("Error", res.error.message ?? "Failed to update password");
      } else {
        Alert.alert("Success", "Password updated.");
        setCurrentPassword("");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to update"));
    } finally {
      setUpdating(false);
    }
  };

  const handleChangeEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      Alert.alert("Error", "Enter your new email address");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    setEmailSending(true);
    try {
      const res = await api.patch<any>("/api/me/profile", { email });
      if (res.error) {
        Alert.alert("Error", res.error.message ?? "Failed to send verification");
      } else {
        setEmailChangePending(true);
        setNewEmail("");
        Alert.alert(
          "Check your email",
          "We sent a confirmation link to your new email. Open it to complete the change."
        );
      }
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to send verification"));
    } finally {
      setEmailSending(false);
    }
  };

  const handleSendPhoneOtp = async () => {
    const fullPhone = `${phoneCountryCode}${phoneNational.replace(/\D/g, "")}`.trim();
    const raw = fullPhone.startsWith("+") ? fullPhone : `+${fullPhone}`;
    const e164 = normalizeSupabaseAuthPhone(raw);
    if (e164.replace(/\D/g, "").length < 10) {
      Alert.alert("Error", "Enter a valid phone number");
      return;
    }
    setPhoneSending(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ phone: e164 });
      if (updateError) throw updateError;
      setPendingPhoneE164(e164);
      setPhoneStep("enter_otp");
      setPhoneOtpCode("");
      Alert.alert(
        "Code sent",
        `Enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code sent to your phone (valid about ${Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60))} ${Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1 ? "minute" : "minutes"}).`,
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to send code. Please try again.");
    } finally {
      setPhoneSending(false);
    }
  };

  const handleVerifyPhoneOtp = async (otpOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(otpOverride ?? phoneOtpCode);
    if (!pendingPhoneE164 || !isCompleteSupabaseSmsOtp(token)) {
      Alert.alert("Error", `Enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code from your SMS`);
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
      if (res.error) throw new Error(res.error.message ?? "Failed to save phone");
      setPhoneStep(null);
      setPendingPhoneE164("");
      setPhoneOtpCode("");
      Alert.alert("Saved", "Your phone number has been updated.");
      load();
    } catch (e: any) {
      Alert.alert("Verification failed", e?.message ?? "Invalid or expired code. Request a new one.");
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
      "Sign out from all devices?",
      "This will sign you out everywhere — phone, tablet, browsers — and require you to log in again on each device. Use this if you suspect someone else may have accessed your account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out everywhere",
          style: "destructive",
          onPress: async () => {
            setSigningOutGlobal(true);
            try {
              const res = await api.post<{ ok?: boolean }>(
                "/api/auth/sign-out-global",
                {},
              );
              if (res.error) {
                Alert.alert("Error", res.error.message ?? "Could not sign out everywhere. Please try again.");
                return;
              }
              try {
                await supabase.auth.signOut();
              } catch {
                // best effort - server-side global signout already revoked tokens
              }
              router.replace("/(auth)/login");
            } catch (e) {
              Alert.alert("Error", getApiErrorMessage(e, "Could not sign out everywhere"));
            } finally {
              setSigningOutGlobal(false);
            }
          },
        },
      ],
    );
  };

  const currentEmail = profile?.email ?? user?.email ?? "";
  const currentPhone = profile?.phone ?? user?.phone ?? "";
  const parsedPhone = parsePhoneToCountryAndNational(currentPhone, getDeviceDefaultCountryDial());

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
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
                  <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>Biometric Login</Text>
                  {biometric.isAvailable ? (
                    <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
                      Use {biometricLabel} to sign in quickly
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
                  accessibilityLabel="Enable biometric login"
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
              {emailChangePending ? (
                <View style={{ backgroundColor: "#FEF3C7", padding: 12, borderRadius: 12 }}>
                  <Text style={{ fontSize: 14, color: "#92400E" }}>
                    Check your new email and open the confirmation link to complete the change.
                  </Text>
                </View>
              ) : (
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
                    value={newEmail}
                    onChangeText={setNewEmail}
                    placeholder="New email address"
                    placeholderTextColor={Colors.gray[400]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={handleChangeEmail}
                    disabled={emailSending}
                    style={{
                      backgroundColor: Colors.primary,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                      marginTop: 12,
                    }}
                  >
                    {emailSending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: Colors.white, fontWeight: "600" }}>Send verification email</Text>
                    )}
                  </TouchableOpacity>
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
                Change password
              </Text>
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
                  placeholder="At least 8 characters"
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
                  {updating ? "Updating..." : "Update password"}
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
