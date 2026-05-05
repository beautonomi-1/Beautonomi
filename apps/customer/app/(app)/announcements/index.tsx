import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, RefreshControl, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM, RADIUS_CARD } from "@/constants/layout";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";

type Row = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  data?: Record<string, unknown>;
};

function thumb(data?: Record<string, unknown>): string | null {
  const u = data?.media_url;
  if (typeof u !== "string" || !u.trim()) return null;
  if (data?.media_type === "video") return null;
  return u.trim();
}

function expired(data?: Record<string, unknown>): boolean {
  const raw = data?.expires_at;
  if (typeof raw !== "string" || !raw.trim()) return false;
  const t = Date.parse(raw);
  return Number.isFinite(t) && t < Date.now();
}

export default function CustomerAnnouncementsScreen() {
  useScreenTracking("Announcements");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contentPadding } = useResponsive();
  const { t } = useTranslation();
  const title = t("customer.mobile.stackTitles.announcements");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadErr(null);
    const res = await api.get<{ notifications?: Row[] }>(
      "/api/me/notifications?type=admin_broadcast&limit=50&offset=0",
    );
    if (res.error) {
      setLoadErr(res.error.message || "Could not load announcements");
      setRows([]);
      return;
    }
    setRows(Array.isArray(res.data?.notifications) ? res.data!.notifications! : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerTintColor: Colors.primary,
        }}
      />
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : loadErr ? (
        <View style={{ padding: 24 }}>
          <Text style={{ fontSize: 15, color: Colors.gray[700] }}>{loadErr}</Text>
          <Pressable onPress={load} accessibilityRole="button" style={{ marginTop: 12 }}>
            <Text style={{ color: Colors.primary, fontWeight: "700" }}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => it.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{
            paddingHorizontal: Math.max(contentPadding, 16),
            paddingTop: 12,
            paddingBottom: STACK_CONTENT_PADDING_BOTTOM + insets.bottom,
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 48 }}>
              <Ionicons name="megaphone-outline" size={40} color={Colors.gray[300]} />
              <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "600", color: Colors.gray[700] }}>
                Nothing here yet
              </Text>
              <Text style={{ marginTop: 6, fontSize: 14, color: Colors.gray[500], textAlign: "center", maxWidth: 280 }}>
                Promotions and news from Beautonomi will appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const thumbUri = thumb(item.data);
            const isExpired = expired(item.data);
            return (
              <Pressable
                onPress={() => router.push(`/(app)/announcements/${item.id}` as never)}
                style={announceRowStyles.row}
              >
                <View style={{ paddingLeft: 12, justifyContent: "center" }}>
                  <View style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", backgroundColor: Colors.gray[100] }}>
                    {thumbUri ? (
                      <Image source={{ uri: thumbUri }} style={{ width: 52, height: 52 }} contentFit="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="megaphone-outline" size={24} color={Colors.gray[400]} />
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ flex: 1, marginLeft: 10, paddingRight: 12, paddingVertical: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontWeight: "700", fontSize: 16, color: Colors.gray[900] }}>
                      {item.title}
                    </Text>
                    {!item.is_read ? (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginLeft: 6 }} />
                    ) : null}
                  </View>
                  <Text numberOfLines={2} style={{ marginTop: 4, fontSize: 13, color: Colors.gray[600] }}>
                    {item.message}
                  </Text>
                  {isExpired ? (
                    <Text style={{ marginTop: 8, fontSize: 11, color: Colors.gray[400] }}>Expired</Text>
                  ) : null}
                </View>
                <View style={{ justifyContent: "center", paddingRight: 8 }}>
                  <Ionicons name="chevron-forward" size={18} color={Colors.gray[300]} />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const announceRowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingVertical: 14,
    marginBottom: 8,
    backgroundColor: Colors.white,
    borderRadius: RADIUS_CARD,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
});
