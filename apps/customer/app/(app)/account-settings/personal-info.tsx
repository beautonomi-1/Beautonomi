import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, Pressable } from "react-native";
import { Image } from "expo-image";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useImagePicker } from "@/hooks/useImagePicker";
import { Colors } from "@/constants/colors";

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
        <View>
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <Pressable onPress={uploadAvatar} disabled={pickLoading}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={{ width: 96, height: 96, borderRadius: 48 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
              ) : (
                <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.gray[200], alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 30, color: Colors.gray[500] }}>
                    {(profile.full_name || profile.email || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </Pressable>
            <Text style={{ fontSize: 14, color: Colors.primary, marginTop: 8 }}>Tap to change photo</Text>
          </View>
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Full name</Text>
            <TextInput
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your name"
              placeholderTextColor={Colors.gray[400]}
            />
          </View>
          <View>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Email</Text>
            <Text style={{ paddingVertical: 12, color: Colors.gray[600] }}>{profile.email || "-"}</Text>
          </View>
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Phone</Text>
            <Text style={{ paddingVertical: 12, color: Colors.gray[600] }}>{profile.phone || "-"}</Text>
          </View>
          <TouchableOpacity
            onPress={save}
            disabled={saving}
            style={{ backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 16 }}
          >
            <Text style={{ color: Colors.white, fontWeight: "600" }}>{saving ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScreenFrame>
  );
}
