import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useSafetySettings } from "@/hooks/useSafetySettings";
import { api } from "@/lib/api-client";
import {
  LEGAL_DOB_MONTHS,
  composeLegalDobIso,
  daysInMonth,
  formatLegalDobDisplay,
  legalDobYearRange,
  parseLegalDobIso,
  validateLegalDobParts,
} from "@beautonomi/utils";

const AGE_SUITABILITY_URL = "https://www.beautonomi.com/age-suitability";

function BandCard({
  title,
  body,
  icon,
  accent,
}: {
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
}) {
  return (
    <View
      style={{
        backgroundColor: Colors.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.gray[100],
        padding: 16,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: `${accent}18`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={20} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "600", fontSize: 16, color: Colors.gray[900], marginBottom: 4 }}>
            {title}
          </Text>
          <Text style={{ fontSize: 14, color: Colors.gray[600], lineHeight: 20 }}>{body}</Text>
        </View>
      </View>
    </View>
  );
}

export default function AgeAssuranceScreen() {
  useScreenTracking("Age assurance");
  const { t } = useTranslation();
  const { age_band, age_source, refresh } = useSafetySettings();
  const [dateOfBirth, setDateOfBirth] = useState<string>("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);

  const parts = parseLegalDobIso(dateOfBirth || null);
  const [day, setDay] = useState<number | null>(parts.day);
  const [month, setMonth] = useState<number | null>(parts.month);
  const [year, setYear] = useState<number | null>(parts.year);
  const [showDay, setShowDay] = useState(false);
  const [showMonth, setShowMonth] = useState(false);
  const [showYear, setShowYear] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const res = await api.get<{ date_of_birth?: string | null }>("/api/me/profile");
      const iso = typeof res.data?.date_of_birth === "string" ? res.data.date_of_birth : "";
      setDateOfBirth(iso);
      const parsed = parseLegalDobIso(iso || null);
      setDay(parsed.day);
      setMonth(parsed.month);
      setYear(parsed.year);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const years = useMemo(() => legalDobYearRange({ minAge: 13, maxAge: 100 }), []);
  const monthLabel = LEGAL_DOB_MONTHS.find((m) => m.value === month)?.label ?? "Month";
  const maxDay = year != null && month != null ? daysInMonth(year, month) : 31;
  const dayOptions = Array.from({ length: maxDay }, (_, i) => i + 1);
  const draftIso = composeLegalDobIso({ day, month, year });
  const dobError =
    day != null && month != null && year != null
      ? validateLegalDobParts({ day, month, year }, { minAge: 13 })
      : "Select day, month, and year";

  const saveDob = useCallback(async () => {
    if (!draftIso || dobError) {
      Alert.alert("Date of birth", dobError || "Enter a valid date of birth.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch("/api/me/profile", { date_of_birth: draftIso });
      if (res.error) throw new Error(res.error.message || "Could not save date of birth.");
      setDateOfBirth(draftIso);
      await refresh();
      Alert.alert("Saved", "Your date of birth is saved for age assurance.");
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }, [dobError, draftIso, refresh]);

  const currentBandLabel = t(`customer.mobile.screens.safetyHub.ageBand.${age_band}`, {
    defaultValue: age_band,
  });
  const missingDob = !dateOfBirth.trim();

  return (
    <>
      <Stack.Screen
        options={{
          title: "Age assurance",
          headerBackTitle: t("common.back"),
          headerShown: true,
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.gray[50] }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        <Text style={{ fontSize: 15, color: Colors.gray[600], lineHeight: 22, marginBottom: 20 }}>
          Beautonomi uses your date of birth to apply age-appropriate features, parental controls, and
          verification requirements. Your current age band is shown below.
        </Text>

        <View
          style={{
            backgroundColor: Colors.primaryLight,
            borderRadius: 12,
            padding: 14,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: "#FECDD3",
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.primary, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Your age band
          </Text>
          <Text style={{ fontSize: 17, fontWeight: "700", color: Colors.gray[900], marginTop: 4 }}>
            {currentBandLabel}
          </Text>
          <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 4 }}>
            Source: {age_source === "verified_dob" ? "Verified identity" : age_source === "declared_dob" ? "Date of birth on file" : "Not yet declared"}
          </Text>
          {dateOfBirth ? (
            <Text style={{ fontSize: 13, color: Colors.gray[700], marginTop: 4, fontWeight: "600" }}>
              Date of birth: {formatLegalDobDisplay(dateOfBirth)}
            </Text>
          ) : (
            <Text style={{ fontSize: 13, color: Colors.primary, marginTop: 4, fontWeight: "600" }}>
              Add your date of birth below. Calendar and bookings stay available.
            </Text>
          )}
        </View>

        <View
          style={{
            backgroundColor: Colors.white,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: Colors.gray[100],
            padding: 16,
            marginBottom: 20,
          }}
        >
          <Text style={{ fontWeight: "700", fontSize: 16, color: Colors.gray[900], marginBottom: 6 }}>
            {missingDob ? "Add your date of birth" : "Update date of birth"}
          </Text>
          <Text style={{ fontSize: 13, color: Colors.gray[500], lineHeight: 19, marginBottom: 12 }}>
            You must be at least 13 to use Beautonomi. Identity verification and payouts require 18+.
          </Text>
          {loadingProfile ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setShowDay(true); setShowMonth(false); setShowYear(false); }}
                  style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, padding: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Select day of birth"
                >
                  <Text style={{ color: day != null ? Colors.gray[900] : Colors.gray[400] }}>{day ?? "Day"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowMonth(true); setShowDay(false); setShowYear(false); }}
                  style={{ flex: 1.4, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, padding: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Select month of birth"
                >
                  <Text style={{ color: month != null ? Colors.gray[900] : Colors.gray[400] }}>{monthLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowYear(true); setShowDay(false); setShowMonth(false); }}
                  style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, padding: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Select year of birth"
                >
                  <Text style={{ color: year != null ? Colors.gray[900] : Colors.gray[400] }}>{year ?? "Year"}</Text>
                </TouchableOpacity>
              </View>
              {showDay ? (
                <ScrollView style={{ marginTop: 8, maxHeight: 160 }} nestedScrollEnabled>
                  {dayOptions.map((d) => (
                    <TouchableOpacity
                      key={d}
                      onPress={() => { setDay(d); setShowDay(false); }}
                      style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray[50] }}
                    >
                      <Text>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
              {showMonth ? (
                <ScrollView style={{ marginTop: 8, maxHeight: 200 }} nestedScrollEnabled>
                  {LEGAL_DOB_MONTHS.map((m) => (
                    <TouchableOpacity
                      key={m.value}
                      onPress={() => { setMonth(m.value); setShowMonth(false); }}
                      style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray[50] }}
                    >
                      <Text>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
              {showYear ? (
                <ScrollView style={{ marginTop: 8, maxHeight: 200 }} nestedScrollEnabled>
                  {years.map((y) => (
                    <TouchableOpacity
                      key={y}
                      onPress={() => { setYear(y); setShowYear(false); }}
                      style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray[50] }}
                    >
                      <Text>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
              {dobError && day != null && month != null && year != null ? (
                <Text style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{dobError}</Text>
              ) : null}
              <TouchableOpacity
                onPress={() => void saveDob()}
                disabled={saving}
                style={{
                  marginTop: 14,
                  backgroundColor: Colors.primary,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: saving ? 0.7 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Save date of birth"
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                    {missingDob ? "Save date of birth" : "Update date of birth"}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        <BandCard
          icon="close-circle-outline"
          accent="#DC2626"
          title="Under 13"
          body="Accounts for users under 13 are not permitted. Social features and account creation are blocked."
        />
        <BandCard
          icon="people-outline"
          accent="#2563EB"
          title="Ages 13–17"
          body="You can use the Partner app with parental controls enabled by default. Some social features may be restricted, and a parent or guardian can adjust content & safety settings."
        />
        <BandCard
          icon="shield-checkmark-outline"
          accent="#059669"
          title="18 and over"
          body="Full access to partner tools. Identity verification (KYC) and payouts require you to be at least 18 with a valid government ID."
        />

        <Text style={{ fontSize: 13, color: Colors.gray[500], lineHeight: 19, marginTop: 8 }}>
          Verified identity (KYC) date of birth takes precedence over the date you entered at signup when
          determining your age band for payouts and compliance.
        </Text>

        <TouchableOpacity
          onPress={() => void Linking.openURL(AGE_SUITABILITY_URL)}
          style={{ marginTop: 24, alignSelf: "flex-start" }}
          accessibilityRole="link"
          accessibilityLabel="Learn more about age suitability on beautonomi.com"
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary, textDecorationLine: "underline" }}>
            Learn more about age suitability
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}
