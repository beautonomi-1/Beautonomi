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

const DECADE_BORN_OPTIONS = [
  { value: "1950s", labelKey: "decade1950s" },
  { value: "1960s", labelKey: "decade1960s" },
  { value: "1970s", labelKey: "decade1970s" },
  { value: "1980s", labelKey: "decade1980s" },
  { value: "1990s", labelKey: "decade1990s" },
  { value: "2000s", labelKey: "decade2000s" },
  { value: "2010s", labelKey: "decade2010s" },
  { value: "Prefer not to say", labelKey: "decadePreferNot" },
] as const;
const HAIR_TYPE_OPTIONS = [
  { value: "Straight", labelKey: "hairStraight" },
  { value: "Wavy", labelKey: "hairWavy" },
  { value: "Curly", labelKey: "hairCurly" },
  { value: "Coily", labelKey: "hairCoily" },
  { value: "Coloured", labelKey: "hairColoured" },
  { value: "Natural", labelKey: "hairNatural" },
  { value: "Relaxed", labelKey: "hairRelaxed" },
  { value: "Thin", labelKey: "hairThin" },
  { value: "Thick", labelKey: "hairThick" },
] as const;
const SKIN_TYPE_OPTIONS = [
  { value: "Normal", labelKey: "skinNormal" },
  { value: "Oily", labelKey: "skinOily" },
  { value: "Dry", labelKey: "skinDry" },
  { value: "Combination", labelKey: "skinCombination" },
  { value: "Sensitive", labelKey: "skinSensitive" },
  { value: "Mature", labelKey: "skinMature" },
] as const;
const THINGS_TO_AVOID_OPTIONS = [
  { value: "Strong fragrances", labelKey: "avoidStrongFragrances" },
  { value: "Alcohol-based products", labelKey: "avoidAlcohol" },
  { value: "Sulfates", labelKey: "avoidSulfates" },
  { value: "Parabens", labelKey: "avoidParabens" },
  { value: "Essential oils", labelKey: "avoidEssentialOils" },
  { value: "Latex", labelKey: "avoidLatex" },
  { value: "Nickel", labelKey: "avoidNickel" },
  { value: "Dyes", labelKey: "avoidDyes" },
  { value: "Formaldehyde", labelKey: "avoidFormaldehyde" },
] as const;
const APPOINTMENT_STYLE_OPTIONS = [
  { value: "Quick & efficient", labelKey: "styleQuickEfficient" },
  { value: "Relaxed & unhurried", labelKey: "styleRelaxed" },
  { value: "Social & chatty", labelKey: "styleSocial" },
  { value: "Quiet & minimal", labelKey: "styleQuiet" },
  { value: "Flexible", labelKey: "styleFlexible" },
] as const;
const PRODUCT_PREFERENCE_OPTIONS = [
  { value: "Vegan", labelKey: "prefVegan" },
  { value: "Cruelty-free", labelKey: "prefCrueltyFree" },
  { value: "Natural / organic", labelKey: "prefNaturalOrganic" },
  { value: "Fragrance-free", labelKey: "prefFragranceFree" },
  { value: "Hypoallergenic", labelKey: "prefHypoallergenic" },
  { value: "Luxury", labelKey: "prefLuxury" },
  { value: "Budget-friendly", labelKey: "prefBudgetFriendly" },
  { value: "No preference", labelKey: "prefNoPreference" },
] as const;
const INTEREST_SUGGESTIONS = [
  "interestHair", "interestNails", "interestSkincare", "interestMakeup", "interestPedicure", "interestManicure",
  "interestFacial", "interestMassage", "interestHairColour", "interestBraids", "interestWaxing", "interestLashes",
  "interestBrows", "interestTravel", "interestPhotography", "interestCooking",
] as const;
const ALLERGY_SUGGESTIONS = [
  "allergyFragrance", "allergyParabens", "allergySulfates", "allergyAlcohol", "allergyDyes",
  "allergyFormaldehyde", "allergyLatex", "allergyNickel",
] as const;

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
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: Math.max(220, 40) }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile questions (3+ for completion) */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.primary} style={{ marginEnd: 8 }} />
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
                      const selected = (profileQuestions[key] ?? "").trim() === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => setProfileQuestions((prev) => ({ ...prev, [key]: opt.value }))}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            borderRadius: 12,
                            borderWidth: 1.5,
                            borderColor: selected ? Colors.primary : Colors.gray[200],
                            backgroundColor: selected ? Colors.primaryLight : Colors.white,
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: "500", color: selected ? Colors.primary : Colors.gray[700] }}>{pd(opt.labelKey)}</Text>
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
              <Ionicons name="heart-outline" size={20} color={Colors.primary} style={{ marginEnd: 8 }} />
              <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[900] }}>{pd("interestsSection")}</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 8 }}>{pd("interestsSubtitle")}</Text>
            <ChipCombobox
              value={interests}
              onChange={setInterests}
              staticSuggestions={INTEREST_SUGGESTIONS.map((key) => {
                const label = pd(key);
                return { value: label, label };
              })}
              allowFreeForm
              placeholder={pd("interestsPlaceholder")}
              accessibilityLabel={pd("interestsA11y")}
            />
          </View>

          {/* Beauty preferences */}
          <View style={{ marginBottom: 24, paddingTop: 16, borderTopWidth: 1, borderColor: Colors.gray[100] }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Ionicons name="sparkles-outline" size={20} color={Colors.primary} style={{ marginEnd: 8 }} />
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
                  const selected = hairType.trim() === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setHairType(opt.value)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: selected ? Colors.primary : Colors.gray[200],
                        backgroundColor: selected ? Colors.primaryLight : Colors.white,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "500", color: selected ? Colors.primary : Colors.gray[700] }}>{pd(opt.labelKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{pd("skinType")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {SKIN_TYPE_OPTIONS.map((opt) => {
                  const selected = skinType.trim() === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setSkinType(opt.value)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: selected ? Colors.primary : Colors.gray[200],
                        backgroundColor: selected ? Colors.primaryLight : Colors.white,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "500", color: selected ? Colors.primary : Colors.gray[700] }}>{pd(opt.labelKey)}</Text>
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
                staticSuggestions={THINGS_TO_AVOID_OPTIONS.map((o) => ({ value: o.value, label: pd(o.labelKey) }))}
                allowFreeForm
                placeholder={pd("thingsToAvoidPlaceholder")}
                accessibilityLabel={pd("thingsToAvoidA11y")}
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{pd("appointmentStyle")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {APPOINTMENT_STYLE_OPTIONS.map((opt) => {
                  const selected = appointmentStyle.trim() === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setAppointmentStyle(opt.value)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: selected ? Colors.primary : Colors.gray[200],
                        backgroundColor: selected ? Colors.primaryLight : Colors.white,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "500", color: selected ? Colors.primary : Colors.gray[700] }}>{pd(opt.labelKey)}</Text>
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
                staticSuggestions={PRODUCT_PREFERENCE_OPTIONS.map((o) => ({ value: o.value, label: pd(o.labelKey) }))}
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
                staticSuggestions={ALLERGY_SUGGESTIONS.map((key) => {
                  const label = pd(key);
                  return { value: label, label };
                })}
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
