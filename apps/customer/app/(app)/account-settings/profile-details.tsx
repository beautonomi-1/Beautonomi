/**
 * Profile details: profile questions (3+), interests, beauty preferences.
 * Uses GET/POST /api/me/profile-data and GET/PATCH /api/me/beauty-preferences.
 * Linked from profile completion checklist (profile_questions, interests, beauty_preferences).
 */
import { useState, useCallback } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { coerceProfileStringList } from "@beautonomi/utils";
import { ChipCombobox } from "@/components/ui/ChipCombobox";

const PROFILE_QUESTION_FIELDS = [
  { key: "school", labelKey: "qSchool" as const },
  { key: "work", labelKey: "qWork" as const },
  { key: "location", labelKey: "qLocation" as const },
  { key: "decade_born", labelKey: "qDecadeBorn" as const },
  { key: "favorite_song", labelKey: "qFavoriteSong" as const },
  { key: "obsessed_with", labelKey: "qObsessedWith" as const },
  { key: "fun_fact", labelKey: "qFunFact" as const },
  { key: "useless_skill", labelKey: "qUselessSkill" as const },
  { key: "biography_title", labelKey: "qBiographyTitle" as const },
  { key: "spend_time", labelKey: "qSpendTime" as const },
  { key: "pets", labelKey: "qPets" as const },
] as const;

const DECADE_BORN_OPTIONS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "Prefer not to say"];
const HAIR_TYPE_OPTIONS = ["Straight", "Wavy", "Curly", "Coily", "Coloured", "Natural", "Relaxed", "Thin", "Thick"];
const SKIN_TYPE_OPTIONS = ["Normal", "Oily", "Dry", "Combination", "Sensitive", "Mature"];
const THINGS_TO_AVOID_OPTIONS = ["Strong fragrances", "Alcohol-based products", "Sulfates", "Parabens", "Essential oils", "Latex", "Nickel", "Dyes", "Formaldehyde"];
const APPOINTMENT_STYLE_OPTIONS = ["Quick & efficient", "Relaxed & unhurried", "Social & chatty", "Quiet & minimal", "Flexible"];
const PRODUCT_PREFERENCE_OPTIONS = ["Vegan", "Cruelty-free", "Natural / organic", "Fragrance-free", "Hypoallergenic", "Luxury", "Budget-friendly", "No preference"];

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function thingsOrProductsToCommaField(raw: unknown): string {
  if (Array.isArray(raw)) return coerceProfileStringList(raw).join(", ");
  if (typeof raw === "string") return raw;
  return "";
}

