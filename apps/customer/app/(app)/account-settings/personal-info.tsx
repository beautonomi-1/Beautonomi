import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useImagePicker } from "@/hooks/useImagePicker";
import { Colors } from "@/constants/colors";
import { PhoneInputWithCountry } from "@/components/PhoneInputWithCountry";
import { parsePhoneToCountryAndNational, getNationalFromStored } from "@/constants/phone";

export default function PersonalInfoScreen() {
  useScreenTracking("Personal Info");
  const { pickWithOptions, loading: pickLoading } = useImagePicker();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+27");
  const [phoneNational, setPhoneNational] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyCountryCode, setEmergencyCountryCode] = useState("+27");
  const [emergencyPhoneNational, setEmergencyPhoneNational] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);

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
        setFullName(p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "");
        const main = parsePhoneToCountryAndNational(p?.phone);
        setPhoneCountryCode(main.countryCode);
        setPhoneNational(main.national);
        const ec = p?.emergency_contact;
        setEmergencyName(ec?.name ?? "");
        setEmergencyCountryCode(ec?.country_code || "+27");
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
            <PhoneInputWithCountry
              label="Phone"
              countryCode={phoneCountryCode}
              onCountryCodeChange={setPhoneCountryCode}
              nationalValue={phoneNational}
              onNationalChange={setPhoneNational}
              placeholder="Your phone number"
              accessibilityLabel="Your phone number"
            />
          </View>
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>About me</Text>
            <TextInput
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900], minHeight: 80, textAlignVertical: "top" }}
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
