/**
 * Profile details: profile questions (3+), interests, beauty preferences.
 * Uses GET/POST /api/me/profile-data and GET/PATCH /api/me/beauty-preferences.
 * Linked from profile completion checklist (profile_questions, interests, beauty_preferences).
 */
import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { ChipCombobox } from "@/components/ui/ChipCombobox";

const PROFILE_QUESTION_FIELDS = [
  { key: "school", label: "School / education" },
  { key: "work", label: "Work / profession" },
  { key: "location", label: "Where you're based" },
  { key: "decade_born", label: "Decade you were born" },
  { key: "favorite_song", label: "Favourite song" },
  { key: "obsessed_with", label: "Something you're obsessed with" },
  { key: "fun_fact", label: "Fun fact about you" },
  { key: "useless_skill", label: "Useless skill you have" },
  { key: "biography_title", label: "Your biography title" },
  { key: "spend_time", label: "How you like to spend time" },
  { key: "pets", label: "Pets" },
] as const;

const DECADE_BORN_OPTIONS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "Prefer not to say"];
const HAIR_TYPE_OPTIONS = ["Straight", "Wavy", "Curly", "Coily", "Coloured", "Natural", "Relaxed", "Thin", "Thick"];
const SKIN_TYPE_OPTIONS = ["Normal", "Oily", "Dry", "Combination", "Sensitive", "Mature"];
const THINGS_TO_AVOID_OPTIONS = ["Strong fragrances", "Alcohol-based products", "Sulfates", "Parabens", "Essential oils", "Latex", "Nickel", "Dyes", "Formaldehyde"];
const APPOINTMENT_STYLE_OPTIONS = ["Quick & efficient", "Relaxed & unhurried", "Social & chatty", "Quiet & minimal", "Flexible"];
const PRODUCT_PREFERENCE_OPTIONS = ["Vegan", "Cruelty-free", "Natural / organic", "Fragrance-free", "Hypoallergenic", "Luxury", "Budget-friendly", "No preference"];

