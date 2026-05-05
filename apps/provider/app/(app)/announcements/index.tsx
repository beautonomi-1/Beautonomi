import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, RefreshControl, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { tabScreenScrollBottomPadding } from "@/constants/layout";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

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

export default function ProviderAnnouncementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const res = await api.get<{ notifications?: Row[] }>(
      "/api/me/notifications?type=admin_broadcast&limit=50&offset=0",
    );
    if (res.error) {
      setErr(res.error.message || "Could not load announcements");
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
    <ScreenContainer scrollable={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Announcements" showBack />
      {loading ? (
        <LoadingState />
      ) : err ? (
        <View style={{ padding: 16, flex: 1 }}>
          <ErrorState message={err} onRetry={load} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: tabScreenScrollBottomPadding + insets.bottom,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 48 }}>
              <Ionicons name="megaphone-outline" size={40} color={Colors.gray[300]} />
              <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "600", color: Colors.gray[700] }}>
                No announcements yet
              </Text>
              <Text style={{ marginTop: 6, fontSize: 14, color: Colors.gray[500], textAlign: "center" }}>
                When Beautonomi sends an update or promotion, it will show up here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const thumbUri = thumb(item.data);
            const isExpired = expired(item.data);
            return (
              <Pressable
                onPress={() => router.push(`/(app)/announcements/${item.id}` as never)}
                style={{
                  flexDirection: "row",
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.gray[100],
                  opacity: isExpired ? 0.55 : 1,
                }}
              >
                <View style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", backgroundColor: Colors.gray[100] }}>
                  {thumbUri ? (
                    <Image source={{ uri: thumbUri }} style={{ width: 52, height: 52 }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="megaphone-outline" size={24} color={Colors.gray[400]} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontWeight: "700", fontSize: 16, color: Colors.gray[900] }}>
                      {item.title}
                    </Text>
                    {!item.is_read ? (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#6366f1", marginLeft: 6 }} />
                    ) : null}
                  </View>
                  <Text numberOfLines={2} style={{ marginTop: 4, fontSize: 13, color: Colors.gray[600] }}>
                    {item.message}
                  </Text>
                  {isExpired ? (
                    <Text style={{ marginTop: 6, fontSize: 11, color: Colors.gray[400] }}>Expired</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.gray[300]} style={{ alignSelf: "center" }} />
              </Pressable>
            );
          }}
          {...verticalFlatListPerf}
        />
      )}
    </ScreenContainer>
  );
}
