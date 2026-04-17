import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { twStyle } from "@/lib/twStyle";

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  total_recipients: number;
  sent_count?: number;
  scheduled_at?: string | null;
  sent_at?: string | null;
  created_at: string;
}

interface CampaignsResponse {
  items: Campaign[];
  total: number;
  page: number;
  limit: number;
}

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

/** Content-only for use in Marketing hub (Campaigns tab). */
export function MarketingCampaignsContent() {
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "email" as "email" | "sms" | "whatsapp",
    subject: "",
    content: "",
  });
  const { data, loading, error, refresh } = useApi<CampaignsResponse>(
    "/api/provider/campaigns?limit=50"
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const campaigns: Campaign[] = data?.items ?? [];
  const total = data?.total ?? campaigns.length;

  const createCampaign = useCallback(async () => {
    if (!form.name.trim() || !form.content.trim()) {
      Alert.alert("Missing details", "Name and content are required.");
      return;
    }
    if (form.type === "email" && !form.subject.trim()) {
      Alert.alert("Missing subject", "Email campaigns require a subject.");
      return;
    }
    setCreating(true);
    try {
      const res = await api.post<Campaign>("/api/provider/campaigns", {
        name: form.name.trim(),
        type: form.type,
        subject: form.type === "email" ? form.subject.trim() : undefined,
        content: form.content.trim(),
        recipient_type: "all_clients",
      });
      if (res.error || !res.data?.id) {
        Alert.alert("Could not create campaign", res.error?.message ?? "Try again.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateOpen(false);
      setForm({ name: "", type: "email", subject: "", content: "" });
      refresh();
    } catch (e: any) {
      Alert.alert("Could not create campaign", e?.message ?? "Try again.");
    } finally {
      setCreating(false);
    }
  }, [form, refresh]);

  const sendCampaign = useCallback(async (id: string) => {
    setSendingId(id);
    try {
      const res = await api.post<{ message?: string; sent_count?: number }>(`/api/provider/campaigns/${id}/send`, {});
      if (res.error) {
        Alert.alert("Could not send campaign", res.error.message ?? "Try again.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    } catch (e: any) {
      Alert.alert("Could not send campaign", e?.message ?? "Try again.");
    } finally {
      setSendingId(null);
    }
  }, [refresh]);

  if (loading && !data) {
    return (
      <View style={twStyle("flex-1 items-center justify-center py-12")}>
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={twStyle("flex-1 justify-center px-4")}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("mb-3 flex-row items-center justify-end")}>
          <TouchableOpacity
            onPress={() => setCreateOpen(true)}
            style={twStyle("flex-row items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2")}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color="#4338ca" style={{ marginRight: 6 }} />
            <Text style={twStyle("text-sm font-semibold text-indigo-800")}>Create campaign</Text>
          </TouchableOpacity>
        </View>
        {campaigns.length === 0 ? (
          <View style={twStyle("items-center rounded-2xl border border-gray-100 bg-gray-50/50 p-8")}>
            <View style={twStyle("mb-4 h-16 w-16 items-center justify-center rounded-full bg-red-100")}>
              <Ionicons name="megaphone-outline" size={32} color="#ef4444" />
            </View>
            <Text style={twStyle("text-center font-semibold text-gray-900")}>No campaigns yet</Text>
            <Text style={twStyle("mt-2 text-center text-sm text-gray-500")}>
              Create email, SMS or WhatsApp campaigns to reach your clients. Use Marketing and Ads tools in-app to manage audience reach and scheduling.
            </Text>
          </View>
        ) : (
          <>
            <Text style={twStyle("mb-3 text-sm text-gray-500")}>
              {total} campaign{total !== 1 ? "s" : ""}
            </Text>
            {campaigns.map((c) => (
              <View
                key={c.id}
                style={twStyle("mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4")}
              >
                <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-red-100")}>
                  <Ionicons
                    name={c.type === "email" ? "mail-outline" : c.type === "sms" ? "chatbox-outline" : "logo-whatsapp"}
                    size={20}
                    color="#ef4444"
                  />
                </View>
                <View style={twStyle("ml-3 flex-1 min-w-0")}>
                  <Text style={twStyle("font-semibold text-gray-900")} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-sm text-gray-600")}>
                    {c.type} · {c.status}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {c.sent_at
                      ? `Sent ${formatDateSafe(c.sent_at)}`
                      : c.scheduled_at
                        ? `Scheduled ${formatDateSafe(c.scheduled_at)}`
                        : `${c.total_recipients} recipients`}
                  </Text>
                </View>
                <View
                  style={twStyle(`rounded-full px-2.5 py-1 ${
                    c.status === "sent" ? "bg-green-100" : c.status === "draft" ? "bg-gray-100" : "bg-amber-100"
                  }`)}
                >
                  <Text
                    style={twStyle(`text-xs font-medium ${
                      c.status === "sent" ? "text-green-800" : c.status === "draft" ? "text-gray-700" : "text-amber-800"
                    }`)}
                  >
                    {c.status}
                  </Text>
                </View>
                {(c.status === "draft" || c.status === "scheduled") && (
                  <TouchableOpacity
                    onPress={() => sendCampaign(c.id)}
                    disabled={sendingId === c.id}
                    style={twStyle("ml-2 rounded-full bg-indigo-600 px-3 py-1.5")}
                  >
                    <Text style={twStyle("text-xs font-semibold text-white")}>
                      {sendingId === c.id ? "Sending..." : "Send"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}
        <BottomSheet
          visible={createOpen}
          onClose={() => !creating && setCreateOpen(false)}
          title="Create campaign"
          subtitle="Reach all clients via email, SMS, or WhatsApp"
        >
          <View style={twStyle("gap-3 pb-6")}>
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Campaign name</Text>
              <TextInput
                value={form.name}
                onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
                placeholder="e.g. March promo"
                placeholderTextColor="#9ca3af"
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
            </View>
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Channel</Text>
              <View style={twStyle("flex-row gap-2")}>
                {(["email", "sms", "whatsapp"] as const).map((channel) => (
                  <TouchableOpacity
                    key={channel}
                    onPress={() => setForm((p) => ({ ...p, type: channel }))}
                    style={twStyle(`rounded-xl px-3 py-2 ${form.type === channel ? "bg-indigo-600" : "border border-gray-200 bg-white"}`)}
                  >
                    <Text style={twStyle(`text-sm font-medium ${form.type === channel ? "text-white" : "text-gray-700"}`)}>
                      {channel.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {form.type === "email" && (
              <View>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Subject</Text>
                <TextInput
                  value={form.subject}
                  onChangeText={(t) => setForm((p) => ({ ...p, subject: t }))}
                  placeholder="Email subject"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
              </View>
            )}
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Message</Text>
              <TextInput
                value={form.content}
                onChangeText={(t) => setForm((p) => ({ ...p, content: t }))}
                placeholder="Write your campaign message..."
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
                style={twStyle("min-h-[110px] rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
            </View>
            <ActionButton
              label={creating ? "Creating..." : "Create draft"}
              onPress={createCampaign}
              loading={creating}
              disabled={creating}
              fullWidth
            />
          </View>
        </BottomSheet>
      </ScrollView>
  );
}

export default function MarketingScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Marketing" showBack subtitle="Campaigns & automation" />
      <MarketingCampaignsContent />
    </ScreenContainer>
  );
}
