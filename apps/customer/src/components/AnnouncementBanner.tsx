/**
 * Dismissible banner for the latest unread admin broadcast (non-expired).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";

type NotifRow = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  data?: Record<string, unknown>;
};

function parseExpires(data?: Record<string, unknown>): number | null {
  const raw = data?.expires_at;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function annType(data?: Record<string, unknown>): string {
  return String(data?.announcement_type ?? "general").toLowerCase();
}

function thumbUrl(data?: Record<string, unknown>): string | null {
  const u = data?.media_url;
  if (typeof u !== "string" || !u.trim()) return null;
  if (data?.media_type === "video") return null;
  return u.trim();
}

export function AnnouncementBanner() {
  const router = useRouter();
  const [row, setRow] = useState<NotifRow | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ notifications?: NotifRow[] }>(
        "/api/me/notifications?type=admin_broadcast&unread_only=true&limit=5",
      );
      if (res.error || !res.data) {
        setRow(null);
        return;
      }
      const list = res.data.notifications ?? [];
      const now = Date.now();
      const pick = (Array.isArray(list) ? list : []).find((n) => {
        const exp = parseExpires(n.data);
        if (exp != null && exp < now) return false;
        return true;
      });
      if (!pick) {
        setRow(null);
        return;
      }
      const key = `announcement_banner_dismissed_${pick.id}`;
      const was = await AsyncStorage.getItem(key);
      if (was === "1") {
        setDismissed(true);
        setRow(null);
        return;
      }
      setDismissed(false);
      setRow(pick);
    } catch {
      setRow(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const accent = useMemo(() => {
    const t = annType(row?.data);
    if (t === "promotion") return { bg: "#fff7ed", border: "#fdba74", badge: "#c2410c", label: "PROMO" };
    if (t === "event") return { bg: "#eef2ff", border: "#a5b4fc", badge: "#4338ca", label: "EVENT" };
    return { bg: "#f9fafb", border: "#e5e7eb", badge: "#4b5563", label: "NEWS" };
  }, [row]);

  if (!row || dismissed) return null;

  const thumb = thumbUrl(row.data);
  const exp = parseExpires(row.data);
  const endsIn =
    exp != null && exp > Date.now()
      ? Math.max(0, Math.ceil((exp - Date.now()) / 3600000))
      : null;

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: accent.border,
        backgroundColor: accent.bg,
        overflow: "hidden",
      }}
    >
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => router.push(`/(app)/announcements/${row.id}` as never)}
        style={{ flexDirection: "row", alignItems: "center", padding: 12 }}
        accessibilityRole="button"
        accessibilityLabel={`Open announcement ${row.title}`}
      >
        <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: "#e5e7eb", overflow: "hidden" }}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={{ width: 48, height: 48 }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="megaphone-outline" size={22} color={accent.badge} />
            </View>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <View style={{ backgroundColor: accent.badge, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ fontSize: 9, fontWeight: "800", color: "#fff" }}>{accent.label}</Text>
            </View>
            {endsIn != null ? (
              <Text style={{ marginLeft: 8, fontSize: 11, color: Colors.gray[600] }}>Ends in ~{endsIn}h</Text>
            ) : null}
          </View>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: Colors.gray[900] }}>
            {row.title}
          </Text>
          <Text numberOfLines={2} style={{ fontSize: 12, color: Colors.gray[600], marginTop: 2 }}>
            {row.message}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
      </TouchableOpacity>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 8, paddingBottom: 8 }}>
        <TouchableOpacity
          onPress={async () => {
            try {
              await AsyncStorage.setItem(`announcement_banner_dismissed_${row.id}`, "1");
            } catch {
              /* ignore */
            }
            setDismissed(true);
            setRow(null);
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss announcement banner"
        >
          <Text style={{ fontSize: 13, color: Colors.gray[500], fontWeight: "600" }}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
