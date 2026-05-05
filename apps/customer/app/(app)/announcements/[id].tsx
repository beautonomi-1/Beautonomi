import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { useNotifications } from "@/providers/NotificationsContext";

type Notif = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  data?: Record<string, unknown>;
  link?: string;
};

function getDataPayload(n: Notif | null): Record<string, unknown> {
  if (!n?.data || typeof n.data !== "object" || Array.isArray(n.data)) return {};
  return n.data as Record<string, unknown>;
}

export default function CustomerAnnouncementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const detailTitle = t("customer.mobile.stackTitles.announcementDetail");
  const { adjustUnreadCount, refetchUnreadCount } = useNotifications();
  const [row, setRow] = useState<Notif | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const markedReadRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadErr(null);
    setLoading(true);
    const res = await api.get<{ notification?: Notif }>(`/api/me/notifications/${id}`);
    setLoading(false);
    if (res.error || !res.data?.notification) {
      setLoadErr(res.error?.message ?? "Announcement not found");
      setRow(null);
      return;
    }
    setRow(res.data.notification);
  }, [id]);

  useEffect(() => {
    markedReadRef.current = false;
    void load();
  }, [load]);

  useEffect(() => {
    if (!row?.id || row.is_read || markedReadRef.current) return;
    markedReadRef.current = true;
    void (async () => {
      const res = await api.post(`/api/me/notifications/${row.id}/read`, {});
      if (!res.error) {
        adjustUnreadCount(-1);
        void refetchUnreadCount();
      }
    })();
  }, [row?.id, row?.is_read, adjustUnreadCount, refetchUnreadCount]);

  const data = getDataPayload(row);
  const mediaUrl = typeof data.media_url === "string" ? data.media_url.trim() : "";
  const mediaType = String(data.media_type ?? "").toLowerCase();
  const ctaLabel = typeof data.cta_label === "string" ? data.cta_label.trim() : "";
  const ctaUrl = typeof data.cta_url === "string" ? data.cta_url.trim() : "";
  const annType = String(data.announcement_type ?? "general");

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: detailTitle,
          headerTintColor: Colors.primary,
        }}
      />
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : loadErr || !row ? (
        <View style={{ padding: 24 }}>
          <Text style={{ fontSize: 16, color: Colors.gray[700] }}>{loadErr ?? "Not found"}</Text>
          <TouchableOpacity onPress={load} style={{ marginTop: 16 }}>
            <Text style={{ color: Colors.primary, fontWeight: "700" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: STACK_CONTENT_PADDING_BOTTOM + insets.bottom,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.gray[100] }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: Colors.gray[600] }}>{annType.toUpperCase()}</Text>
            </View>
            <Text style={{ marginLeft: 12, fontSize: 12, color: Colors.gray[500] }}>
              {new Date(row.created_at).toLocaleString()}
            </Text>
          </View>

          <Text style={{ fontSize: 22, fontWeight: "800", color: Colors.gray[900] }}>{row.title}</Text>
          <Text style={{ marginTop: 12, fontSize: 16, lineHeight: 24, color: Colors.gray[700] }}>{row.message}</Text>

          {mediaUrl ? (
            <View style={{ marginTop: 20, borderRadius: 14, overflow: "hidden", backgroundColor: Colors.gray[100] }}>
              {mediaType === "video" ? (
                <Video
                  source={{ uri: mediaUrl }}
                  style={{ width: "100%", height: 220 }}
                  resizeMode={ResizeMode.CONTAIN}
                  useNativeControls
                />
              ) : (
                <Image source={{ uri: mediaUrl }} style={{ width: "100%", height: 220 }} contentFit="contain" />
              )}
            </View>
          ) : null}

          {ctaUrl && ctaLabel ? (
            <TouchableOpacity
              onPress={() => void Linking.openURL(ctaUrl)}
              style={{
                marginTop: 24,
                backgroundColor: Colors.primary,
                paddingVertical: 14,
                paddingHorizontal: 18,
                borderRadius: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}
              accessibilityRole="button"
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>{ctaLabel}</Text>
              <Ionicons name="open-outline" size={18} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
