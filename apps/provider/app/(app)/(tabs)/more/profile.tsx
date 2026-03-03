/**
 * My Profile – personal information, address, plan, contact support.
 * Mirrors the web provider portal profile at /provider/account/profile.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

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
      setProfile({
        email: data.email ?? "",
        phone: data.phone ?? "",
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Saved", "Your profile has been updated.");
        load();
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [profile, load]);

  if (loading && !profile) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Profile" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF0077" />
          <Text className="mt-3 text-gray-500">Loading profile…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (error && !profile) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Profile" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-gray-600">{error}</Text>
          <TouchableOpacity onPress={load} className="mt-4 rounded-xl bg-gray-900 px-6 py-3">
            <Text className="font-medium text-white">Retry</Text>
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
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-2 pt-4">
          {/* Profile Picture */}
          <View className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
            <Text className="mb-3 text-sm font-semibold text-gray-900">Profile Picture</Text>
            <View className="flex-row items-center gap-4">
              <Pressable onPress={uploadAvatar} disabled={uploading}>
                {profile.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={{ width: 96, height: 96, borderRadius: 48 }}
                    contentFit="cover"
                  />
                ) : (
                  <View className="h-24 w-24 items-center justify-center rounded-full bg-[#FF0077]/10">
                    <Text className="text-2xl font-medium text-[#FF0077]">{getInitials()}</Text>
                  </View>
                )}
              </Pressable>
              <View className="flex-1">
                <TouchableOpacity
                  onPress={uploadAvatar}
                  disabled={uploading}
                  className="rounded-xl border border-gray-200 bg-white py-2.5 px-4"
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color="#FF0077" />
                  ) : (
                    <Text className="font-medium text-gray-900">Upload Photo</Text>
                  )}
                </TouchableOpacity>
                <Text className="mt-1.5 text-xs text-gray-500">JPG, PNG or GIF. Max size 2MB</Text>
              </View>
            </View>
          </View>

          {/* Personal Information */}
          <View className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
            <Text className="mb-3 text-sm font-semibold text-gray-900">Personal Information</Text>
            <View className="gap-3">
              <View>
                <Text className="mb-1 text-xs font-medium text-gray-500">Email</Text>
                <TextInput
                  value={profile.email}
                  onChangeText={(email) => setProfile((p) => (p ? { ...p, email } : p))}
                  placeholder="Email"
                  placeholderTextColor="#9ca3af"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <View>
                <Text className="mb-1 text-xs font-medium text-gray-500">Phone</Text>
                <TextInput
                  value={profile.phone}
                  onChangeText={(phone) => setProfile((p) => (p ? { ...p, phone } : p))}
                  placeholder="Phone"
                  placeholderTextColor="#9ca3af"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </View>

          {/* Address */}
          <View className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
            <Text className="mb-3 text-sm font-semibold text-gray-900">Address</Text>
            <View className="gap-3">
              <View>
                <Text className="mb-1 text-xs font-medium text-gray-500">Address</Text>
                <TextInput
                  value={profile.address?.line1 ?? ""}
                  onChangeText={(line1) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, line1 } } : p
                    )
                  }
                  placeholder="Street address"
                  placeholderTextColor="#9ca3af"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                />
              </View>
              <View>
                <Text className="mb-1 text-xs font-medium text-gray-500">Country</Text>
                <TextInput
                  value={profile.address?.country ?? ""}
                  onChangeText={(country) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, country } } : p
                    )
                  }
                  placeholder="Country"
                  placeholderTextColor="#9ca3af"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                />
              </View>
              <View>
                <Text className="mb-1 text-xs font-medium text-gray-500">State/Province</Text>
                <TextInput
                  value={profile.address?.state ?? ""}
                  onChangeText={(state) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, state } } : p
                    )
                  }
                  placeholder="State / Province"
                  placeholderTextColor="#9ca3af"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                />
              </View>
              <View>
                <Text className="mb-1 text-xs font-medium text-gray-500">City</Text>
                <TextInput
                  value={profile.address?.city ?? ""}
                  onChangeText={(city) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, city } } : p
                    )
                  }
                  placeholder="City"
                  placeholderTextColor="#9ca3af"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                />
              </View>
              <View>
                <Text className="mb-1 text-xs font-medium text-gray-500">Zip/Postal Code</Text>
                <TextInput
                  value={profile.address?.postal_code ?? ""}
                  onChangeText={(postal_code) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, postal_code } } : p
                    )
                  }
                  placeholder="Zip / Postal code"
                  placeholderTextColor="#9ca3af"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>

          {/* Plan */}
          <View className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
            <Text className="mb-3 text-sm font-semibold text-gray-900">Plan</Text>
            <View>
              <Text className="mb-1 text-xs font-medium text-gray-500">Current Plan</Text>
              <View className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <Text className="text-base text-gray-700">{plan}</Text>
              </View>
              <Text className="mt-2 text-xs text-gray-500">Contact support to change your plan.</Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/(app)/(tabs)/more/contact-support" as never);
                }}
                className="mt-2"
              >
                <Text className="text-sm font-medium text-[#FF0077]">Contact Support</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={save}
            disabled={saving}
            className="rounded-xl bg-gray-900 py-3.5 items-center"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="font-semibold text-white">Save changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
