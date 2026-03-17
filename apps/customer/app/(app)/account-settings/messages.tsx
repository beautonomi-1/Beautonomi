import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";

export default function MessagesScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/conversations");
      if (res.error) setError(getApiErrorMessage(res.error, "Failed to load"));
      else {
        const raw = res.data;
        setData(Array.isArray(raw) ? raw : raw?.data ?? raw?.conversations ?? []);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const convos = Array.isArray(data) ? data : [];

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load} empty={{ title: "No messages" }} isEmpty={convos.length === 0}>
      {convos.length > 0 && (
        <View>
          {convos.map((c: any, index: number) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => router.push({ pathname: "/(app)/chat", params: { id: c.id } })}
              style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: Colors.gray[100], marginTop: index === 0 ? 0 : 12 }}
            >
              {c.avatar || c.provider?.thumbnail_url ? (
                <Image
                  source={{ uri: c.avatar || c.provider?.thumbnail_url }}
                  style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }}
                />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[300], marginRight: 12, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: Colors.gray[600], fontWeight: "500" }}>
                    {(c.provider_name || c.provider?.business_name || "?")[0]}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{c.provider_name || c.provider?.business_name || "Conversation"}</Text>
                {c.last_message_preview && (
                  <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 2 }} numberOfLines={1}>{c.last_message_preview}</Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {(c.unread_count ?? c.unread_count_customer ?? 0) > 0 && (
                  <View style={{ marginBottom: 4, backgroundColor: Colors.primary, minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{(c.unread_count ?? c.unread_count_customer ?? 0)}</Text>
                  </View>
                )}
                <Text style={{ color: Colors.primary, fontWeight: "600" }}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScreenFrame>
  );
}
