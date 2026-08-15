import { useEffect, useState } from "react";
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { persistActiveProviderOrgHint } from "@/lib/active-provider-api-hint";
import { clearApiCache } from "@/lib/api-response-cache";
import { useAuth } from "@/providers/AuthProvider";
import { useProvider } from "@/providers/ProviderContext";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";

type Membership = {
  provider_id: string;
  business_name: string;
  relationship: "owner" | "staff";
};

function relationshipLabel(relationship: Membership["relationship"]): string {
  return relationship === "owner" ? "Owner" : "Staff";
}

/**
 * Salon switcher for users with multiple provider memberships.
 * `card` = More tab. `header` = persistent AppHeader chip.
 */
export function ProviderOrgSwitcher({
  variant = "card",
}: {
  variant?: "card" | "header";
}) {
  const { user } = useAuth();
  const { provider, refresh } = useProvider();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const sheetWidth = Math.min(420, windowWidth * 0.92);
  const listMaxHeight = Math.min(windowHeight * 0.55, 420);

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
        const rows = data?.memberships ?? [];
        setMemberships(rows);
        setActiveId(data?.active_provider_id ?? provider?.id ?? null);
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

  const current =
    memberships.find((m) => m.provider_id === (activeId ?? provider?.id)) ??
    memberships.find((m) => m.provider_id === provider?.id);
  const currentName = current?.business_name ?? provider?.business_name ?? "Business";
  const canSwitch = memberships.length > 1;

  async function switchOrg(providerId: string) {
    if (providerId === (activeId ?? provider?.id)) {
      setSheetOpen(false);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await api.post<{ active_provider_id?: string }>(
      "/api/provider/memberships",
      { provider_id: providerId },
    );
    if (res.error) {
      Alert.alert("Could not switch business", res.error.message ?? "Try again.");
      return;
    }
    await persistActiveProviderOrgHint(user?.id, providerId);
    clearApiCache();
    setActiveId(providerId);
    setSheetOpen(false);
    await refresh();
  }

  if (loading && variant === "card" && memberships.length < 2) return null;
  if (variant === "card" && memberships.length < 2) return null;
  if (variant === "header" && !provider?.business_name && !currentName) return null;

  const sheet = (
    <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
      <Pressable
        style={twStyle("flex-1 items-center justify-center bg-black/40")}
        onPress={() => setSheetOpen(false)}
      >
        <Pressable
          style={[twStyle("overflow-hidden rounded-2xl bg-white"), { width: sheetWidth, alignSelf: "center" }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={twStyle("border-b border-gray-100 px-5 py-4")}>
            <Text style={twStyle("text-base font-bold text-gray-900")}>Switch business</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              Bookings, team, and AI follow the salon you select.
            </Text>
          </View>
          <ScrollView style={{ maxHeight: listMaxHeight }}>
            {memberships.map((m) => {
              const selected = (activeId ?? provider?.id) === m.provider_id;
              return (
                <TouchableOpacity
                  key={m.provider_id}
                  onPress={() => void switchOrg(m.provider_id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${m.business_name}, ${relationshipLabel(m.relationship)}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    backgroundColor: selected ? "#f5f3ff" : "#fff",
                    borderBottomWidth: 1,
                    borderBottomColor: "#f3f4f6",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: selected ? "700" : "500", color: "#111827" }}>
                      {m.business_name}
                    </Text>
                    <Text style={{ marginTop: 2, fontSize: 12, color: "#6b7280" }}>
                      {relationshipLabel(m.relationship)}
                    </Text>
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={20} color={Colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  if (variant === "header") {
    return (
      <>
        <TouchableOpacity
          style={[twStyle("flex-row items-center rounded-lg bg-gray-50 px-3 py-2"), { maxWidth: 168, flexShrink: 1 }]}
          onPress={() => {
            if (!canSwitch) return;
            Haptics.selectionAsync();
            setSheetOpen(true);
          }}
          disabled={!canSwitch}
          accessibilityRole="button"
          accessibilityLabel={
            canSwitch
              ? `Active business ${currentName}. Tap to switch.`
              : `Active business ${currentName}`
          }
        >
          <Ionicons name="storefront-outline" size={14} color="#6b7280" />
          <Text style={twStyle("ml-1.5 text-xs font-medium text-gray-700")} numberOfLines={1}>
            {currentName}
          </Text>
          {canSwitch ? (
            <Ionicons name="chevron-down" size={12} color="#9ca3af" style={{ marginLeft: 4 }} />
          ) : null}
        </TouchableOpacity>
        {canSwitch ? sheet : null}
      </>
    );
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
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: Colors.gray[500],
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        Active business
      </Text>
      <View style={twStyle("mt-2")}>
        {memberships.map((m) => {
          const selected = (activeId ?? provider?.id) === m.provider_id;
          return (
            <TouchableOpacity
              key={m.provider_id}
              onPress={() => void switchOrg(m.provider_id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${m.business_name}, ${relationshipLabel(m.relationship)}`}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                marginTop: 6,
                backgroundColor: selected ? Colors.gray[900] : Colors.gray[100],
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text
                  style={{
                    color: selected ? "#fff" : Colors.gray[900],
                    fontWeight: selected ? "700" : "500",
                  }}
                  numberOfLines={1}
                >
                  {m.business_name}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 11, color: selected ? "#d1d5db" : "#6b7280" }}>
                  {relationshipLabel(m.relationship)}
                </Text>
              </View>
              {selected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