export default function ProfileDetailsScreen() {
  useScreenTracking("Profile Details");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [, setBeautyPrefs] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const [profileQuestions, setProfileQuestions] = useState<Record<string, string>>({});
  const [interests, setInterests] = useState<string[]>([]);
  const [hairType, setHairType] = useState("");
  const [skinType, setSkinType] = useState("");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [thingsToAvoid, setThingsToAvoid] = useState("");
  const [appointmentStyle, setAppointmentStyle] = useState("");
  const [productPreferences, setProductPreferences] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, beautyRes] = await Promise.all([
        api.get<Record<string, unknown> | null>("/api/me/profile-data"),
        api.get<Record<string, unknown>>("/api/me/beauty-preferences"),
      ]);
      if (profileRes.error) {
        setError(getApiErrorMessage(profileRes.error, "Failed to load"));
        return;
      }
      const pd = profileRes.data;
      setProfileData(pd ?? null);
      const q: Record<string, string> = {};
      PROFILE_QUESTION_FIELDS.forEach(({ key }) => {
        const v = pd?.[key];
        q[key] = v != null && v !== "" ? String(v).trim() : "";
      });
      setProfileQuestions(q);
      const ints = pd?.interests;
      setInterests(Array.isArray(ints) ? (ints as string[]) : []);

      const bp = beautyRes.data ?? {};
      setBeautyPrefs(bp);
      setHairType((bp.hair_type as string) ?? "");
      setSkinType((bp.skin_type as string) ?? "");
      const allergyList = bp.allergies;
      setAllergies(Array.isArray(allergyList) ? (allergyList as string[]) : []);
      const rawAvoid = bp.things_to_avoid;
      setThingsToAvoid(Array.isArray(rawAvoid) ? (rawAvoid as string[]).join(", ") : (rawAvoid as string) ?? "");
      setAppointmentStyle((bp.appointment_style as string) ?? "");
      const rawProduct = bp.product_preferences;
      setProductPreferences(Array.isArray(rawProduct) ? (rawProduct as string[]).join(", ") : (rawProduct as string) ?? "");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    try {
      const profilePayload: Record<string, unknown> = {};
      PROFILE_QUESTION_FIELDS.forEach(({ key }) => {
        const v = profileQuestions[key] ?? "";
        if (String(v).trim().length > 0) profilePayload[key] = String(v).trim();
      });
      if (interests.length > 0) profilePayload.interests = interests;

      const [profileRes, beautyRes] = await Promise.all([
        api.post("/api/me/profile-data", profilePayload),
        api.patch("/api/me/beauty-preferences", {
          hair_type: hairType.trim() || undefined,
          skin_type: skinType.trim() || undefined,
          allergies: allergies.length ? allergies : undefined,
          things_to_avoid: thingsToAvoid.trim() || undefined,
          appointment_style: appointmentStyle.trim() || undefined,
          product_preferences: productPreferences.trim() || undefined,
        }),
      ]);
      const profileErr = profileRes.error;
      const beautyErr = beautyRes.error;
      if (profileErr || beautyErr) {
        Alert.alert(
          "Error",
          [profileErr && "Profile data: " + (profileErr.message ?? "failed"), beautyErr && "Beauty preferences: " + (beautyErr.message ?? "failed")]
            .filter(Boolean)
            .join("\n")
        );
      } else {
        setProfileData((profileRes.data ?? null) as Record<string, unknown> | null);
        setBeautyPrefs((beautyRes.data ?? {}) as Record<string, unknown>);
        Alert.alert("Saved", "All profile details updated.");
      }
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }, [profileQuestions, interests, hairType, skinType, allergies, thingsToAvoid, appointmentStyle, productPreferences]);

  const answeredCount = Object.values(profileQuestions).filter((v) => v.trim().length > 0).length;

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile questions (3+ for completion) */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900] }}>Profile questions</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>
              Answer at least 3 to complete your profile. ({answeredCount}/3 done)
            </Text>
            {PROFILE_QUESTION_FIELDS.map(({ key, label }) => (
              <View key={key} style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{label}</Text>
                {key === "decade_born" ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {DECADE_BORN_OPTIONS.map((opt) => {
                      const selected = (profileQuestions[key] ?? "").trim() === opt;
                      return (
                        <TouchableOpacity
                          key={opt}
                          onPress={() => setProfileQuestions((prev) => ({ ...prev, [key]: opt }))}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            borderRadius: 12,
                            borderWidth: 1.5,
                            borderColor: selected ? Colors.primary : Colors.gray[200],
                            backgroundColor: selected ? Colors.primaryLight : Colors.white,
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: "500", color: selected ? Colors.primary : Colors.gray[700] }}>{opt}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <TextInput
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: Colors.gray[200],
                      backgroundColor: Colors.white,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      fontSize: 15,
                      color: Colors.gray[900],
                    }}
                    value={profileQuestions[key] ?? ""}
                    onChangeText={(t) => setProfileQuestions((prev) => ({ ...prev, [key]: t }))}
                    placeholder="..."
                    placeholderTextColor={Colors.gray[400]}
                  />
                )}
              </View>
            ))}
          </View>

          {/* Interests */}
          <View style={{ marginBottom: 24, paddingTop: 16, borderTopWidth: 1, borderColor: Colors.gray[100] }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Ionicons name="heart-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900] }}>Interests</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 8 }}>
              Add things you&apos;re into (select or type)
            </Text>
            <ChipCombobox
              value={interests}
              onChange={setInterests}
              staticSuggestions={[
                "Hair", "Nails", "Skincare", "Makeup", "Pedicure", "Manicure", "Facial", "Massage", "Hair colour", "Braids", "Waxing", "Lashes", "Brows", "Travel", "Photography", "Cooking",
              ].map((i) => ({ value: i, label: i }))}
              allowFreeForm
              placeholder="e.g. Hair, Nails, Skincare..."
              accessibilityLabel="Your interests"
            />
          </View>

          {/* Beauty preferences */}
          <View style={{ marginBottom: 24, paddingTop: 16, borderTopWidth: 1, borderColor: Colors.gray[100] }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Ionicons name="sparkles-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900] }}>Beauty preferences</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>
              Help providers personalise your experience
            </Text>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Hair type</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {HAIR_TYPE_OPTIONS.map((opt) => {
                  const selected = hairType.trim() === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setHairType(opt)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: selected ? Colors.primary : Colors.gray[200],
                        backgroundColor: selected ? Colors.primaryLight : Colors.white,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "500", color: selected ? Colors.primary : Colors.gray[700] }}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Skin type</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {SKIN_TYPE_OPTIONS.map((opt) => {
                  const selected = skinType.trim() === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setSkinType(opt)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: selected ? Colors.primary : Colors.gray[200],
                        backgroundColor: selected ? Colors.primaryLight : Colors.white,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "500", color: selected ? Colors.primary : Colors.gray[700] }}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Things to avoid</Text>
              <ChipCombobox
                value={thingsToAvoid.trim() ? thingsToAvoid.split(/,\s*/).map((s) => s.trim()).filter(Boolean) : []}
                onChange={(arr) => setThingsToAvoid(arr.join(", "))}
                staticSuggestions={THINGS_TO_AVOID_OPTIONS.map((o) => ({ value: o, label: o }))}
                allowFreeForm
                placeholder="Select or type (e.g. fragrances, sulfates)"
                accessibilityLabel="Things to avoid"
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Appointment style</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {APPOINTMENT_STYLE_OPTIONS.map((opt) => {
                  const selected = appointmentStyle.trim() === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setAppointmentStyle(opt)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: selected ? Colors.primary : Colors.gray[200],
                        backgroundColor: selected ? Colors.primaryLight : Colors.white,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "500", color: selected ? Colors.primary : Colors.gray[700] }}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Product preferences</Text>
              <ChipCombobox
                value={productPreferences.trim() ? productPreferences.split(/,\s*/).map((s) => s.trim()).filter(Boolean) : []}
                onChange={(arr) => setProductPreferences(arr.join(", "))}
                staticSuggestions={PRODUCT_PREFERENCE_OPTIONS.map((o) => ({ value: o, label: o }))}
                allowFreeForm
                placeholder="Select or type (e.g. Vegan, Cruelty-free)"
                accessibilityLabel="Product preferences"
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Allergies & sensitivities</Text>
              <ChipCombobox
                value={allergies}
                onChange={setAllergies}
                staticSuggestions={[
                  "Fragrance", "Parabens", "Sulfates", "Alcohol", "Dyes", "Formaldehyde", "Latex", "Nickel",
                ].map((a) => ({ value: a, label: a }))}
                allowFreeForm
                placeholder="e.g. Nickel, Latex..."
                accessibilityLabel="Allergies and sensitivities"
              />
            </View>
          </View>

          <TouchableOpacity
            onPress={handleSaveAll}
            disabled={saving}
            style={{
              backgroundColor: Colors.primary,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              marginTop: 8,
            }}
            accessibilityLabel="Save all profile details"
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>Save all</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenFrame>
  );
}
