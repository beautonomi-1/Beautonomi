import { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Image, TextInput, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";

export default function MessagesScreen() {
  const { t } = useTranslation();
  const ch = useCallback((key: string) => t(`customer.mobile.tabs.chats.${key}`) as string, [t]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const markConversationRead = async (conversationId: string) => {
    setData((prev: any) => {
      if (!Array.isArray(prev)) return prev;
      return prev.map((row: any) =>
        row.id === conversationId
          ? { ...row, unread_count_customer: 0, unread_count: 0 }
          : row
      );
    });
    const res = await api.post(`/api/me/conversations/${conversationId}/read`, {});
    if (res.error) {
      setError(getApiErrorMessage(res.error, "Failed to mark conversation as read"));
      void load();
    }
  };

  const deleteConversation = async (conversationId: string) => {
    const previous = data;
    setData((prev: any) => (Array.isArray(prev) ? prev.filter((row: any) => row.id !== conversationId) : prev));
    const res = await api.fetch<{ deleted?: boolean }>(`/api/me/conversations/${conversationId}`, {
      method: "DELETE",
    });
    if (res.error) {
      setData(previous);
      setError(getApiErrorMessage(res.error, "Failed to delete conversation"));
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/conversations");
      if (res.error) setError(getApiErrorMessage(res.error, "Failed to load"));
      else {
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : raw?.data ?? raw?.conversations ?? [];
        // One thread per provider (same as Chats tab): group by provider_id
        const byProvider = new Map<string, any[]>();
        for (const c of list) {
          const pid = c.provider_id ?? c.provider?.business_name ?? c.id;
          if (!byProvider.has(pid)) byProvider.set(pid, []);
          byProvider.get(pid)!.push(c);
        }
        const onePerProvider = Array.from(byProvider.values()).map((threads) => {
          const general = threads.find((t: any) => t.booking_id == null);
          const sorted = [...threads].sort(
            (a: any, b: any) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
          );
          const display = general ?? sorted[0];
          const unreadTotal = threads.reduce((s: number, t: any) => s + (t.unread_count_customer ?? t.unread_count ?? 0), 0);
          return { ...display, unread_count_customer: unreadTotal, unread_count: unreadTotal };
        });
        onePerProvider.sort(
          (a: any, b: any) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
        );
        setData(onePerProvider);
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
  const filteredConvos = convos.filter((c: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const providerName = (c.provider_name || c.provider?.business_name || "").toLowerCase();
    const preview = (c.last_message_preview || "").toLowerCase();
    return providerName.includes(q) || preview.includes(q);
  });

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load} empty={{ title: ch("noMessages") }} isEmpty={filteredConvos.length === 0}>
      <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }}>
        <Text style={{ color: Colors.gray[400], marginRight: 6 }}>🔎</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("customer.mobile.screens.accountMessages.searchPlaceholder")}
          placeholderTextColor={Colors.gray[400]}
          style={{ flex: 1, fontSize: 14, color: Colors.gray[900] }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch("")} accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={{ color: Colors.gray[500], fontSize: 14 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {filteredConvos.length > 0 && (
        <View>
          {filteredConvos.map((c: any, index: number) => (
            <TouchableOpacity
              key={c.id}
              onLongPress={() => {
                const unread = c.unread_count ?? c.unread_count_customer ?? 0;
                Alert.alert(ch("conversationActionsTitle"), ch("conversationActionsMessage"), [
                  ...(unread > 0 ? [{ text: ch("markAsRead"), onPress: () => void markConversationRead(c.id) }] : []),
                  {
                    text: ch("deleteConversation"),
                    style: "destructive",
                    onPress: () =>
                      Alert.alert(ch("deleteConfirmTitle"), ch("deleteConfirmBody"), [
                        { text: t("common.cancel"), style: "cancel" },
                        { text: ch("delete"), style: "destructive", onPress: () => void deleteConversation(c.id) },
                      ]),
                  },
                  { text: t("common.cancel"), style: "cancel" },
                ]);
              }}
              onPress={() => {
                setData((prev: any) => {
                  if (!Array.isArray(prev)) return prev;
                  return prev.map((row: any) =>
                    row.id === c.id
                      ? { ...row, unread_count_customer: 0, unread_count: 0 }
                      : row
                  );
                });
                // Prefer navigating by conversation id — avoids a redundant get-or-create.
                if (c.id) {
                  router.push({ pathname: "/(app)/chat", params: { id: c.id, provider_name: c.provider_name || c.provider?.business_name || "Provider" } });
                } else if (c.provider_id) {
                  router.push({ pathname: "/(app)/chat", params: { provider_id: c.provider_id, provider_name: c.provider_name || c.provider?.business_name || "Provider" } });
                }
              }}
              style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: Colors.gray[100], marginTop: index === 0 ? 0 : 12 }}
            >
              <TouchableOpacity
                onPress={() => {
                  if (c.provider_slug) {
                    router.push({
                      pathname: "/(app)/partner-profile",
                      params: { slug: c.provider_slug, provider_id: c.provider_id || undefined },
                    });
                    return;
                  }
                }}
                activeOpacity={0.8}
                style={{ marginRight: 12 }}
              >
                {c.avatar || c.provider?.thumbnail_url ? (
                  <Image
                    source={{ uri: c.avatar || c.provider?.thumbnail_url }}
                    style={{ width: 48, height: 48, borderRadius: 24 }}
                  />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[300], alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: Colors.gray[600], fontWeight: "500" }}>
                      {(c.provider_name || c.provider?.business_name || "?")[0]}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
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
              <TouchableOpacity
                onPress={() => {
                  const unread = c.unread_count ?? c.unread_count_customer ?? 0;
                  Alert.alert(ch("conversationActionsTitle"), ch("conversationActionsMessage"), [
                    ...(unread > 0 ? [{ text: ch("markAsRead"), onPress: () => void markConversationRead(c.id) }] : []),
                    {
                      text: ch("deleteConversation"),
                      style: "destructive",
                      onPress: () =>
                        Alert.alert(ch("deleteConfirmTitle"), ch("deleteConfirmBody"), [
                          { text: t("common.cancel"), style: "cancel" },
                          { text: ch("delete"), style: "destructive", onPress: () => void deleteConversation(c.id) },
                        ]),
                    },
                    { text: t("common.cancel"), style: "cancel" },
                  ]);
                }}
                accessibilityRole="button"
                accessibilityLabel={ch("conversationActionsA11y")}
                style={{ marginLeft: 8, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: Colors.gray[100] }}
              >
                <Ionicons name="ellipsis-vertical" size={16} color={Colors.gray[600]} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScreenFrame>
  );
}
