/**
 * My Profile – personal information, address, plan, contact support.
 * Mirrors the web provider portal profile at /provider/account/profile.
 * Email/phone changes require Supabase verification (email link, phone OTP).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Pressable,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { normalizeFullPhoneToE164 } from "@/lib/phone";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";

const IMAGE_CONSTRAINTS = { maxSizeBytes: 2 * 1024 * 1024 }; // 2MB

interface ProfileData {
  email: string;
  phone: string;
  avatar_url: string | null;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
  } | null;
  plan?: string;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [plan, setPlan] = useState<string>("Free");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneStep, setPhoneStep] = useState<"enter" | "otp" | null>(null);
  const [pendingPhoneE164, setPendingPhoneE164] = useState("");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const initialProfileRef = useRef<{ email: string; phone: string }>({ email: "", phone: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, subscriptionRes] = await Promise.all([
        api.get<{ data: any }>("/api/me/profile"),
        api.get<{ data: any }>("/api/provider/subscription").catch(() => ({ data: null })),
      ]);
      if (profileRes.error || !profileRes.data) {
        setError((profileRes as any).error?.message || "Failed to load profile");
        setProfile(null);
        return;
      }
      const data = (profileRes as any).data ?? profileRes.data;
      let planName = "Free";
      if (subscriptionRes?.data) {
        const sub = (subscriptionRes as any).data?.data ?? (subscriptionRes as any).data;
        if (sub?.plan?.name) planName = sub.plan.name;
        else if (sub?.plan_name) planName = sub.plan_name;
      }
      setPlan(planName);
      const loadedEmail = data.email ?? "";
      const loadedPhone = data.phone ?? "";
      initialProfileRef.current = { email: loadedEmail, phone: loadedPhone };
      setProfile({
        email: loadedEmail,
        phone: loadedPhone,
        avatar_url: data.avatar_url ?? null,
        address: data.address
          ? {
              line1: data.address.line1 ?? data.address.street ?? "",
              line2: data.address.line2 ?? data.address.apt ?? "",
              city: data.address.city ?? "",
              state: data.address.state ?? "",
              postal_code: data.address.postal_code ?? data.address.zip ?? "",
              country: data.address.country ?? "",
            }
          : { line1: "", city: "", state: "", postal_code: "", country: "" },
        plan: planName,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uploadAvatar = useCallback(async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission needed", "Allow access to your photos to change your profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > IMAGE_CONSTRAINTS.maxSizeBytes) {
      Alert.alert("File too large", "Please choose an image under 2MB.");
      return;
    }
    setUploading(true);
    try {
      const uri = asset.uri;
      const name = uri.split("/").pop() || "photo.jpg";
      const formData = new FormData();
      formData.append("file", { uri, name, type: "image/jpeg" } as any);
      const res = await api.fetch<{ url?: string }>("/api/me/avatar", {
        method: "POST",
        body: formData as any,
      });
      const url = res.data?.url ?? (res as any).data?.url;
      if (res.error || !url) {
        Alert.alert("Upload failed", (res as any).error?.message || "Could not upload photo.");
        return;
      }
      const patchRes = await api.patch<{ data: any }>("/api/me/profile", { avatar_url: url });
      if (!patchRes.error) await load();
      else Alert.alert("Error", (patchRes as any).error?.message || "Failed to update profile.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, [load]);

  const save = useCallback(async () => {
    if (!profile) return;
    const phoneChanged =
      profile.phone !== undefined &&
      profile.phone.trim() !== "" &&
      profile.phone.trim() !== initialProfileRef.current.phone?.trim();

    if (phoneChanged) {
      const e164 =
        normalizeFullPhoneToE164(profile.phone) ??
        (profile.phone.trim()
          ? normalizeFullPhoneToE164("+27" + profile.phone.replace(/\D/g, ""))
          : undefined);
      if (!e164 || !e164.startsWith("+")) {
        Alert.alert("Invalid phone", "Enter a valid number with country code (e.g. +27 82 345 6789).");
        return;
      }
      setSendingOtp(true);
      try {
        const { error: updateError } = await supabase.auth.updateUser({ phone: e164 });
        if (updateError) throw updateError;
        setPendingPhoneE164(e164);
        setPhoneOtpCode("");
        setPhoneStep("otp");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Code sent", "We sent a verification code to your phone. Enter it below.");
      } catch (e: unknown) {
        Alert.alert("Error", e instanceof Error ? e.message : "Failed to send code.");
      } finally {
        setSendingOtp(false);
      }
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        email: profile.email,
        phone: profile.phone,
        address: profile.address
          ? {
              line1: profile.address.line1,
              line2: profile.address.line2,
              city: profile.address.city,
              state: profile.address.state,
              postal_code: profile.address.postal_code,
              country: profile.address.country,
            }
          : undefined,
      };
      const res = await api.patch<{ data: any }>("/api/me/profile", payload);
      if (res.error) {
        Alert.alert("Error", (res as any).error?.message || "Failed to save.");
      } else {
        const data = (res as any).data ?? res.data;
        if (data?.email_change_pending) {
          Alert.alert(
            "Confirm your email",
            "Check your new email and click the confirmation link to complete the change."
          );
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Saved", "Your profile has been updated.");
        }
        if (data?.email) initialProfileRef.current.email = data.email;
        if (data?.phone) initialProfileRef.current.phone = data.phone;
        load();
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [profile, load]);

  const verifyPhoneOtp = useCallback(async () => {
    if (!phoneOtpCode.trim() || !pendingPhoneE164) return;
    setSaving(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: pendingPhoneE164,
        token: phoneOtpCode.trim(),
        type: "phone_change",
      });
      if (verifyError) throw verifyError;
      const res = await api.patch<{ data: any }>("/api/me/profile", { phone: pendingPhoneE164 });
      if (res.error) throw new Error((res as any).error?.message || "Failed to save phone");
      initialProfileRef.current.phone = pendingPhoneE164;
      setPhoneStep(null);
      setPendingPhoneE164("");
      setPhoneOtpCode("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Your phone number has been updated.");
      load();
    } catch (e: unknown) {
      Alert.alert("Verification failed", e instanceof Error ? e.message : "Invalid code.");
    } finally {
      setSaving(false);
    }
  }, [phoneOtpCode, pendingPhoneE164, load]);

  if (loading && !profile) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Profile" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center")}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={twStyle("mt-3 text-gray-500")}>Loading profile…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (error && !profile) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Profile" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center px-6")}>
          <Text style={twStyle("text-center text-gray-600")}>{error}</Text>
          <TouchableOpacity onPress={load} style={twStyle("mt-4 rounded-xl bg-gray-900 px-6 py-3")}>
            <Text style={twStyle("font-medium text-white")}>Retry</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  if (!profile) return null;

  const getInitials = () => {
    const e = (profile.email || "").trim();
    if (e) return e.slice(0, 2).toUpperCase();
    return "?";
  };

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Profile" subtitle="Manage your personal information" onBack={() => router.back()} />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={twStyle("px-2 pt-4")}>
          {/* Profile Picture */}
          <View style={twStyle("mb-6 rounded-2xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-3 text-sm font-semibold text-gray-900")}>Profile Picture</Text>
            <View style={twStyle("flex-row items-center")}>
              <Pressable onPress={uploadAvatar} disabled={uploading} style={{ marginRight: 16 }}>
                {profile.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={{ width: 96, height: 96, borderRadius: 48 }}
                    contentFit="cover"
                  />
                ) : (
                  <View style={twStyle("h-24 w-24 items-center justify-center rounded-full bg-primary/10")}>
                    <Text style={twStyle("text-2xl font-medium text-primary")}>{getInitials()}</Text>
                  </View>
                )}
              </Pressable>
              <View style={twStyle("flex-1")}>
                <TouchableOpacity
                  onPress={uploadAvatar}
                  disabled={uploading}
                  style={twStyle("rounded-xl border border-gray-200 bg-white py-2.5 px-4")}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={twStyle("font-medium text-gray-900")}>Upload Photo</Text>
                  )}
                </TouchableOpacity>
                <Text style={twStyle("mt-1.5 text-xs text-gray-500")}>JPG, PNG or GIF. Max size 2MB</Text>
              </View>
            </View>
          </View>

          {/* Personal Information */}
          <View style={twStyle("mb-6 rounded-2xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-3 text-sm font-semibold text-gray-900")}>Personal Information</Text>
            <View>
              <View>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Email</Text>
                <TextInput
                  value={profile.email}
                  onChangeText={(email) => setProfile((p) => (p ? { ...p, email } : p))}
                  placeholder="Email"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                  Changing your email will require confirmation via a link sent to the new address.
                </Text>
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Phone</Text>
                <TextInput
                  value={profile.phone}
                  onChangeText={(phone) => setProfile((p) => (p ? { ...p, phone } : p))}
                  placeholder="e.g. +27 82 345 6789"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  keyboardType="phone-pad"
                />
                <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                  Include country code. Changing your number will require a verification code.
                </Text>
              </View>
            </View>
          </View>

          {/* Address */}
          <View style={twStyle("mb-6 rounded-2xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-3 text-sm font-semibold text-gray-900")}>Address</Text>
            <View>
              <View>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Address</Text>
                <TextInput
                  value={profile.address?.line1 ?? ""}
                  onChangeText={(line1) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, line1 } } : p
                    )
                  }
                  placeholder="Street address"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Country</Text>
                <TextInput
                  value={profile.address?.country ?? ""}
                  onChangeText={(country) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, country } } : p
                    )
                  }
                  placeholder="Country"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
              </View>
              <View>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>State/Province</Text>
                <TextInput
                  value={profile.address?.state ?? ""}
                  onChangeText={(state) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, state } } : p
                    )
                  }
                  placeholder="State / Province"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
              </View>
              <View>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>City</Text>
                <TextInput
                  value={profile.address?.city ?? ""}
                  onChangeText={(city) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, city } } : p
                    )
                  }
                  placeholder="City"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
              </View>
              <View>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Zip/Postal Code</Text>
                <TextInput
                  value={profile.address?.postal_code ?? ""}
                  onChangeText={(postal_code) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, postal_code } } : p
                    )
                  }
                  placeholder="Zip / Postal code"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>

          {/* Plan */}
          <View style={twStyle("mb-6 rounded-2xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-3 text-sm font-semibold text-gray-900")}>Plan</Text>
            <View>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Current Plan</Text>
              <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 px-4 py-3")}>
                <Text style={twStyle("text-base text-gray-700")}>{plan}</Text>
              </View>
              <Text style={twStyle("mt-2 text-xs text-gray-500")}>Contact support to change your plan.</Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/(app)/(tabs)/more/contact-support" as never);
                }}
                style={twStyle("mt-2")}
              >
                <Text style={twStyle("text-sm font-medium text-primary")}>Contact Support</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={save}
            disabled={saving || sendingOtp}
            style={twStyle("rounded-xl bg-gray-900 py-3.5 items-center")}
          >
            {saving || sendingOtp ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={twStyle("font-semibold text-white")}>Save changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Phone verification OTP modal */}
      <Modal
        visible={phoneStep === "otp"}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPhoneStep(null)}
      >
        <View style={twStyle("flex-1 bg-white p-6 pt-12")}>
          <Text style={twStyle("text-lg font-semibold text-gray-900")}>Verify phone number</Text>
          <Text style={twStyle("mt-2 text-sm text-gray-600")}>
            We sent a 6-digit code to {pendingPhoneE164}. Enter it below.
          </Text>
          <TextInput
            value={phoneOtpCode}
            onChangeText={(t) => setPhoneOtpCode(t.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            maxLength={6}
            style={twStyle("mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-lg tracking-widest text-gray-900")}
          />
          <TouchableOpacity
            onPress={verifyPhoneOtp}
            disabled={phoneOtpCode.length < 4 || saving}
            style={twStyle("mt-6 rounded-xl bg-gray-900 py-3.5 items-center")}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={twStyle("font-semibold text-white")}>Verify and save</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setPhoneStep(null);
              setPendingPhoneE164("");
              setPhoneOtpCode("");
            }}
            style={twStyle("mt-4")}
          >
            <Text style={twStyle("text-sm font-medium text-primary")}>Wrong number? Go back</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
