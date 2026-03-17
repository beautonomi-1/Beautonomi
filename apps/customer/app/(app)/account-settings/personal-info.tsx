import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useImagePicker } from "@/hooks/useImagePicker";
import { Colors } from "@/constants/colors";
import { SCREEN_PADDING, RADIUS_CARD, RADIUS_INPUT, RADIUS_BUTTON, STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
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
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>Email</Text>
              <View style={{ borderRadius: RADIUS_INPUT, backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, color: Colors.gray[600] }}>{profile.email || "-"}</Text>
              </View>
            </View>
            <View>
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
    </ScreenFrame>
  );
}
