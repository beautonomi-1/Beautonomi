import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { useTheme } from "@/providers/ThemeProvider";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UserProfile {
  preferred_language: string | null;
  preferred_currency: string | null;
  timezone: string | null;
}

interface PickerOption {
  value: string;
  label: string;
}

type PreferenceField = "preferred_language" | "preferred_currency" | "timezone";

/* ------------------------------------------------------------------ */
/*  Option lists                                                       */
/* ------------------------------------------------------------------ */

const LANGUAGE_OPTIONS: PickerOption[] = [
  { value: "en", label: "English" },
  { value: "af", label: "Afrikaans" },
  { value: "zu", label: "Zulu" },
  { value: "xh", label: "Xhosa" },
  { value: "st", label: "Sotho" },
];

const CURRENCY_OPTIONS: PickerOption[] = [
  { value: "ZAR", label: "ZAR – South African Rand" },
  { value: "USD", label: "USD – US Dollar" },
  { value: "GBP", label: "GBP – British Pound" },
  { value: "EUR", label: "EUR – Euro" },
  { value: "KES", label: "KES – Kenyan Shilling" },
  { value: "NGN", label: "NGN – Nigerian Naira" },
  { value: "GHS", label: "GHS – Ghanaian Cedi" },
  { value: "EGP", label: "EGP – Egyptian Pound" },
];

const TIMEZONE_OPTIONS: PickerOption[] = [
  { value: "Africa/Johannesburg", label: "Africa/Johannesburg (SAST)" },
  { value: "Africa/Nairobi", label: "Africa/Nairobi (EAT)" },
  { value: "Africa/Lagos", label: "Africa/Lagos (WAT)" },
  { value: "Africa/Accra", label: "Africa/Accra (GMT)" },
  { value: "Africa/Cairo", label: "Africa/Cairo (EET)" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "America/New_York (EST)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
];

const FIELD_CONFIG: {
  field: PreferenceField;
  label: string;
  options: PickerOption[];
  defaultValue: string;
  modalTitle: string;
}[] = [
  {
    field: "preferred_language",
    label: "Language",
    options: LANGUAGE_OPTIONS,
    defaultValue: "en",
    modalTitle: "Select language",
  },
  {
    field: "preferred_currency",
    label: "Currency",
    options: CURRENCY_OPTIONS,
    defaultValue: "ZAR",
    modalTitle: "Select currency",
  },
  {
    field: "timezone",
    label: "Timezone",
    options: TIMEZONE_OPTIONS,
    defaultValue: "Africa/Johannesburg",
    modalTitle: "Select timezone",
  },
];

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function displayLabel(
  options: PickerOption[],
  value: string | null,
  fallback: string,
): string {
  if (!value) return fallback;
  return options.find((o) => o.value === value)?.label ?? value;
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

function AppearanceSection() {
  const { themeMode, setThemeMode } = useTheme();
  const modes = [
    { key: "light" as const, label: "Light", icon: "sunny-outline" as const },
    { key: "dark" as const, label: "Dark", icon: "moon-outline" as const },
    { key: "system" as const, label: "System", icon: "phone-portrait-outline" as const },
  ];

  return (
    <View>
      <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>Appearance</Text>
      <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 12 }}>Choose your preferred theme</Text>
      <View>
        {modes.map((m, index) => (
          <TouchableOpacity
            key={m.key}
            onPress={() => setThemeMode(m.key)}
            style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.gray[100], flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 0 : 8 }}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: themeMode === m.key }}
          >
            <Ionicons name={m.icon} size={20} color={themeMode === m.key ? Colors.primary : Colors.gray[400]} />
            <Text style={{ marginLeft: 12, flex: 1, fontWeight: "500", color: Colors.gray[900] }}>{m.label}</Text>
            {themeMode === m.key && (
              <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function PreferencesScreen() {
  const [profile, setProfile] = useState<UserProfile>({
    preferred_language: null,
    preferred_currency: null,
    timezone: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [pickerField, setPickerField] = useState<PreferenceField | null>(null);
  const pickerConfig = FIELD_CONFIG.find((c) => c.field === pickerField) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UserProfile>("/api/me/profile");
      if (res.error) {
        setError(res.error.message || "Failed to load preferences");
      } else if (res.data) {
        setProfile({
          preferred_language: res.data.preferred_language ?? null,
          preferred_currency: res.data.preferred_currency ?? null,
          timezone: res.data.timezone ?? null,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<UserProfile>("/api/me/profile");
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message || "Failed to load preferences");
        } else if (res.data) {
          setProfile({
            preferred_language: res.data.preferred_language ?? null,
            preferred_currency: res.data.preferred_currency ?? null,
            timezone: res.data.timezone ?? null,
          });
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load preferences");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectOption = useCallback(
    async (field: PreferenceField, value: string) => {
      const previous = { ...profile };
      const next = { ...profile, [field]: value };
      setProfile(next);
      setPickerField(null);
      setSaving(true);

      try {
        const res = await api.patch<UserProfile>("/api/me/profile", {
          [field]: value,
        });
        if (res.error) {
          setProfile(previous);
          Alert.alert("Error", res.error.message || "Failed to save preference");
        }
      } catch {
        setProfile(previous);
        Alert.alert("Error", "Failed to save preference. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [profile],
  );

  return (
    <>
      <ScreenFrame loading={loading} error={error} onRetry={load}>
        <View>
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>App Preferences</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
              Customise your language, currency, and timezone
            </Text>
          </View>

          <View style={{ marginTop: 24 }}>
            {FIELD_CONFIG.map((config, index) => (
              <TouchableOpacity
                key={config.field}
                onPress={() => setPickerField(config.field)}
                disabled={saving}
                style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.gray[100], marginTop: index === 0 ? 0 : 12 }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 4 }}>{config.label}</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                    {displayLabel(
                      config.options,
                      profile[config.field],
                      config.options.find((o) => o.value === config.defaultValue)?.label ??
                        config.defaultValue,
                    )}
                  </Text>
                  <Text style={{ color: Colors.gray[400], fontSize: 18 }}>›</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {saving && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, marginTop: 24 }}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={{ fontSize: 14, color: Colors.gray[500], marginLeft: 8 }}>Saving...</Text>
            </View>
          )}

          <View style={{ marginTop: 24 }}>
            <AppearanceSection />
          </View>
        </View>
      </ScreenFrame>

      <Modal
        visible={pickerField !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerField(null)}
      >
        <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setPickerField(null)}>
          <Pressable style={{ backgroundColor: Colors.white, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "60%" }} onPress={(e) => e.stopPropagation()}>
            <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[200] }}>
              <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900] }}>
                {pickerConfig?.modalTitle ?? "Select"}
              </Text>
            </View>
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {pickerConfig?.options.map((option) => {
                const isSelected = pickerField !== null && profile[pickerField] === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
                    onPress={() => {
                      if (pickerField) selectOption(pickerField, option.value);
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: isSelected ? "600" : "400", color: isSelected ? Colors.primary : Colors.gray[900] }}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
