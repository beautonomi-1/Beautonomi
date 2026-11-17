import { useCallback, useEffect, useRef, useState } from "react";
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
  isCustomerEulaSyncedForUser,
  markCustomerEulaSyncedForUser,
} from "@/lib/legal-acceptance";
import { webCustomerEulaUrl, webPrivacyPolicyUrl } from "@/lib/legal-web";
import { api } from "@/lib/api-client";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";
import { confirmUseDifferentAccount } from "@/lib/confirm-use-different-account";

type Props = {
  children: React.ReactNode;
  /** When false, pass children through without EULA UI (keeps tree shape stable for guests). */
  enabled?: boolean;
};

type AcceptanceSnapshot = { loading: boolean; accepted: boolean };

/**
 * A real acceptance promise settles on a later turn. React then paints the
 * EULA as a normal-priority update, and a busy CI runner can hold that paint
 * until the 5s scheduler expiration — the same limit Jest gives the test.
 *
 * Read the thenable during render. If it calls back before `.then()` returns,
 * the EULA is part of this paint and nothing waits on the scheduler.
 */
function useCustomerEulaAcceptance(): AcceptanceSnapshot & { markAccepted: () => void } {
  const resolvedRef = useRef<boolean | null>(null);
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);
  const [, rerender] = useState(0);

  if (!startedRef.current) {
    startedRef.current = true;
    const promise = hasAcceptedCurrentCustomerEula();
    let resolvedDuringRender: boolean | null = null;
    promise.then((accepted) => {
      resolvedDuringRender = accepted;
    });
    if (resolvedDuringRender !== null) {
      resolvedRef.current = resolvedDuringRender;
    } else {
      promise.then((accepted) => {
        if (cancelledRef.current || resolvedRef.current !== null) return;
        resolvedRef.current = accepted;
        rerender((version) => version + 1);
      });
    }
  }

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const markAccepted = useCallback(() => {
    resolvedRef.current = true;
    rerender((version) => version + 1);
  }, []);

  const resolved = resolvedRef.current;
  if (resolved === null) {
    return { loading: true, accepted: false, markAccepted };
  }
  return { loading: false, accepted: resolved, markAccepted };
}

export function LegalAcceptanceGate({ children, enabled = true }: Props) {
  return (
    <LegalAcceptanceGateActive enabled={enabled}>{children}</LegalAcceptanceGateActive>
  );
}

function LegalAcceptanceGateActive({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const lg = (key: string) => t(`customer.mobile.components.legalAcceptanceGate.${key}`) as string;
  const { session, signOut } = useAuth();
  const userId = session?.user?.id ?? null;
  const { loading, accepted, markAccepted } = useCustomerEulaAcceptance();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const syncServerAcceptance = useCallback(async () => {
    if (!userId) return;
    if (await isCustomerEulaSyncedForUser(userId)) return;
    const res = await api.post("/api/me/legal-acceptance", {
      app: "customer",
      version: CUSTOMER_EULA_VERSION,
    });
    if (res.error) throw new Error(res.error.message ?? "legal acceptance sync failed");
    await markCustomerEulaSyncedForUser(userId);
  }, [userId]);

  useEffect(() => {
    if (!enabled || !userId || !accepted) return;
    let cancelled = false;
    const run = async (attempt: number) => {
      try {
        await syncServerAcceptance();
      } catch {
        if (cancelled || attempt >= 1) return;
        await new Promise((r) => setTimeout(r, 1500));
        if (!cancelled) await run(1);
      }
    };
    void run(0);
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, accepted, syncServerAcceptance]);

  const onContinue = useCallback(async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    try {
      await storeCustomerEulaAcceptance();
      markAccepted();
    } finally {
      setSubmitting(false);
    }
  }, [checked, submitting, markAccepted]);

  if (!enabled || accepted) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
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
          {lg("title")}
        </Text>
        <Text style={{ marginTop: 12, fontSize: 15, lineHeight: 22, color: "#4B5563" }}>
          {session ? lg("bodySignedIn") : lg("bodyGuest")}
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
          <Text style={{ marginStart: 10, flex: 1, fontSize: 15, fontWeight: "600", color: "#111827" }}>
            {lg("readFullEula")}
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
          <Text style={{ marginStart: 10, flex: 1, fontSize: 14, lineHeight: 20, color: "#374151" }}>
            {lg("agreeLead")}{" "}
            <Text
              style={{ fontWeight: "600", color: Colors.primary, textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(webCustomerEulaUrl()).catch(() => {})}
            >
              {lg("eula")}
            </Text>{" "}
            {lg("and")}{" "}
            <Text
              style={{ fontWeight: "600", color: Colors.primary, textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(webPrivacyPolicyUrl()).catch(() => {})}
            >
              {lg("privacyPolicy")}
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
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{t("common.continue")}</Text>
          )}
        </TouchableOpacity>

        {session ? (
          <TouchableOpacity
            onPress={() => confirmUseDifferentAccount(t, signOut)}
            style={{ marginTop: 16, alignItems: "center", paddingVertical: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t("common.useDifferentAccount") as string}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[500], textDecorationLine: "underline" }}>
              {t("common.useDifferentAccount")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}
