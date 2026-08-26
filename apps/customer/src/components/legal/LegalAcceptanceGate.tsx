import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BeautonomiLogo } from "@/components/ui/BeautonomiLogo";
import { Colors } from "@/constants/colors";
import {
  hasAcceptedCurrentCustomerEula,
  storeCustomerEulaAcceptance,
  CUSTOMER_EULA_VERSION,
} from "@/lib/legal-acceptance";
import { webCustomerEulaUrl, webPrivacyPolicyUrl } from "@/lib/legal-web";
import { api } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";

type Props = {
  children: React.ReactNode;
};

export function LegalAcceptanceGate({ children }: Props) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await hasAcceptedCurrentCustomerEula();
      if (!cancelled) {
        setAccepted(ok);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const syncServerAcceptance = useCallback(async () => {
    if (!session) return;
    await api.post("/api/me/legal-acceptance", {
      app: "customer",
      version: CUSTOMER_EULA_VERSION,
    });
  }, [session]);

  useEffect(() => {
    if (session && accepted) {
      void syncServerAcceptance().catch(() => {});
    }
  }, [session, accepted, syncServerAcceptance]);

  const onContinue = useCallback(async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    try {
      await storeCustomerEulaAcceptance();
      setAccepted(true);
      if (session) {
        await syncServerAcceptance();
      }
    } finally {
      setSubmitting(false);
    }
  }, [checked, submitting, session, syncServerAcceptance]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (accepted) {
    return <>{children}</>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          paddingTop: Platform.OS === "ios" ? 56 : 32,
          maxWidth: 520,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <BeautonomiLogo size={32} />
        <Text style={{ marginTop: 24, fontSize: 24, fontWeight: "700", color: "#111827" }}>
          End User License Agreement
        </Text>
        <Text style={{ marginTop: 12, fontSize: 15, lineHeight: 22, color: "#4B5563" }}>
          {session
            ? "We've updated our End User License Agreement. Review and accept to continue using Beautonomi."
            : "Before you sign in or create an account, review and accept our EULA. It covers community standards, reporting, blocking, parental controls, and our commitment to act on reports within 24 hours."}
        </Text>

        <TouchableOpacity
          onPress={() => Linking.openURL(webCustomerEulaUrl()).catch(() => {})}
          style={{
            marginTop: 20,
            flexDirection: "row",
            alignItems: "center",
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.gray[50],
          }}
          accessibilityRole="link"
        >
          <Ionicons name="document-text-outline" size={22} color={Colors.primary} />
          <Text style={{ marginLeft: 10, flex: 1, fontSize: 15, fontWeight: "600", color: "#111827" }}>
            Read full EULA
          </Text>
          <Ionicons name="open-outline" size={18} color={Colors.gray[400]} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setChecked((v) => !v)}
          style={{ marginTop: 20, flexDirection: "row", alignItems: "flex-start" }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
        >
          <Ionicons
            name={checked ? "checkbox" : "square-outline"}
            size={24}
            color={checked ? Colors.primary : Colors.gray[400]}
            style={{ marginTop: 2 }}
          />
          <Text style={{ marginLeft: 10, flex: 1, fontSize: 14, lineHeight: 20, color: "#374151" }}>
            I have read and agree to the{" "}
            <Text
              style={{ fontWeight: "600", color: Colors.primary, textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(webCustomerEulaUrl()).catch(() => {})}
            >
              EULA
            </Text>{" "}
            and{" "}
            <Text
              style={{ fontWeight: "600", color: Colors.primary, textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(webPrivacyPolicyUrl()).catch(() => {})}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => void onContinue()}
          disabled={!checked || submitting}
          style={{
            marginTop: 24,
            minHeight: 48,
            borderRadius: 14,
            backgroundColor: !checked || submitting ? Colors.gray[300] : Colors.primary,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 20,
          }}
          accessibilityRole="button"
          accessibilityState={{ disabled: !checked || submitting }}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Continue</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
