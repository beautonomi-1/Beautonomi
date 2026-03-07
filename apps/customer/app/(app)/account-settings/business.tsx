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
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";

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
    <View style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: Colors.gray[100] }}>
      <Text style={{ fontSize: 24, marginBottom: 8 }}>{benefit.icon}</Text>
      <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>{benefit.title}</Text>
      <Text style={{ fontSize: 14, color: Colors.gray[600], lineHeight: 20 }}>{benefit.description}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BusinessScreen() {
  useScreenTracking("Business Services");
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};

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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", color: Colors.gray[700], marginBottom: 16 }}>{error}</Text>
        <TouchableOpacity onPress={load} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const showEmailError = emailTouched && email.length > 0 && !validEmail;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: contentPadding, paddingBottom: STACK_CONTENT_PADDING_BOTTOM, ...constraint }}
        keyboardShouldPersistTaps="handled"
      >
        {isEnabled && (
          <View style={{ backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0", borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E", marginRight: 8 }} />
            <Text style={{ color: "#166534", fontWeight: "600", fontSize: 14 }}>Business features active</Text>
          </View>
        )}
        <View style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 24, borderWidth: 1, borderColor: Colors.gray[100], marginBottom: 24 }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>Beautonomi for Business</Text>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 24, lineHeight: 20 }}>
            Add your business email to access corporate packages, event booking tools, and professional development opportunities.
          </Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[700], marginBottom: 8 }}>Business email address</Text>
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
            style={{
              borderWidth: 1,
              borderRadius: 8,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 16,
              color: Colors.gray[900],
              marginBottom: 4,
              borderColor: showEmailError ? "#F87171" : Colors.gray[200],
            }}
          />
          {showEmailError && (
            <Text style={{ fontSize: 12, color: Colors.error, marginBottom: 12 }}>
              Please enter a valid business email (free email domains are not accepted)
            </Text>
          )}
          {!showEmailError && <View style={{ marginBottom: 12 }} />}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], flex: 1, marginRight: 12 }}>Enable Business Features</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {saving && <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 8 }} />}
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
        <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 12 }}>Business Benefits</Text>
        <View>
          {BUSINESS_BENEFITS.map((b, i) => (
            <View key={i} style={{ marginTop: i === 0 ? 0 : 12 }}>
              <BenefitCard benefit={b} />
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
