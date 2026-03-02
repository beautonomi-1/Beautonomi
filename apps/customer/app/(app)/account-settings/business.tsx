import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { api } from "@/lib/api-client";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { SCREEN_PADDING, STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BusinessSettings {
  business_email: string | null;
  is_enabled: boolean;
}

interface BusinessBenefit {
  title: string;
  description: string;
  icon: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "mail.com",
  "protonmail.com",
  "zoho.com",
  "yandex.com",
  "live.com",
];

const BUSINESS_BENEFITS: BusinessBenefit[] = [
  {
    title: "Streamlined business bookings",
    description:
      "Book beauty services for corporate events, client meetings, and professional engagements with ease.",
    icon: "📋",
  },
  {
    title: "Corporate packages & discounts",
    description:
      "Access exclusive corporate packages and volume discounts for company events.",
    icon: "💼",
  },
  {
    title: "Professional development",
    description:
      "Book training sessions and professional development workshops with certified beauty experts.",
    icon: "🎓",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBusinessEmail(email: string): boolean {
  if (!email.includes("@")) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return !FREE_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BenefitCard({ benefit }: { benefit: BusinessBenefit }) {
  return (
    <View className="bg-white rounded-xl p-5 border border-gray-100">
      <Text className="text-2xl mb-2">{benefit.icon}</Text>
      <Text className="text-base font-bold text-gray-900 mb-1">
        {benefit.title}
      </Text>
      <Text className="text-sm text-gray-600 leading-5">
        {benefit.description}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BusinessScreen() {
  useScreenTracking("Business Services");

  const [email, setEmail] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);

  const validEmail = isBusinessEmail(email);

  // ── Load current settings ──
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<BusinessSettings>("/api/me/business-settings");
      if (res.error) {
        setError(res.error.message || "Failed to load business settings");
      } else {
        const raw = res.data as Record<string, unknown> | null;
        const settings = (raw?.settings ?? raw) as BusinessSettings | null;
        if (settings) {
          setEmail(settings.business_email ?? "");
          setIsEnabled(settings.is_enabled ?? false);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load business settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<BusinessSettings>("/api/me/business-settings");
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message || "Failed to load business settings");
        } else {
          const raw = res.data as Record<string, unknown> | null;
          const settings = (raw?.settings ?? raw) as BusinessSettings | null;
          if (settings) {
            setEmail(settings.business_email ?? "");
            setIsEnabled(settings.is_enabled ?? false);
          }
        }
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Failed to load business settings"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Save settings ──
  const save = useCallback(
    async (newEmail: string, newEnabled: boolean) => {
      setSaving(true);
      try {
        const res = await api.patch<BusinessSettings>(
          "/api/me/business-settings",
          {
            business_email: newEmail,
            is_enabled: newEnabled,
          }
        );
        if (res.error) {
          Alert.alert(
            "Save failed",
            res.error.message || "Could not update business settings."
          );
        }
      } catch (e) {
        Alert.alert(
          "Save failed",
          e instanceof Error ? e.message : "Could not update business settings."
        );
      } finally {
        setSaving(false);
      }
    },
    []
  );

  // ── Toggle handler ──
  const handleToggle = useCallback(
    (value: boolean) => {
      if (value && !validEmail) return;
      setIsEnabled(value);
      save(email, value);
    },
    [email, validEmail, save]
  );

  // ── Email change + auto-save when toggling off ──
  const handleEmailBlur = useCallback(() => {
    setEmailTouched(true);
    if (isEnabled && validEmail) {
      save(email, isEnabled);
    }
  }, [email, isEnabled, validEmail, save]);

  // Loading state
  if (loading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text className="text-gray-600 mt-4">Loading…</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-center text-gray-700 mb-4">{error}</Text>
        <TouchableOpacity
          onPress={load}
          className="bg-primary px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const showEmailError = emailTouched && email.length > 0 && !validEmail;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-gray-50"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: SCREEN_PADDING,
          paddingBottom: STACK_CONTENT_PADDING_BOTTOM,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Active badge */}
        {isEnabled && (
          <View className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex-row items-center justify-center">
            <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
            <Text className="text-green-800 font-semibold text-sm">
              Business features active
            </Text>
          </View>
        )}

        {/* Main card */}
        <View className="bg-white rounded-xl p-6 border border-gray-100 mb-6">
          <Text className="text-2xl font-bold text-gray-900 mb-2">
            Beautonomi for Business
          </Text>
          <Text className="text-sm text-gray-600 mb-6 leading-5">
            Add your business email to access corporate packages, event booking
            tools, and professional development opportunities.
          </Text>

          {/* Email input */}
          <Text className="text-sm font-semibold text-gray-700 mb-2">
            Business email address
          </Text>
          <TextInput
            placeholder="business@company.com"
            placeholderTextColor={Colors.gray[400]}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (!emailTouched) setEmailTouched(false);
            }}
            onBlur={handleEmailBlur}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            className={`border rounded-lg px-4 py-3 text-base text-gray-900 mb-1 ${
              showEmailError ? "border-red-400" : "border-gray-200"
            }`}
          />
          {showEmailError && (
            <Text className="text-xs text-red-500 mb-3">
              Please enter a valid business email (free email domains are not
              accepted)
            </Text>
          )}
          {!showEmailError && <View className="mb-3" />}

          {/* Toggle */}
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-gray-900 flex-1 mr-3">
              Enable Business Features
            </Text>
            <View className="flex-row items-center">
              {saving && (
                <ActivityIndicator
                  size="small"
                  color={Colors.primary}
                  style={{ marginRight: 8 }}
                />
              )}
              <Switch
                value={isEnabled}
                onValueChange={handleToggle}
                disabled={!validEmail && !isEnabled}
                trackColor={{ false: Colors.gray[300], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>
          </View>
        </View>

        {/* Benefits section */}
        <Text className="text-lg font-semibold text-gray-900 mb-3">
          Business Benefits
        </Text>
        <View className="gap-3">
          {BUSINESS_BENEFITS.map((b, i) => (
            <BenefitCard key={i} benefit={b} />
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
