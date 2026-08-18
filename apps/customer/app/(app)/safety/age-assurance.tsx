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
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { SCREEN_PADDING } from "@/constants/layout";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useSafetySettings } from "@/hooks/useSafetySettings";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { TrustScreenShell } from "@/components/safety/TrustScreenShell";
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
  const aa = useCallback(
    (key: string, opts?: Record<string, string | number>) =>
      t(`customer.mobile.screens.ageAssurance.${key}`, opts ?? {}) as string,
    [t],
  );
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
  const monthLabel = LEGAL_DOB_MONTHS.find((m) => m.value === month)?.label ?? aa("month");
  const maxDay = year != null && month != null ? daysInMonth(year, month) : 31;
  const dayOptions = Array.from({ length: maxDay }, (_, i) => i + 1);
  const draftIso = composeLegalDobIso({ day, month, year });
  const dobError =
    day != null && month != null && year != null
      ? validateLegalDobParts({ day, month, year }, { minAge: 13 })
      : aa("selectAllParts");

  const saveDob = useCallback(async () => {
    if (!draftIso || dobError) {
      Alert.alert(aa("dobInvalidTitle"), dobError || aa("selectAllParts"));
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch("/api/me/profile", { date_of_birth: draftIso });
      if (res.error) throw new Error(res.error.message || aa("saveFailedTitle"));
      setDateOfBirth(draftIso);
      await refresh();
      Alert.alert(aa("savedTitle"), aa("savedBody"));
    } catch (e) {
      Alert.alert(
        aa("saveFailedTitle"),
        e instanceof Error ? e.message : t("common.tryAgain", { defaultValue: "Try again." }),
      );
    } finally {
      setSaving(false);
    }
  }, [aa, dobError, draftIso, refresh, t]);

  const currentBandLabel = t(`customer.mobile.screens.safetyHub.ageBand.${age_band}`, {
    defaultValue: age_band,
  });
  const missingDob = !dateOfBirth.trim();

  const ageSourceLabel =
    age_source === "verified_dob"
      ? aa("sourceVerified")
      : age_source === "declared_dob"
        ? aa("sourceDeclared")
        : aa("sourceNone");

  if (loadingProfile) {
    return (
      <ScreenFrame loading={false}>
        <TrustScreenShell title={aa("title")} breadcrumbSegment={aa("breadcrumb")} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 200 }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame>
      <TrustScreenShell title={aa("title")} breadcrumbSegment={aa("breadcrumb")} />
      <ScrollView
        style={{ flex: 1, marginHorizontal: -SCREEN_PADDING }}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 15, color: Colors.gray[600], lineHeight: 22, marginBottom: 20 }}>{aa("intro")}</Text>

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
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: Colors.primary,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {aa("yourAgeBand")}
          </Text>
          <Text style={{ fontSize: 17, fontWeight: "700", color: Colors.gray[900], marginTop: 4 }}>
            {currentBandLabel}
          </Text>
          <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 4 }}>
            {aa("sourceLabel", { source: ageSourceLabel })}
          </Text>
          {dateOfBirth ? (
            <Text style={{ fontSize: 13, color: Colors.gray[700], marginTop: 4, fontWeight: "600" }}>
              {aa("dobOnFile", { date: formatLegalDobDisplay(dateOfBirth) })}
            </Text>
          ) : (
            <Text style={{ fontSize: 13, color: Colors.primary, marginTop: 4, fontWeight: "600" }}>
              {aa("addDobHint")}
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
            {missingDob ? aa("formTitleAdd") : aa("formTitleUpdate")}
          </Text>
          <Text style={{ fontSize: 13, color: Colors.gray[500], lineHeight: 19, marginBottom: 12 }}>{aa("formHint")}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => {
                setShowDay(true);
                setShowMonth(false);
                setShowYear(false);
              }}
              style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, padding: 12 }}
              accessibilityRole="button"
              accessibilityLabel={aa("selectDayA11y")}
            >
              <Text style={{ color: day != null ? Colors.gray[900] : Colors.gray[400] }}>{day ?? aa("day")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowMonth(true);
                setShowDay(false);
                setShowYear(false);
              }}
              style={{ flex: 1.4, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, padding: 12 }}
              accessibilityRole="button"
              accessibilityLabel={aa("selectMonthA11y")}
            >
              <Text style={{ color: month != null ? Colors.gray[900] : Colors.gray[400] }}>{monthLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowYear(true);
                setShowDay(false);
                setShowMonth(false);
              }}
              style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, padding: 12 }}
              accessibilityRole="button"
              accessibilityLabel={aa("selectYearA11y")}
            >
              <Text style={{ color: year != null ? Colors.gray[900] : Colors.gray[400] }}>{year ?? aa("year")}</Text>
            </TouchableOpacity>
          </View>
          {showDay ? (
            <ScrollView style={{ marginTop: 8, maxHeight: 160 }} nestedScrollEnabled>
              {dayOptions.map((d) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => {
                    setDay(d);
                    setShowDay(false);
                  }}
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
                  onPress={() => {
                    setMonth(m.value);
                    setShowMonth(false);
                  }}
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
                  onPress={() => {
                    setYear(y);
                    setShowYear(false);
                  }}
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
            accessibilityLabel={aa("saveA11y")}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                {missingDob ? aa("saveAdd") : aa("saveUpdate")}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <BandCard icon="close-circle-outline" accent="#DC2626" title={aa("bandUnder13Title")} body={aa("bandUnder13Body")} />
        <BandCard icon="people-outline" accent="#2563EB" title={aa("bandTeenTitle")} body={aa("bandTeenBody")} />
        <BandCard icon="shield-checkmark-outline" accent="#059669" title={aa("bandAdultTitle")} body={aa("bandAdultBody")} />

        <Text style={{ fontSize: 13, color: Colors.gray[500], lineHeight: 19, marginTop: 8 }}>{aa("kycPrecedence")}</Text>

        <TouchableOpacity
          onPress={() => void Linking.openURL(AGE_SUITABILITY_URL)}
          style={{ marginTop: 24, alignSelf: "flex-start" }}
          accessibilityRole="link"
          accessibilityLabel={aa("learnMoreA11y")}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary, textDecorationLine: "underline" }}>
            {aa("learnMore")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenFrame>
  );
}
