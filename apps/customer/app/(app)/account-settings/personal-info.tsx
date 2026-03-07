import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
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
  const [phone, setPhone] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/profile");
      if (res.error) {
        setError(getApiErrorMessage(res.error, "Failed to load"));
        setProfile(null);
      } else {
        const p = res.data;
        setProfile(p);
        setFullName(p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "");
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
          if (!patchRes.error) load();
        } else {
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
      const payload: Record<string, unknown> = {
        first_name: first,
        last_name: last,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        emergency_contact: {
          name: emergencyName.trim() || null,
          phone: emergencyPhone.trim() || null,
          relationship: emergencyRelationship.trim() || null,
        },
      };
      const res = await api.patch<any>("/api/me/profile", payload);
      if (res.error) {
        Alert.alert("Error", getApiErrorMessage(res.error, "Failed to save"));
      } else {
        Alert.alert("Saved", "Your profile has been updated.");
        load();
      }
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      {profile && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" accessibilityLabel="Personal info form" accessibilityRole="none">
        <View>
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <Pressable onPress={uploadAvatar} disabled={pickLoading} accessibilityLabel="Change profile photo" accessibilityRole="button">
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
              accessibilityLabel="Full name"
              accessibilityRole="none"
            />
          </View>
          <View>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Email</Text>
            <Text style={{ paddingVertical: 12, color: Colors.gray[600] }}>{profile.email || "-"}</Text>
          </View>
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Phone</Text>
            <TextInput
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              value={phone}
              onChangeText={setPhone}
              placeholder="Your phone number"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="phone-pad"
              accessibilityLabel="Phone number"
              accessibilityRole="none"
            />
          </View>
          <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderColor: Colors.gray[100] }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900], marginBottom: 4 }}>Emergency contact</Text>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>Optional – used in case of emergency</Text>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Name</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={emergencyName}
                onChangeText={setEmergencyName}
                placeholder="Contact name"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Phone</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={emergencyPhone}
                onChangeText={setEmergencyPhone}
                placeholder="Their phone number"
                placeholderTextColor={Colors.gray[400]}
                keyboardType="phone-pad"
              />
            </View>
            <View style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Relationship</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
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
            style={{ backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 16 }}
            accessibilityLabel={saving ? "Saving profile" : "Save profile"}
            accessibilityRole="button"
          >
            <Text style={{ color: Colors.white, fontWeight: "600" }}>{saving ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      )}
    </ScreenFrame>
  );
}
