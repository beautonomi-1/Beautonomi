import { useEffect, useState } from "react";
import { View, Text, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import {
  ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY,
  looksLikeActiveProviderUuid,
  setActiveProviderApiHint,
} from "@/lib/active-provider-api-hint";
import { useAuth } from "@/providers/AuthProvider";
import { useProvider } from "@/providers/ProviderContext";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";

type Membership = {
  provider_id: string;
  business_name: string;
  relationship: "owner" | "staff";
};

/**
 * Salon switcher for users with multiple provider memberships.
 */
export function ProviderOrgSwitcher() {
  const { user } = useAuth();
  const { provider, refresh } = useProvider();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{
          memberships?: Membership[];
          active_provider_id?: string | null;
          has_multiple?: boolean;
        }>("/api/provider/memberships");
        if (cancelled) return;
        const data = res.data;
        if (!data?.has_multiple) {
          setMemberships([]);
          return;
        }
        setMemberships(data.memberships ?? []);
        setActiveId(data.active_provider_id ?? provider?.id ?? null);
      } catch {
        if (!cancelled) setMemberships([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider?.id]);

  if (loading || memberships.length < 2) return null;

  async function switchOrg(providerId: string) {
    const res = await api.post<{ active_provider_id?: string }>(
      "/api/provider/memberships",
      { provider_id: providerId },
    );
    if (res.error) {
      Alert.alert("Could not switch business", res.error.message ?? "Try again.");
      return;
    }
    if (looksLikeActiveProviderUuid(providerId)) {
      setActiveProviderApiHint(providerId);
      if (user?.id) {
        await AsyncStorage.setItem(
          ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY,
          JSON.stringify({ userId: user.id, providerId }),
        );
      }
    }
    setActiveId(providerId);
    await refresh();
  }

  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.gray[200],
        backgroundColor: "#fff",
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.gray[500], textTransform: "uppercase", letterSpacing: 0.6 }}>
        Active business
      </Text>
      <View style={twStyle("mt-2")}>
        {memberships.map((m) => {
          const selected = (activeId ?? provider?.id) === m.provider_id;
          return (
            <Text
              key={m.provider_id}
              onPress={() => void switchOrg(m.provider_id)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                marginTop: 6,
                backgroundColor: selected ? Colors.gray[900] : Colors.gray[100],
                color: selected ? "#fff" : Colors.gray[900],
                fontWeight: selected ? "700" : "500",
                overflow: "hidden",
              }}
            >
              {m.business_name}
              {m.relationship === "staff" ? " (staff)" : ""}
            </Text>
          );
        })}
      </View>
    </View>
  );
}
