import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";

export default function MessagesScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/conversations");
      if (res.error) setError(res.error.message || "Failed to load");
      else {
        const raw = res.data;
        setData(Array.isArray(raw) ? raw : raw?.data ?? raw?.conversations ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
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
        <View className="gap-3">
          {convos.map((c: any) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => router.push({ pathname: "/(app)/chat", params: { id: c.id } })}
              className="bg-gray-50 rounded-xl p-4 flex-row items-center border border-gray-100"
            >
              {c.avatar || c.provider?.thumbnail_url ? (
                <Image
                  source={{ uri: c.avatar || c.provider?.thumbnail_url }}
                  className="w-12 h-12 rounded-full mr-3"
                />
              ) : (
                <View className="w-12 h-12 rounded-full bg-gray-300 mr-3 items-center justify-center">
                  <Text className="text-gray-600 font-medium">
                    {(c.provider_name || c.provider?.business_name || "?")[0]}
                  </Text>
                </View>
              )}
              <View className="flex-1">
                <Text className="font-medium text-gray-900">{c.provider_name || c.provider?.business_name || "Conversation"}</Text>
                {c.last_message_preview && (
                  <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>{c.last_message_preview}</Text>
                )}
              </View>
              <Text className="text-primary font-semibold">›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScreenFrame>
  );
}