export default function ProfileDetailsScreen() {
  useScreenTracking("Profile Details");
  const { t } = useTranslation();
  const pd = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.profileDetails.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [beautyPrefsWarning, setBeautyPrefsWarning] = useState<string | null>(null);
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
    setBeautyPrefsWarning(null);
    try {
      const [profileRes, beautyRes] = await Promise.all([
        api.get<Record<string, unknown> | null>("/api/me/profile-data"),
        api.get<Record<string, unknown>>("/api/me/beauty-preferences"),
      ]);
      if (profileRes.error) {
        setError(getApiErrorMessage(profileRes.error, pd("loadFailed")));
        return;
      }
      if (beautyRes.error) {
        setBeautyPrefsWarning(getApiErrorMessage(beautyRes.error, pd("beautyPrefsLoadFailed")));
      }
      const profileData = profileRes.data;
      setProfileData(profileData ?? null);
      const q: Record<string, string> = {};
      PROFILE_QUESTION_FIELDS.forEach(({ key }) => {
        const v = profileData?.[key];
        q[key] = v != null && v !== "" ? String(v).trim() : "";
      });
      setProfileQuestions(q);
      setInterests(coerceProfileStringList(profileData?.interests));

      const bp = beautyRes.error ? {} : ((beautyRes.data ?? {}) as Record<string, unknown>);
      setBeautyPrefs(bp);
      setHairType(stringField(bp.hair_type));
      setSkinType(stringField(bp.skin_type));
      setAllergies(coerceProfileStringList(bp.allergies));
      setThingsToAvoid(thingsOrProductsToCommaField(bp.things_to_avoid));
      setAppointmentStyle(stringField(bp.appointment_style));
      setProductPreferences(thingsOrProductsToCommaField(bp.product_preferences));
    } catch (e) {
      setError(getApiErrorMessage(e, pd("loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [pd]);

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
        const lines: string[] = [];
        if (profileErr) {
          lines.push(
            pd("saveErrorProfile", {
              message: profileErr.message ?? pd("saveFailedGeneric"),
            }),
          );
        }
        if (beautyErr) {
          lines.push(
            pd("saveErrorBeauty", {
              message: beautyErr.message ?? pd("saveFailedGeneric"),
            }),
          );
        }
        Alert.alert(errTitle, lines.join("\n"));
      } else {
        setProfileData((profileRes.data ?? null) as Record<string, unknown> | null);
        setBeautyPrefs((beautyRes.data ?? {}) as Record<string, unknown>);
        Alert.alert(pd("savedTitle"), pd("savedBody"));
      }
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e, pd("saveFailed")));
    } finally {
      setSaving(false);
    }
  }, [
    profileQuestions,
    interests,
    hairType,
    skinType,
    allergies,
    thingsToAvoid,
    appointmentStyle,
    productPreferences,
    errTitle,
    pd,
  ]);

  const answeredCount = Object.values(profileQuestions).filter((v) => v.trim().length > 0).length;

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load} scrollable={false}>
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
              <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900] }}>{pd("profileQuestionsSection")}</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>
              {pd("profileQuestionsHint", { answered: String(answeredCount) })}
            </Text>
            {PROFILE_QUESTION_FIELDS.map(({ key, labelKey }) => (
              <View key={key} style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{pd(labelKey)}</Text>
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
                    onChangeText={(text) => setProfileQuestions((prev) => ({ ...prev, [key]: text }))}
                    placeholder={pd("placeholderShort")}
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
              <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900] }}>{pd("interestsSection")}</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 8 }}>{pd("interestsSubtitle")}</Text>
            <ChipCombobox
              value={interests}
              onChange={setInterests}
              staticSuggestions={[
                "Hair", "Nails", "Skincare", "Makeup", "Pedicure", "Manicure", "Facial", "Massage", "Hair colour", "Braids", "Waxing", "Lashes", "Brows", "Travel", "Photography", "Cooking",
              ].map((i) => ({ value: i, label: i }))}
              allowFreeForm
              placeholder={pd("interestsPlaceholder")}
              accessibilityLabel={pd("interestsA11y")}
            />
          </View>

          {/* Beauty preferences */}
          <View style={{ marginBottom: 24, paddingTop: 16, borderTopWidth: 1, borderColor: Colors.gray[100] }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Ionicons name="sparkles-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900] }}>{pd("beautySection")}</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>{pd("beautySubtitle")}</Text>
            {beautyPrefsWarning ? (
              <View
                style={{
                  backgroundColor: "#FFFBEB",
                  borderWidth: 1,
                  borderColor: "#FDE68A",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 13, color: "#92400E" }}>{beautyPrefsWarning}</Text>
              </View>
            ) : null}
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{pd("hairType")}</Text>
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
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{pd("skinType")}</Text>
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
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{pd("thingsToAvoid")}</Text>
              <ChipCombobox
                value={thingsToAvoid.trim() ? thingsToAvoid.split(/,\s*/).map((s) => s.trim()).filter(Boolean) : []}
                onChange={(arr) => setThingsToAvoid(arr.join(", "))}
                staticSuggestions={THINGS_TO_AVOID_OPTIONS.map((o) => ({ value: o, label: o }))}
                allowFreeForm
                placeholder={pd("thingsToAvoidPlaceholder")}
                accessibilityLabel={pd("thingsToAvoidA11y")}
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{pd("appointmentStyle")}</Text>
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
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{pd("productPreferences")}</Text>
              <ChipCombobox
                value={productPreferences.trim() ? productPreferences.split(/,\s*/).map((s) => s.trim()).filter(Boolean) : []}
                onChange={(arr) => setProductPreferences(arr.join(", "))}
                staticSuggestions={PRODUCT_PREFERENCE_OPTIONS.map((o) => ({ value: o, label: o }))}
                allowFreeForm
                placeholder={pd("productPreferencesPlaceholder")}
                accessibilityLabel={pd("productPreferencesA11y")}
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{pd("allergies")}</Text>
              <ChipCombobox
                value={allergies}
                onChange={setAllergies}
                staticSuggestions={[
                  "Fragrance", "Parabens", "Sulfates", "Alcohol", "Dyes", "Formaldehyde", "Latex", "Nickel",
                ].map((a) => ({ value: a, label: a }))}
                allowFreeForm
                placeholder={pd("allergiesPlaceholder")}
                accessibilityLabel={pd("allergiesA11y")}
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
            accessibilityLabel={pd("saveAllA11y")}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>{pd("saveAll")}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenFrame>
  );
}
