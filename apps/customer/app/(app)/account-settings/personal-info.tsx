import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, Pressable } from "react-native";
import { Image } from "expo-image";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useImagePicker } from "@/hooks/useImagePicker";

export default function PersonalInfoScreen() {
  useScreenTracking("Personal Info");
  const { pickWithOptions, loading: pickLoading } = useImagePicker();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/profile");
      if (res.error) {
        setError(res.error.message || "Failed to load");
        setProfile(null);
      } else {
        const p = res.data;
        setProfile(p);
        setFullName(p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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
        Alert.alert("Error", res.error.message || "Upload failed");
      } else {
        const url = (res.data as any)?.url;
        if (url) {
          const patchRes = await api.patch<any>("/api/me/profile", { avatar_url: url });
          if (!patchRes.error) load();
        } else {
          load();
        }
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Upload failed");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const parts = fullName.trim().split(/\s+/);
      const first = parts[0] || "";
      const last = parts.slice(1).join(" ") || "";
      const res = await api.patch<any>("/api/me/profile", {
        first_name: first,
        last_name: last,
        full_name: fullName.trim(),
      });
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to save");
      } else {
        Alert.alert("Saved", "Your profile has been updated.");
        load();
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      {profile && (
        <View className="gap-4">
          <View className="items-center mb-4">
            <Pressable onPress={uploadAvatar} disabled={pickLoading}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={{ width: 96, height: 96, borderRadius: 48 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
              ) : (
                <View className="w-24 h-24 rounded-full bg-gray-200 items-center justify-center">
                  <Text className="text-3xl text-gray-500">
                    {(profile.full_name || profile.email || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </Pressable>
            <Text className="text-sm text-primary mt-2">Tap to change photo</Text>
          </View>
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Full name</Text>
            <TextInput
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your name"
            />
          </View>
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Email</Text>
            <Text className="py-3 text-gray-600">{profile.email || "-"}</Text>
          </View>
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Phone</Text>
            <Text className="py-3 text-gray-600">{profile.phone || "-"}</Text>
          </View>
          <TouchableOpacity
            onPress={save}
            disabled={saving}
            className="bg-primary py-3 rounded-xl items-center mt-4"
          >
            <Text className="text-white font-semibold">{saving ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScreenFrame>
  );
}
