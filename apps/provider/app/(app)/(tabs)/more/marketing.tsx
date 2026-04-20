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
import { getApiErrorMessage } from "@/lib/api-error";
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
  subject?: string | null;
  status: string;
  recipient_type?: string;
  total_recipients: number;
  sent_count?: number;
  scheduled_at?: string | null;
  sent_at?: string | null;
  created_at: string;
}

/** Paginated list from GET /api/provider/campaigns (wrapped in successResponse for mobile client). */
interface CampaignsListPayload {
  items: Campaign[];
  total: number;
  page?: number;
  limit?: number;
  has_more?: boolean;
}

function normalizeCampaignsList(raw: unknown): CampaignsListPayload {
  if (raw == null) return { items: [], total: 0 };
  if (Array.isArray(raw)) {
    const arr = raw as Campaign[];
    return { items: arr, total: arr.length };
  }
  if (typeof raw !== "object") return { items: [], total: 0 };
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.items)) {
    const items = o.items as Campaign[];
    return {
      items,
      total: typeof o.total === "number" ? o.total : items.length,
      page: typeof o.page === "number" ? o.page : undefined,
      limit: typeof o.limit === "number" ? o.limit : undefined,
      has_more: typeof o.has_more === "boolean" ? o.has_more : undefined,
    };
  }
  return { items: [], total: 0 };
}

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function campaignStatusStyles(status: string): { wrap: string; text: string } {
  switch (status) {
    case "sent":
      return { wrap: "bg-green-100", text: "text-green-800" };
    case "draft":
      return { wrap: "bg-gray-100", text: "text-gray-700" };
    case "scheduled":
      return { wrap: "bg-sky-100", text: "text-sky-900" };
    case "sending":
      return { wrap: "bg-amber-100", text: "text-amber-900" };
    case "cancelled":
      return { wrap: "bg-red-50", text: "text-red-800" };
    default:
      return { wrap: "bg-amber-100", text: "text-amber-800" };
  }
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
    /** Optional ISO-8601 datetime string (e.g. 2026-05-01T09:00:00) — saves as scheduled draft */
    scheduledAt: "",
  });
  const { data, loading, error, refresh } = useApi<CampaignsListPayload | Record<string, unknown>>(
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

  const { items: campaigns, total } = normalizeCampaignsList(data);

  const createCampaign = useCallback(async () => {
    if (!form.name.trim() || !form.content.trim()) {
      Alert.alert("Missing details", "Name and content are required.");
      return;
    }
    if (form.type === "email" && !form.subject.trim()) {
      Alert.alert("Missing subject", "Email campaigns require a subject.");
      return;
    }
    let scheduled_at: string | undefined;
    const rawSchedule = form.scheduledAt.trim();
    if (rawSchedule) {
      const parsed = Date.parse(rawSchedule);
      if (!Number.isFinite(parsed)) {
        Alert.alert("Invalid schedule", "Use a valid date/time (e.g. 2026-05-01T09:00:00 or your device locale format).");
        return;
      }
      scheduled_at = new Date(parsed).toISOString();
    }
    setCreating(true);
    try {
      const res = await api.post<Campaign>("/api/provider/campaigns", {
        name: form.name.trim(),
        type: form.type,
        subject: form.type === "email" ? form.subject.trim() : undefined,
        content: form.content.trim(),
        recipient_type: "all_clients",
        ...(scheduled_at ? { scheduled_at } : {}),
      });
      if (res.error || !res.data || typeof res.data !== "object" || !("id" in res.data)) {
        Alert.alert("Could not create campaign", getApiErrorMessage(res.error, "Try again."));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateOpen(false);
      setForm({ name: "", type: "email", subject: "", content: "", scheduledAt: "" });
      refresh();
    } catch (e: unknown) {
      Alert.alert("Could not create campaign", getApiErrorMessage(e, "Try again."));
    } finally {
      setCreating(false);
    }
  }, [form, refresh]);

  const sendCampaign = useCallback(async (id: string) => {
    setSendingId(id);
    try {
      const res = await api.post<{ message?: string; sent_count?: number }>(`/api/provider/campaigns/${id}/send`, {});
      if (res.error) {
        Alert.alert("Could not send campaign", getApiErrorMessage(res.error, "Try again."));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    } catch (e: unknown) {
      Alert.alert("Could not send campaign", getApiErrorMessage(e, "Try again."));
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
            {campaigns.map((c) => {
              const st = campaignStatusStyles(c.status);
              const canSendNow =
                (c.status === "draft" || c.status === "scheduled") && (c.total_recipients ?? 0) > 0;
              return (
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
                    {c.type}
                    {c.recipient_type ? ` · ${String(c.recipient_type).replace(/_/g, " ")}` : ""}
                  </Text>
                  {c.type === "email" && c.subject ? (
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")} numberOfLines={1}>
                      Subject: {c.subject}
                    </Text>
                  ) : null}
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {c.sent_at
                      ? `Sent ${formatDateSafe(c.sent_at)} · ${c.sent_count ?? 0}/${Math.max(c.total_recipients ?? 0, 1)} delivered`
                      : c.scheduled_at
                        ? `Scheduled ${formatDateSafe(c.scheduled_at)} · ${c.total_recipients ?? 0} recipients`
                        : `${c.total_recipients ?? 0} recipient${(c.total_recipients ?? 0) !== 1 ? "s" : ""}`}
                  </Text>
                  {(c.total_recipients ?? 0) === 0 && (c.status === "draft" || c.status === "scheduled") ? (
                    <Text style={twStyle("mt-1 text-xs text-amber-700")}>
                      No clients match this campaign yet — add clients or pick a different audience on the web portal.
                    </Text>
                  ) : null}
                </View>
                <View style={twStyle(`rounded-full px-2.5 py-1 ${st.wrap}`)}>
                  <Text style={twStyle(`text-xs font-medium ${st.text}`)}>
                    {c.status}
                  </Text>
                </View>
                {canSendNow ? (
                  <TouchableOpacity
                    onPress={() => sendCampaign(c.id)}
                    disabled={sendingId === c.id}
                    style={twStyle("ml-2 rounded-full bg-indigo-600 px-3 py-1.5")}
                  >
                    <Text style={twStyle("text-xs font-semibold text-white")}>
                      {sendingId === c.id ? "Sending..." : "Send"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
            })}
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
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Schedule send (optional)</Text>
              <TextInput
                value={form.scheduledAt}
                onChangeText={(t) => setForm((p) => ({ ...p, scheduledAt: t }))}
                placeholder="e.g. 2026-05-01T09:00:00 — leave empty for draft now"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                When set, the campaign is saved as scheduled; tap Send on the list to deliver (same as web).
              </Text>
            </View>
            <ActionButton
              label={
                creating
                  ? "Creating..."
                  : form.scheduledAt.trim()
                    ? "Create scheduled campaign"
                    : "Create draft"
              }
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
