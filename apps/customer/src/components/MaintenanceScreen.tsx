/**
 * Full-screen maintenance / coming-soon view for the customer app.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { APP_URL, withWebApiTenantHeaders } from "@/config/public-env";
import { useTranslation } from "@beautonomi/i18n";

export interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
  cta_label?: string | null;
  countdown_end_at?: string | null;
  countdown_label?: string | null;
}

function parseEndAt(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function CountdownPart({ endAtMs, label }: { endAtMs: number; label?: string | null }) {
  const [left, setLeft] = useState(endAtMs - Date.now());

  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => {
      const next = endAtMs - Date.now();
      setLeft(next <= 0 ? 0 : next);
    }, 1000);
    return () => clearInterval(id);
  }, [endAtMs, left]);

  if (left <= 0) return null;

  const d = Math.floor(left / 86400 / 1000);
  const h = Math.floor((left / 3600 / 1000) % 24);
  const m = Math.floor((left / 60 / 1000) % 60);
  const s = Math.floor((left / 1000) % 60);
  const parts: [number, string][] = [[d, "d"], [h, "h"], [m, "m"], [s, "s"]];

  return (
    <View style={styles.countdownWrap}>
      {label ? <Text style={styles.countdownLabel}>{label}</Text> : null}
      <View style={styles.countdownRow}>
        {parts.map(([v, lbl]) => (
          <View key={lbl} style={styles.countdownBox}>
            <Text style={styles.countdownNum}>{String(v).padStart(2, "0")}</Text>
            <Text style={styles.countdownUnit}>{lbl}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function MaintenanceScreen({
  config,
  scope,
}: {
  config: MaintenanceConfig;
  scope: "customer_app" | "provider_app";
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endAtMs = parseEndAt(config.countdown_end_at ?? undefined);
  const showCta = Boolean(config.cta_label?.trim());
  const baseUrl = APP_URL?.trim() || (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "");

  const handleSubmit = async () => {
    if (!email.trim() || submitting || !baseUrl) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `${baseUrl}/api/public/maintenance-notify`,
        withWebApiTenantHeaders({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), scope }),
        }),
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? t("customer.mobile.screens.maintenance.genericError"));
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t("customer.mobile.screens.maintenance.genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.logo}>Beautonomi</Text>
        <Text style={styles.title}>{config.title}</Text>
        <Text style={styles.message}>{config.message}</Text>

        {endAtMs !== null && <CountdownPart endAtMs={endAtMs} label={config.countdown_label} />}

        {showCta && (
          <View style={styles.ctaWrap}>
            {!submitted ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder={t("customer.mobile.components.maintenance.emailPlaceholder")}
                  placeholderTextColor="#888"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!submitting}
                />
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <TouchableOpacity
                  style={[styles.button, submitting && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>{config.cta_label}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.thanks}>Thanks! We will notify you when we are back.</Text>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100%",
  },
  logo: { fontSize: 24, fontWeight: "700", marginBottom: 32, color: "#111" },
  title: { fontSize: 22, fontWeight: "600", textAlign: "center", marginBottom: 12, color: "#111" },
  message: { fontSize: 16, color: "#666", textAlign: "center", lineHeight: 24 },
  countdownWrap: { marginTop: 32, alignItems: "center" },
  countdownLabel: { fontSize: 14, color: "#666", marginBottom: 8 },
  countdownRow: { flexDirection: "row", gap: 12 },
  countdownBox: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 56,
    alignItems: "center",
    borderRadius: 8,
  },
  countdownNum: { fontSize: 22, fontWeight: "600", color: "#111" },
  countdownUnit: { fontSize: 12, color: "#666" },
  ctaWrap: { marginTop: 40, width: "100%", maxWidth: 320 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  errorText: { fontSize: 14, color: "#dc2626", marginBottom: 8 },
  button: { backgroundColor: "#D60565", paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  thanks: { fontSize: 14, color: "#666", textAlign: "center" },
});
