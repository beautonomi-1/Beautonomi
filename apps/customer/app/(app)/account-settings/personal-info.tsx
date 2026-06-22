import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { View, Text, TextInput, TouchableOpacity, Alert, Pressable, ScrollView, Modal, ActivityIndicator, Platform } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
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
} from "@/lib/supabase-sms-otp";
import { appendFormDataFileNative } from "@beautonomi/utils";

export default function PersonalInfoScreen() {
  useScreenTracking("Personal Info");
  const { t } = useTranslation();
  const pi = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.personalInfo.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const ls = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.loginSecurity.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
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
  // §UX-audit 2026-05: 30s resend cooldown prevents OTP spam and replaces
  // the blocking Alert — visual feedback is shown inline in the modal.
  const PHONE_RESEND_COOLDOWN_SECS = 30;
  const [phoneResendCooldown, setPhoneResendCooldown] = useState(0);
  const phoneResendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
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
        setError(getApiErrorMessage(profileRes?.error, ls("loadFailed")));
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
      setError(getApiErrorMessage(e, ls("loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [ls]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (phoneResendCooldown <= 0) {
      if (phoneResendIntervalRef.current) {
        clearInterval(phoneResendIntervalRef.current);
        phoneResendIntervalRef.current = null;
      }
      return;
    }
    phoneResendIntervalRef.current = setInterval(
      () => setPhoneResendCooldown((c) => (c > 0 ? c - 1 : 0)),
      1000,
    );
    return () => {
      if (phoneResendIntervalRef.current) {
        clearInterval(phoneResendIntervalRef.current);
        phoneResendIntervalRef.current = null;
      }
    };
  }, [phoneResendCooldown]);

  const handleChangeEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      Alert.alert(errTitle, ls("enterNewEmail"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert(errTitle, ls("invalidEmail"));
      return;
    }
    setEmailSending(true);
    try {
      const res = await api.patch<any>("/api/me/profile", { email });
      if (res.error) {
        Alert.alert(errTitle, res.error.message ?? ls("sendVerificationFailed"));
      } else {
        setEmailChangePending(true);
        setNewEmail("");
        setShowEmailModal(false);
        Alert.alert(ls("emailChangeSentTitle"), ls("emailChangeSentBody"));
        load();
      }
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e, ls("sendVerificationFailed")));
    } finally {
      setEmailSending(false);
    }
  };

  const handleSendPhoneOtp = async () => {
    const fullPhone = `${phoneModalCountryCode}${phoneModalNational.replace(/\D/g, "")}`.trim();
    const raw = fullPhone.startsWith("+") ? fullPhone : `+${fullPhone}`;
    const e164 = normalizeSupabaseAuthPhone(raw);
    if (e164.replace(/\D/g, "").length < 10) {
      Alert.alert(errTitle, ls("invalidPhone"));
      return;
    }
    setPhoneSending(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ phone: e164 });
      if (updateError) throw updateError;
      setPendingPhoneE164(e164);
      setPhoneOtpCode("");
      // §UX-audit 2026-05: transition to OTP step immediately — no
      // blocking Alert. Inline modal header already confirms the number.
      setPhoneStep("enter_otp");
      setPhoneResendCooldown(PHONE_RESEND_COOLDOWN_SECS);
    } catch (e: unknown) {
      Alert.alert(errTitle, (e as { message?: string })?.message ?? ls("sendCodeFailed"));
    } finally {
      setPhoneSending(false);
    }
  };

  const handleResendPhoneOtp = async () => {
    if (phoneResendCooldown > 0 || phoneSending) return;
    const e164 = pendingPhoneE164;
    if (!e164) return;
    setPhoneSending(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ phone: e164 });
      if (updateError) throw updateError;
      setPhoneOtpCode("");
      setPhoneResendCooldown(PHONE_RESEND_COOLDOWN_SECS);
    } catch (e: unknown) {
      Alert.alert(errTitle, (e as { message?: string })?.message ?? ls("sendCodeFailed"));
    } finally {
      setPhoneSending(false);
    }
  };

  const handleVerifyPhoneOtp = async (otpOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(otpOverride ?? phoneOtpCode);
    if (!pendingPhoneE164 || !isCompleteSupabaseSmsOtp(token)) {
      Alert.alert(errTitle, ls("enterOtp", { digits: String(SUPABASE_AUTH_OTP_LENGTH) }));
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
      setShowPhoneModal(false);
      setPhoneStep(null);
      setPendingPhoneE164("");
      setPhoneOtpCode("");
      Alert.alert(ls("phoneSavedTitle"), ls("phoneSavedBody"));
      load();
    } catch (e: unknown) {
      Alert.alert(ls("verificationFailedTitle"), (e as { message?: string })?.message ?? ls("verificationFailedBody"));
    } finally {
      setPhoneVerifying(false);
    }
  };

  const uploadAvatar = async () => {
    const result = await pickWithOptions();
    if (!result) return;
    try {
      const formData = new FormData();
      appendFormDataFileNative(formData, "file", {
        uri: result.uri,
        name: result.fileName || "avatar.jpg",
        type: result.mimeType?.trim() || "image/jpeg",
      });
      const res = await api.post<{ url?: string }>("/api/me/avatar", formData);
      if (res.error) {
        Alert.alert(errTitle, getApiErrorMessage(res.error, pi("uploadFailed")));
      } else {
        const url = res.data?.url;
        if (url) {
          const patchRes = await api.patch<{ error?: unknown }>("/api/me/profile", { avatar_url: url });
          if (patchRes.error) {
            Alert.alert(errTitle, pi("photoUploadedProfileFailed"));
          }
          load();
        } else {
          Alert.alert(pi("uploadIssueTitle"), pi("photoNoUrl"));
          load();
        }
      }
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e, pi("uploadFailed")));
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
        Alert.alert(errTitle, getApiErrorMessage(res.error, pi("saveFailed")));
        return;
      }
      const aboutValue = about.trim() || null;
      const profileDataRes = await api.post<any>("/api/me/profile-data", { about: aboutValue });
      if (profileDataRes.error) {
        Alert.alert(errTitle, getApiErrorMessage(profileDataRes.error, pi("aboutMeUpdateFailed")));
      } else {
        Alert.alert(pi("profileSavedTitle"), pi("profileSavedBody"));
      }
      load();
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e, pi("saveFailed")));
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
          accessibilityLabel={pi("a11yForm")}
          accessibilityRole="none"
        >
          {/* Profile photo card */}
          <View style={[cardStyle, { alignItems: "center", paddingVertical: 24 }]}>
            <Pressable
              onPress={uploadAvatar}
              disabled={pickLoading}
              accessibilityLabel={pi("a11yChangePhoto")}
              accessibilityRole="button"
              style={({ pressed }) => [{ alignItems: "center", opacity: pickLoading ? 0.6 : pressed ? 0.85 : 1 }]}
            >
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
              <Text style={{ fontSize: 14, color: Colors.primary, marginTop: 12, fontWeight: "500" }}>{pi("tapToChangePhoto")}</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>{pi("photoRequiredNote")}</Text>
            </Pressable>
          </View>

          {/* Basic info card */}
          <View style={cardStyle}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900], marginBottom: 16 }}>{pi("basicInfoSection")}</Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>{pi("fullNameLabel")}</Text>
              <TextInput
                style={[inputStyle, { backgroundColor: Colors.white }]}
                value={fullName}
                onChangeText={setFullName}
                placeholder={pi("namePlaceholder")}
                placeholderTextColor={Colors.gray[400]}
                accessibilityLabel={pi("fullNameLabel")}
                accessibilityRole="none"
              />
            </View>
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{pi("emailLabel")}</Text>
                <TouchableOpacity onPress={() => { setNewEmail(""); setShowEmailModal(true); }} accessibilityLabel={pi("a11yChangeEmail")} accessibilityRole="button">
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>{pi("changeEmailCta")}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ borderRadius: RADIUS_INPUT, backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, color: Colors.gray[600] }}>{profile.email || "-"}</Text>
              </View>
              {emailChangePending && (
                <View style={{ backgroundColor: "#FEF3C7", padding: 12, borderRadius: RADIUS_INPUT, marginTop: 8 }}>
                  <Text style={{ fontSize: 13, color: "#92400E" }}>{pi("emailChangePendingBanner")}</Text>
                </View>
              )}
            </View>
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{pi("phoneLabel")}</Text>
                <TouchableOpacity onPress={() => { setPhoneStep("enter_phone"); setPhoneModalNational(""); setPhoneOtpCode(""); setPendingPhoneE164(""); setShowPhoneModal(true); }} accessibilityLabel={pi("a11yChangePhone")} accessibilityRole="button">
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>{pi("changePhoneCta")}</Text>
                </TouchableOpacity>
              </View>
              <PhoneInputWithCountry
                label=""
                countryCode={phoneCountryCode}
                onCountryCodeChange={setPhoneCountryCode}
                nationalValue={phoneNational}
                onNationalChange={setPhoneNational}
                placeholder={pi("phonePlaceholder")}
                accessibilityLabel={pi("phonePlaceholder")}
              />
            </View>
          </View>

          {/* About card */}
          <View style={cardStyle}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>{pi("aboutMeLabel")}</Text>
            <TextInput
              style={[inputStyle, { minHeight: 96, textAlignVertical: "top" }, { backgroundColor: Colors.white }]}
              value={about}
              onChangeText={setAbout}
              placeholder={pi("bioPlaceholder")}
              placeholderTextColor={Colors.gray[400]}
              multiline
              numberOfLines={3}
              accessibilityLabel={pi("aboutMeLabel")}
              accessibilityRole="none"
            />
          </View>

          {/* Emergency contact card */}
          <View style={cardStyle}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900], marginBottom: 4 }}>{pi("emergencyContactSection")}</Text>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 16 }}>{pi("emergencyContactSubtitle")}</Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>{pi("emergencyNameLabel")}</Text>
              <TextInput
                style={[inputStyle, { backgroundColor: Colors.white }]}
                value={emergencyName}
                onChangeText={setEmergencyName}
                placeholder={pi("emergencyNamePlaceholder")}
                placeholderTextColor={Colors.gray[400]}
              />
            </View>
            <View style={{ marginBottom: 16 }}>
              <PhoneInputWithCountry
                label={pi("emergencyPhoneLabel")}
                countryCode={emergencyCountryCode}
                onCountryCodeChange={setEmergencyCountryCode}
                nationalValue={emergencyPhoneNational}
                onNationalChange={setEmergencyPhoneNational}
                placeholder={pi("emergencyPhonePlaceholder")}
                accessibilityLabel={pi("emergencyPhonePlaceholder")}
              />
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>{pi("relationshipLabel")}</Text>
              <TextInput
                style={[inputStyle, { backgroundColor: Colors.white }]}
                value={emergencyRelationship}
                onChangeText={setEmergencyRelationship}
                placeholder={pi("emergencyRelationPlaceholder")}
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
            accessibilityLabel={saving ? pi("a11ySaving") : pi("a11ySave")}
            accessibilityRole="button"
          >
            <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>{saving ? pi("saving") : pi("saveChanges")}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Change email modal */}
      <Modal visible={showEmailModal} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }} onPress={() => setShowEmailModal(false)}>
          <Pressable style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 24 }} onPress={(e) => e.stopPropagation()}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{pi("changeEmailModalTitle")}</Text>
              <TouchableOpacity onPress={() => setShowEmailModal(false)} hitSlop={12} accessibilityLabel={t("common.close")}>
                <Ionicons name="close" size={24} color={Colors.gray[500]} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12 }}>{pi("changeEmailModalBody")}</Text>
            <TextInput
              style={{ borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: Colors.gray[900], marginBottom: 16 }}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder={pi("newEmailPlaceholder")}
              placeholderTextColor={Colors.gray[400]}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={{ flexDirection: "row", marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowEmailModal(false)} style={{ flex: 1, marginRight: 12, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center", borderWidth: 1, borderColor: Colors.gray[300] }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleChangeEmail} disabled={emailSending} style={{ flex: 1, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center" }}>
                {emailSending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontWeight: "600", color: Colors.white }}>{pi("sendVerificationEmail")}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Change phone modal */}
      <Modal visible={showPhoneModal} transparent animationType="fade">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }} behavior="padding">
          <Pressable style={{ flex: 1 }} onPress={() => setShowPhoneModal(false)}>
            <Pressable style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 24 }} onPress={(e) => e.stopPropagation()}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{pi("changePhoneModalTitle")}</Text>
                <TouchableOpacity onPress={() => { setShowPhoneModal(false); setPhoneStep(null); }} hitSlop={12} accessibilityLabel={t("common.close")}>
                  <Ionicons name="close" size={24} color={Colors.gray[500]} />
                </TouchableOpacity>
              </View>
              {phoneStep === "enter_phone" ? (
                <>
                  <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12 }}>
                    {pi("phoneSmsIntro", {
                      digits: String(SUPABASE_AUTH_OTP_LENGTH),
                      minutes: String(PHONE_RESEND_COOLDOWN_SECS),
                      minuteUnit: ls("minutePlural"),
                    })}
                  </Text>
                  <PhoneInputWithCountry
                    countryCode={phoneModalCountryCode}
                    onCountryCodeChange={setPhoneModalCountryCode}
                    nationalValue={phoneModalNational}
                    onNationalChange={setPhoneModalNational}
                    placeholder={pi("newPhonePlaceholder")}
                    accessibilityLabel={pi("newPhonePlaceholder")}
                  />
                  <View style={{ flexDirection: "row", marginTop: 16 }}>
                    <TouchableOpacity onPress={() => setShowPhoneModal(false)} style={{ flex: 1, marginRight: 12, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center", borderWidth: 1, borderColor: Colors.gray[300] }}>
                      <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>{t("common.cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSendPhoneOtp} disabled={phoneSending} style={{ flex: 1, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center" }}>
                      {phoneSending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontWeight: "600", color: Colors.white }}>{pi("sendCode")}</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  {/* §UX-audit 2026-05: inline confirmation replaces blocking Alert */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      backgroundColor: "#ECFDF5",
                      borderColor: "#A7F3D0",
                      borderWidth: 1,
                      borderRadius: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      marginBottom: 12,
                    }}
                    accessibilityRole="alert"
                  >
                    <Ionicons name="checkmark-circle" size={16} color="#059669" />
                    <Text style={{ flex: 1, color: "#065F46", fontSize: 13 }}>
                      Code sent to{" "}
                      {pendingPhoneE164.replace(/(\+\d{2,3})(\d{3})(\d+)(\d{4})/, "$1 $2 *** $4")}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 10 }}>
                    {ls("enterOtp", { digits: String(SUPABASE_AUTH_OTP_LENGTH) })}
                  </Text>
                  <View style={{ marginBottom: 12 }}>
                    <OtpDigitRow
                      value={phoneOtpCode}
                      onChange={setPhoneOtpCode}
                      onComplete={(code) => {
                        if (!phoneVerifying && isCompleteSupabaseSmsOtp(code)) void handleVerifyPhoneOtp(code);
                      }}
                      disabled={phoneVerifying}
                      autoFocus
                      accessibilityLabelPrefix={pi("otpA11yPrefix")}
                    />
                  </View>
                  {/* Resend row */}
                  <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 16 }}>
                    <TouchableOpacity
                      onPress={() => void handleResendPhoneOtp()}
                      disabled={phoneSending || phoneResendCooldown > 0}
                      accessibilityRole="button"
                      accessibilityLabel={
                        phoneResendCooldown > 0
                          ? `Resend in ${phoneResendCooldown} seconds`
                          : "Resend verification code"
                      }
                    >
                      {phoneSending ? (
                        <ActivityIndicator size="small" color={Colors.gray[400]} />
                      ) : (
                        <Text style={{ fontSize: 13, fontWeight: "600", color: phoneResendCooldown > 0 ? Colors.gray[400] : Colors.primary }}>
                          {phoneResendCooldown > 0 ? `Resend in ${phoneResendCooldown}s` : "Resend code"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: "row" }}>
                    <TouchableOpacity onPress={() => { setPhoneStep("enter_phone"); setPhoneOtpCode(""); setPendingPhoneE164(""); setPhoneResendCooldown(0); }} style={{ flex: 1, marginRight: 12, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center", borderWidth: 1, borderColor: Colors.gray[300] }}>
                      <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>{t("common.back")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => void handleVerifyPhoneOtp()} disabled={phoneVerifying || !isCompleteSupabaseSmsOtp(phoneOtpCode)} style={{ flex: 1, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: RADIUS_BUTTON, alignItems: "center" }}>
                      {phoneVerifying ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontWeight: "600", color: Colors.white }}>{pi("verifyAndSave")}</Text>}
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
