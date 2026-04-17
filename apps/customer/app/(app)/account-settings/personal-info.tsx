import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, Pressable, ScrollView, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useImagePicker } from "@/hooks/useImagePicker";
import { Colors } from "@/constants/colors";
import { SCREEN_PADDING, RADIUS_CARD, RADIUS_INPUT, RADIUS_BUTTON, STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { PhoneInputWithCountry } from "@/components/PhoneInputWithCountry";
import { getDeviceDefaultCountryDial } from "@/lib/device-default-country-dial";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { parsePhoneToCountryAndNational, getNationalFromStored } from "@/constants/phone";
import { supabase } from "@/lib/supabase/client";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS,
} from "@/lib/supabase-sms-otp";

export default function PersonalInfoScreen() {
  useScreenTracking("Personal Info");
  const { pickWithOptions, loading: pickLoading } = useImagePicker();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState(getDeviceDefaultCountryDial);
  const [phoneNational, setPhoneNational] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyCountryCode, setEmergencyCountryCode] = useState(getDeviceDefaultCountryDial);
  const [emergencyPhoneNational, setEmergencyPhoneNational] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailChangePending, setEmailChangePending] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"enter_phone" | "enter_otp" | null>(null);
  const [phoneModalCountryCode, setPhoneModalCountryCode] = useState(getDeviceDefaultCountryDial);
  const [phoneModalNational, setPhoneModalNational] = useState("");
  const [pendingPhoneE164, setPendingPhoneE164] = useState("");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileSettled, profileDataSettled] = await Promise.allSettled([
        api.get<any>("/api/me/profile"),
        api.get<any>("/api/me/profile-data"),
      ]);
      const profileRes = profileSettled.status === "fulfilled" ? profileSettled.value : null;
      const profileDataRes = profileDataSettled.status === "fulfilled" ? profileDataSettled.value : null;
      if (!profileRes || profileRes.error) {
        setError(getApiErrorMessage(profileRes?.error, "Failed to load"));
        setProfile(null);
      } else {
        const p = profileRes.data;
        setProfile(p);
        setEmailChangePending(!!(p as { email_change_pending?: boolean })?.email_change_pending);
        setFullName(p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "");
        const deviceDial = getDeviceDefaultCountryDial();
        const main = parsePhoneToCountryAndNational(p?.phone, deviceDial);
        setPhoneCountryCode(main.countryCode);
        setPhoneNational(main.national);
        const ec = p?.emergency_contact;
        setEmergencyName(ec?.name ?? "");
        setEmergencyCountryCode(ec?.country_code || deviceDial);
        setEmergencyPhoneNational(getNationalFromStored(ec?.country_code, ec?.phone));
        setEmergencyRelationship(ec?.relationship ?? "");
      }
      if (profileDataRes && !profileDataRes.error && profileDataRes.data) {
        setAbout(profileDataRes.data.about ?? "");
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
        setShowEmailModal(false);
        Alert.alert(
          "Check your email",
          "We sent a confirmation link to your new email. Open it to complete the change."
        );
        load();
      }
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to send verification"));
    } finally {
      setEmailSending(false);
    }
  };

  const handleSendPhoneOtp = async () => {
    const fullPhone = `${phoneModalCountryCode}${phoneModalNational.replace(/\D/g, "")}`.trim();
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
    } catch (e: unknown) {
      Alert.alert("Error", (e as { message?: string })?.message ?? "Failed to send code. Please try again.");
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
      setShowPhoneModal(false);
      setPhoneStep(null);
      setPendingPhoneE164("");
      setPhoneOtpCode("");
      Alert.alert("Saved", "Your phone number has been updated.");
      load();
    } catch (e: unknown) {
      Alert.alert("Verification failed", (e as { message?: string })?.message ?? "Invalid or expired code. Request a new one.");
    } finally {
      setPhoneVerifying(false);
    }
  };

  const uploadAvatar = async () => {
    const result = await pickWithOptions();
    if (!result) return;
    try {
      const formData = new FormData();
      formData.append("file", {
        uri: result.uri,
        name: result.fileName || "avatar.jpg",
        type: "image/jpeg",
      } as any);
      const res = await api.post<any>("/api/me/avatar", formData as any);
      if (res.error) {
        Alert.alert("Error", getApiErrorMessage(res.error, "Upload failed"));
      } else {
        const url = (res.data as any)?.url;
        if (url) {
          const patchRes = await api.patch<any>("/api/me/profile", { avatar_url: url });
          if (patchRes.error) {
            Alert.alert("Error", "Photo uploaded but profile could not be updated. Please try again.");
          }
          load();
        } else {
          Alert.alert("Upload issue", "Photo uploaded but no URL was returned. Please try again.");
          load();
        }
      }
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Upload failed"));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const parts = fullName.trim().split(/\s+/);
      const first = parts[0] || "";
      const last = parts.slice(1).join(" ") || "";
      const fullPhone = phoneNational.trim()
        ? `${phoneCountryCode}${phoneNational.replace(/\D/g, "")}`
        : null;
      const emergencyPhoneDigits = emergencyPhoneNational.trim().replace(/\D/g, "");
      const profilePayload: Record<string, unknown> = {
        first_name: first,
        last_name: last,
        full_name: fullName.trim(),
        phone: fullPhone,
        emergency_contact: {
          name: emergencyName.trim() || null,
          country_code: emergencyPhoneDigits ? emergencyCountryCode : null,
          phone: emergencyPhoneDigits || null,
          relationship: emergencyRelationship.trim() || null,
        },
      };
      const res = await api.patch<any>("/api/me/profile", profilePayload);
      if (res.error) {
        Alert.alert("Error", getApiErrorMessage(res.error, "Failed to save"));
        return;
      }
      const aboutValue = about.trim() || null;
      const profileDataRes = await api.post<any>("/api/me/profile-data", { about: aboutValue });
      if (profileDataRes.error) {
        Alert.alert("Error", getApiErrorMessage(profileDataRes.error, "Profile saved but About me could not be updated."));
      } else {
        Alert.alert("Saved", "Your profile has been updated.");
      }
      load();
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const cardStyle = {
    backgroundColor: Colors.white,
    borderRadius: RADIUS_CARD,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  };
  const inputStyle = {
    borderRadius: RADIUS_INPUT,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.gray[900],
  };

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      {profile && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, paddingBottom: STACK_CONTENT_PADDING_BOTTOM }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          accessibilityLabel="Personal info form"
          accessibilityRole="none"
        >
          {/* Profile photo card */}
          <View style={[cardStyle, { alignItems: "center", paddingVertical: 24 }]}>
            <Pressable onPress={uploadAvatar} disabled={pickLoading} accessibilityLabel="Change profile photo" accessibilityRole="button">
              <View style={{ width: 112, height: 112, borderRadius: 56, overflow: "hidden", borderWidth: 3, borderColor: Colors.primary + "20" }}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                ) : (
                  <View style={{ width: "100%", height: "100%", backgroundColor: Colors.gray[200], alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 36, color: Colors.gray[500], fontWeight: "600" }}>
                      {(profile.full_name || profile.email || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
            <Text style={{ fontSize: 14, color: Colors.primary, marginTop: 12, fontWeight: "500" }}>Tap to change photo</Text>
            <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>Required for your profile</Text>
          </View>

          {/* Basic info card */}
          <View style={cardStyle}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900], marginBottom: 16 }}>Basic info</Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>Full name</Text>
              <TextInput
                style={[inputStyle, { backgroundColor: Colors.white }]}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your name"
                placeholderTextColor={Colors.gray[400]}
                accessibilityLabel="Full name"
                accessibilityRole="none"
              />
            </View>
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Email</Text>
                <TouchableOpacity onPress={() => { setNewEmail(""); setShowEmailModal(true); }} accessibilityLabel="Change email" accessibilityRole="button">
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>Change email</Text>
                </TouchableOpacity>
              </View>
              <View style={{ borderRadius: RADIUS_INPUT, backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, color: Colors.gray[600] }}>{profile.email || "-"}</Text>
              </View>
              {emailChangePending && (
                <View style={{ backgroundColor: "#FEF3C7", padding: 12, borderRadius: RADIUS_INPUT, marginTop: 8 }}>
                  <Text style={{ fontSize: 13, color: "#92400E" }}>Check your new email and open the confirmation link to complete the change.</Text>
                </View>
              )}
            </View>
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Phone</Text>
                <TouchableOpacity onPress={() => { setPhoneStep("enter_phone"); setPhoneModalNational(""); setPhoneOtpCode(""); setPendingPhoneE164(""); setShowPhoneModal(true); }} accessibilityLabel="Change phone" accessibilityRole="button">
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>Change phone</Text>
                </TouchableOpacity>
              </View>
              <PhoneInputWithCountry
                label=""
                countryCode={phoneCountryCode}
                onCountryCodeChange={setPhoneCountryCode}
                nationalValue={phoneNational}
                onNationalChange={setPhoneNational}
                placeholder="Your phone number"
                accessibilityLabel="Your phone number"
              />
            </View>
          </View>

          {/* About card */}
          <View style={cardStyle}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>About me</Text>
            <TextInput
              style={[inputStyle, { minHeight: 96, textAlignVertical: "top" }, { backgroundColor: Colors.white }]}
              value={about}
              onChangeText={setAbout}
              placeholder="A short bio for your profile (optional)"
              placeholderTextColor={Colors.gray[400]}
              multiline
              numberOfLines={3}
              accessibilityLabel="About me"
              accessibilityRole="none"
            />
          </View>

          {/* Emergency contact card */}
          <View style={cardStyle}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900], marginBottom: 4 }}>Emergency contact</Text>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 16 }}>Optional – used in case of emergency</Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>Name</Text>
              <TextInput
                style={[inputStyle, { backgroundColor: Colors.white }]}
                value={emergencyName}
                onChangeText={setEmergencyName}
                placeholder="Contact name"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>
            <View style={{ marginBottom: 16 }}>
              <PhoneInputWithCountry
                label="Phone"
                countryCode={emergencyCountryCode}
                onCountryCodeChange={setEmergencyCountryCode}
                nationalValue={emergencyPhoneNational}
                onNationalChange={setEmergencyPhoneNational}
                placeholder="Their phone number"
                accessibilityLabel="Emergency contact phone number"
              />
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>Relationship</Text>
              <TextInput
                style={[inputStyle, { backgroundColor: Colors.white }]}
                value={emergencyRelationship}
                onChangeText={setEmergencyRelationship}
                placeholder="e.g. Spouse, Parent"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>
          </View>

          <TouchableOpacity
            onPress={save}
            disabled={saving}
            style={{
              backgroundColor: Colors.primary,
              paddingVertical: 16,
              borderRadius: RADIUS_BUTTON,
              alignItems: "center",
              marginTop: 8,
            }}
            accessibilityLabel={saving ? "Saving profile" : "Save profile"}
            accessibilityRole="button"
          >
            <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>{saving ? "Saving..." : "Save changes"}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Change email modal */}
      <Modal visible={showEmailModal} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }} onPress={() => setShowEmailModal(false)}>
          <Pressable style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 24 }} onPress={(e) => e.stopPropagation()}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>Change email</Text>
              <TouchableOpacity onPress={() => setShowEmailModal(false)} hitSlop={12} accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={Colors.gray[500]} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12 }}>We&apos;ll send a confirmation link to your new email. Open it to complete the change.</Text>
            <TextInput
              style={{ borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: Colors.gray[900], marginBottom: 16 }}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="New email address"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={{ flexDirection: "row", marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowEmailModal(false)} style={{ flex: 1, marginRight: 12, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center", borderWidth: 1, borderColor: Colors.gray[300] }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleChangeEmail} disabled={emailSending} style={{ flex: 1, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center" }}>
                {emailSending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontWeight: "600", color: Colors.white }}>Send verification email</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Change phone modal */}
      <Modal visible={showPhoneModal} transparent animationType="fade">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowPhoneModal(false)}>
            <Pressable style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 24 }} onPress={(e) => e.stopPropagation()}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>Change phone number</Text>
                <TouchableOpacity onPress={() => { setShowPhoneModal(false); setPhoneStep(null); }} hitSlop={12} accessibilityLabel="Close">
                  <Ionicons name="close" size={24} color={Colors.gray[500]} />
                </TouchableOpacity>
              </View>
              {phoneStep === "enter_phone" ? (
                <>
                  <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12 }}>
                    We&apos;ll SMS a {SUPABASE_AUTH_OTP_LENGTH}-digit code (valid about{" "}
                    {Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60))}{" "}
                    {Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1 ? "minute" : "minutes"}). Your number only updates after you verify.
                  </Text>
                  <PhoneInputWithCountry
                    countryCode={phoneModalCountryCode}
                    onCountryCodeChange={setPhoneModalCountryCode}
                    nationalValue={phoneModalNational}
                    onNationalChange={setPhoneModalNational}
                    placeholder="New phone number"
                    accessibilityLabel="New phone number"
                  />
                  <View style={{ flexDirection: "row", marginTop: 16 }}>
                    <TouchableOpacity onPress={() => setShowPhoneModal(false)} style={{ flex: 1, marginRight: 12, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center", borderWidth: 1, borderColor: Colors.gray[300] }}>
                      <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSendPhoneOtp} disabled={phoneSending} style={{ flex: 1, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center" }}>
                      {phoneSending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontWeight: "600", color: Colors.white }}>Send code</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>Code sent to {pendingPhoneE164.replace(/(\+\d{2,3})(\d{3})(\d+)(\d{4})/, "$1 $2 *** $4")}</Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 10 }}>
                    Enter the {SUPABASE_AUTH_OTP_LENGTH}-digit code from your SMS
                  </Text>
                  <View style={{ marginBottom: 16 }}>
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
                  </View>
                  <View style={{ flexDirection: "row" }}>
                    <TouchableOpacity onPress={() => { setPhoneStep("enter_phone"); setPhoneOtpCode(""); setPendingPhoneE164(""); }} style={{ flex: 1, marginRight: 12, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center", borderWidth: 1, borderColor: Colors.gray[300] }}>
                      <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => void handleVerifyPhoneOtp()} disabled={phoneVerifying || !isCompleteSupabaseSmsOtp(phoneOtpCode)} style={{ flex: 1, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center" }}>
                      {phoneVerifying ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontWeight: "600", color: Colors.white }}>Verify & save</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenFrame>
  );
}
