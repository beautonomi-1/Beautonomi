import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  PROVIDER_EXCELLENCE_DASHBOARD_BODY,
  PROVIDER_EXCELLENCE_DASHBOARD_COOLDOWN_MS,
  PROVIDER_EXCELLENCE_DASHBOARD_CTA,
  PROVIDER_EXCELLENCE_DASHBOARD_STORAGE_KEY,
  PROVIDER_EXCELLENCE_DASHBOARD_TITLE,
} from "@beautonomi/utils";
import { Colors } from "@/constants/colors";
import * as Haptics from "expo-haptics";

async function readDismissedAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(PROVIDER_EXCELLENCE_DASHBOARD_STORAGE_KEY);
    if (!raw) return null;
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

export function ProviderDashboardExcellenceBanner() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dismissed = await readDismissedAt();
      if (cancelled) return;
      if (!dismissed) {
        setVisible(true);
        return;
      }
      if (Date.now() - dismissed > PROVIDER_EXCELLENCE_DASHBOARD_COOLDOWN_MS) {
        setVisible(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(async () => {
    try {
      await AsyncStorage.setItem(PROVIDER_EXCELLENCE_DASHBOARD_STORAGE_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setVisible(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const openRewards = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(app)/(tabs)/more/rewards-hub?tab=badges" as never);
  }, [router]);

  if (!visible) return null;

  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(245, 158, 11, 0.45)",
        backgroundColor: "rgba(255, 251, 235, 0.95)",
        padding: 14,
      }}
      accessibilityLabel={`${PROVIDER_EXCELLENCE_DASHBOARD_TITLE}. ${PROVIDER_EXCELLENCE_DASHBOARD_BODY}`}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View
          style={{
            marginRight: 12,
            borderRadius: 10,
            backgroundColor: "rgba(251, 191, 36, 0.25)",
            padding: 8,
          }}
        >
          <Ionicons name="sparkles" size={20} color="#b45309" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#78350f", flex: 1 }}>
              {PROVIDER_EXCELLENCE_DASHBOARD_TITLE}
            </Text>
            <TouchableOpacity
              onPress={dismiss}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss tip"
            >
              <Ionicons name="close" size={20} color="#92400e" />
            </TouchableOpacity>
          </View>
          <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 19, color: "#78350f" }}>
            {PROVIDER_EXCELLENCE_DASHBOARD_BODY}
          </Text>
          <TouchableOpacity onPress={openRewards} style={{ marginTop: 12 }} accessibilityRole="button">
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>
              {PROVIDER_EXCELLENCE_DASHBOARD_CTA} →
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
