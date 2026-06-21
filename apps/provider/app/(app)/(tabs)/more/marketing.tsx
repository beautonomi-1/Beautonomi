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
import { useMarketingCredits } from "@/lib/marketing/useMarketingCredits";
import { MarketingCreditsCard } from "@/components/marketing/MarketingCreditsCard";
import {
  AudienceSelector,
  type RecipientType,
  type SegmentCriteria,
  type AudienceValue,
} from "@/components/marketing/AudienceSelector";
import {
  CAMPAIGN_MERGE_TAGS,
  MERGE_TAG_PREVIEW_SAMPLE,
  substituteMergeTags,
} from "@/lib/marketing/campaign-merge-tags";

interface CampaignForm {
  name: string;
  type: "email" | "sms" | "whatsapp";
  subject: string;
  content: string;
  /** Optional ISO-8601 datetime string — saves as a scheduled draft. */
  scheduledAt: string;
  recipientType: RecipientType;
  segmentCriteria: SegmentCriteria;
  recipientIds: string[];
}

function emptyCampaignForm(): CampaignForm {
  return {
    name: "",
    type: "email",
    subject: "",
    content: "",
    scheduledAt: "",
    recipientType: "all_clients",
    segmentCriteria: {},
    recipientIds: [],
  };
}

interface CampaignCostEstimate {
  estimated_cost_zar: number;
  current_balance_zar: number;
  unit_cost_zar: number;
  recipients: number;
  sufficient: boolean;
  debited_on_platform_path: boolean;
}

const TOPUP_PRESETS_ZAR = [50, 100, 200, 500];

function formatZar(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `R${n.toFixed(2)}`;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  subject?: string | null;
  content?: string | null;
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
  const [editOpen, setEditOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignForm>(emptyCampaignForm);
  const [showPreview, setShowPreview] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("100");
  const credits = useMarketingCredits();
  const { data, loading, error, refresh } = useApi<CampaignsListPayload | Record<string, unknown>>(
    "/api/provider/campaigns?limit=50"
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), credits.refresh()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, credits]);

  const submitTopUp = useCallback(async () => {
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount < 10) {
      Alert.alert("Invalid amount", "Enter an amount of at least R10.");
      return;
    }
    const result = await credits.topUp(amount);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTopUpOpen(false);
      Alert.alert("Credits added", "Your marketing credit balance has been topped up.");
    } else if (!result.cancelled) {
      Alert.alert("Top-up not completed", result.message ?? "Please try again.");
    }
  }, [topUpAmount, credits]);

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
    if (form.recipientType === "custom" && form.recipientIds.length === 0) {
      Alert.alert("No recipients", "Pick at least one client, or choose a different audience.");
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
        recipient_type: form.recipientType,
        ...(form.recipientType === "segment" ? { segment_criteria: form.segmentCriteria } : {}),
        ...(form.recipientType === "custom" ? { recipient_ids: form.recipientIds } : {}),
        ...(scheduled_at ? { scheduled_at } : {}),
      });
      if (res.error || !res.data || typeof res.data !== "object" || !("id" in res.data)) {
        Alert.alert("Could not create campaign", getApiErrorMessage(res.error, "Try again."));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateOpen(false);
      setShowPreview(false);
      setForm(emptyCampaignForm());
      refresh();
    } catch (e: unknown) {
      Alert.alert("Could not create campaign", getApiErrorMessage(e, "Try again."));
    } finally {
      setCreating(false);
    }
  }, [form, refresh]);

  const sendTest = useCallback(async () => {
    const to = testRecipient.trim();
    if (!to) {
      Alert.alert("Add a test recipient", form.type === "email" ? "Enter an email address to send the test to." : "Enter a phone number to send the test to.");
      return;
    }
    if (!form.content.trim()) {
      Alert.alert("Nothing to send", "Add some message content first.");
      return;
    }
    setSendingTest(true);
    try {
      const res = await api.post<{ sent?: boolean; message?: string }>(
        "/api/provider/campaigns/test-send",
        {
          type: form.type,
          subject: form.type === "email" ? form.subject.trim() || "Test message" : undefined,
          content: form.content.trim(),
          to,
        },
      );
      if (res.error) {
        Alert.alert("Test not sent", getApiErrorMessage(res.error, "Try again."));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Test sent", `We sent a sample ${form.type.toUpperCase()} to ${to}.`);
      void credits.refresh();
    } catch (e: unknown) {
      Alert.alert("Test not sent", getApiErrorMessage(e, "Try again."));
    } finally {
      setSendingTest(false);
    }
  }, [testRecipient, form, credits]);

  const openEditCampaign = useCallback((campaign: Campaign) => {
    setEditingCampaignId(campaign.id);
    setForm({
      ...emptyCampaignForm(),
      name: campaign.name,
      type: (campaign.type as "email" | "sms" | "whatsapp") || "email",
      subject: campaign.subject ?? "",
      content: "",
      scheduledAt: campaign.scheduled_at ?? "",
    });
    void api.get<Campaign>(`/api/provider/campaigns/${campaign.id}`).then((res) => {
      if (res.data && typeof res.data === "object" && "content" in res.data) {
        setForm((prev) => ({
          ...prev,
          content: String((res.data as Campaign).content ?? ""),
          subject: String((res.data as Campaign).subject ?? prev.subject),
        }));
      }
    });
    setEditOpen(true);
  }, []);

  const saveCampaignEdit = useCallback(async () => {
    if (!editingCampaignId) return;
    if (!form.name.trim() || !form.content.trim()) {
      Alert.alert("Missing details", "Name and content are required.");
      return;
    }
    if (form.type === "email" && !form.subject.trim()) {
      Alert.alert("Missing subject", "Email campaigns require a subject.");
      return;
    }
    let scheduled_at: string | null = null;
    const rawSchedule = form.scheduledAt.trim();
    if (rawSchedule) {
      const parsed = Date.parse(rawSchedule);
      if (!Number.isFinite(parsed)) {
        Alert.alert("Invalid schedule", "Use a valid date/time.");
        return;
      }
      scheduled_at = new Date(parsed).toISOString();
    }
    setSavingEdit(true);
    try {
      const res = await api.patch<Campaign>(`/api/provider/campaigns/${editingCampaignId}`, {
        name: form.name.trim(),
        type: form.type,
        subject: form.type === "email" ? form.subject.trim() : undefined,
        content: form.content.trim(),
        scheduled_at,
      });
      if (res.error) {
        Alert.alert("Could not update campaign", getApiErrorMessage(res.error, "Try again."));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditOpen(false);
      setEditingCampaignId(null);
      refresh();
    } finally {
      setSavingEdit(false);
    }
  }, [editingCampaignId, form, refresh]);

  const deleteCampaign = useCallback(
    (campaign: Campaign) => {
      Alert.alert("Delete draft?", `Remove "${campaign.name}"? This cannot be undone.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const res = await api.delete(`/api/provider/campaigns/${campaign.id}`);
            if (res.error) {
              Alert.alert("Could not delete", getApiErrorMessage(res.error, "Try again."));
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            refresh();
          },
        },
      ]);
    },
    [refresh],
  );

  const performSend = useCallback(async (id: string) => {
    setSendingId(id);
    try {
      const res = await api.post<{ message?: string; sent_count?: number; failed_count?: number }>(`/api/provider/campaigns/${id}/send`, {});
      if (res.error) {
        Alert.alert("Could not send campaign", getApiErrorMessage(res.error, "Try again."));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const sent = res.data?.sent_count ?? 0;
      const failed = res.data?.failed_count ?? 0;
      Alert.alert(
        "Campaign sent",
        failed > 0
          ? `Delivered to ${sent} recipient${sent !== 1 ? "s" : ""}. ${failed} couldn't be delivered.`
          : `Delivered to ${sent} recipient${sent !== 1 ? "s" : ""}.`,
      );
      await Promise.all([refresh(), credits.refresh()]);
    } catch (e: unknown) {
      Alert.alert("Could not send campaign", getApiErrorMessage(e, "Try again."));
    } finally {
      setSendingId(null);
    }
  }, [refresh, credits]);

  // Gate sending behind a cost-aware confirmation. On the platform sending path
  // this shows the estimated credit cost and blocks (offering a top-up) when the
  // balance is short — matching the web portal and preventing partial sends.
  const confirmSend = useCallback(async (campaign: Campaign) => {
    const recipients = campaign.total_recipients ?? 0;
    const channelLabel = String(campaign.type || "").toUpperCase();
    const plural = recipients !== 1 ? "s" : "";

    let est: CampaignCostEstimate | null = null;
    try {
      const res = await api.get<CampaignCostEstimate>(
        `/api/provider/marketing/credits/estimate?channel=${encodeURIComponent(campaign.type)}&recipients=${Math.max(recipients, 1)}`,
      );
      if (!res.error && res.data) est = res.data;
    } catch {
      // Estimate is best-effort; fall back to a plain confirmation below.
    }

    if (est && est.debited_on_platform_path && est.estimated_cost_zar > 0) {
      if (!est.sufficient) {
        Alert.alert(
          "Not enough marketing credit",
          `This ${channelLabel} campaign to ${recipients} recipient${plural} costs about ${formatZar(est.estimated_cost_zar)}, but your balance is ${formatZar(est.current_balance_zar)}.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Top up", onPress: () => { setTopUpOpen(true); } },
          ],
        );
        return;
      }
      Alert.alert(
        "Send campaign?",
        `Send this ${channelLabel} campaign to ${recipients} recipient${plural} for about ${formatZar(est.estimated_cost_zar)} in marketing credit?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Send", onPress: () => { void performSend(campaign.id); } },
        ],
      );
      return;
    }

    Alert.alert(
      "Send campaign?",
      `Send this ${channelLabel} campaign to ${recipients} recipient${plural} now?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send", onPress: () => { void performSend(campaign.id); } },
      ],
    );
  }, [performSend]);

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
        <MarketingCreditsCard
          status={credits.status}
          ledger={credits.ledger}
          loading={credits.loading}
          creditsApply={credits.creditsApply}
          onTopUp={() => setTopUpOpen(true)}
        />
        <View style={twStyle("mb-3 flex-row items-center justify-end")}>
          <TouchableOpacity
            onPress={() => {
              setForm(emptyCampaignForm());
              setShowPreview(false);
              setTestRecipient("");
              setCreateOpen(true);
            }}
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
              Create email, SMS or WhatsApp campaigns to reach all your clients. You&apos;ll see the estimated credit cost before each campaign sends.
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
              const canEditDraft = c.status === "draft" || c.status === "scheduled";
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
                      No clients match this campaign yet — add clients or choose a different audience in Clients.
                    </Text>
                  ) : null}
                </View>
                <View style={twStyle(`rounded-full px-2.5 py-1 ${st.wrap}`)}>
                  <Text style={twStyle(`text-xs font-medium ${st.text}`)}>
                    {c.status}
                  </Text>
                </View>
                {canEditDraft ? (
                  <View style={twStyle("ml-2 items-end gap-1")}>
                    <TouchableOpacity
                      onPress={() => openEditCampaign(c)}
                      style={twStyle("rounded-full border border-gray-200 bg-white px-3 py-1.5")}
                    >
                      <Text style={twStyle("text-xs font-semibold text-gray-700")}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteCampaign(c)}>
                      <Text style={twStyle("text-xs font-medium text-red-600")}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {canSendNow ? (
                  <TouchableOpacity
                    onPress={() => confirmSend(c)}
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
              <View style={twStyle("mt-2 flex-row flex-wrap gap-2")}>
                {CAMPAIGN_MERGE_TAGS.map((t) => (
                  <TouchableOpacity
                    key={t.tag}
                    onPress={() => setForm((p) => ({ ...p, content: `${p.content}${t.tag}` }))}
                    style={twStyle("rounded-full border border-gray-200 bg-gray-50 px-3 py-1")}
                  >
                    <Text style={twStyle("text-xs font-medium text-gray-600")}>+ {t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                Tap a tag to personalise. We swap them per recipient on send.
              </Text>
            </View>

            <AudienceSelector
              value={{
                recipientType: form.recipientType,
                segmentCriteria: form.segmentCriteria,
                recipientIds: form.recipientIds,
              }}
              onChange={(next: AudienceValue) =>
                setForm((p) => ({
                  ...p,
                  recipientType: next.recipientType,
                  segmentCriteria: next.segmentCriteria,
                  recipientIds: next.recipientIds,
                }))
              }
            />

            <View>
              <TouchableOpacity
                onPress={() => setShowPreview((v) => !v)}
                style={twStyle("flex-row items-center")}
              >
                <Ionicons
                  name={showPreview ? "eye-off-outline" : "eye-outline"}
                  size={16}
                  color="#4338ca"
                  style={{ marginRight: 6 }}
                />
                <Text style={twStyle("text-sm font-semibold text-indigo-800")}>
                  {showPreview ? "Hide preview" : "Preview message"}
                </Text>
              </TouchableOpacity>
              {showPreview ? (
                <View style={twStyle("mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
                  {form.type === "email" ? (
                    <Text style={twStyle("mb-1 text-sm font-semibold text-gray-900")}>
                      {substituteMergeTags(form.subject || "Email subject", MERGE_TAG_PREVIEW_SAMPLE)}
                    </Text>
                  ) : null}
                  <Text style={twStyle("text-sm text-gray-700")}>
                    {substituteMergeTags(form.content || "Your message preview appears here…", MERGE_TAG_PREVIEW_SAMPLE)}
                  </Text>
                  <Text style={twStyle("mt-2 text-[11px] text-gray-400")}>
                    Sample shown for {MERGE_TAG_PREVIEW_SAMPLE.customer_name}.
                  </Text>
                </View>
              ) : null}
            </View>

            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Send a test</Text>
              <View style={twStyle("flex-row items-center gap-2")}>
                <TextInput
                  value={testRecipient}
                  onChangeText={setTestRecipient}
                  placeholder={form.type === "email" ? "you@example.com" : "+27 82 000 0000"}
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={form.type === "email" ? "email-address" : "phone-pad"}
                  style={twStyle("flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
                <TouchableOpacity
                  onPress={sendTest}
                  disabled={sendingTest}
                  style={twStyle(`rounded-xl px-4 py-3 ${sendingTest ? "bg-indigo-300" : "bg-indigo-600"}`)}
                >
                  <Text style={twStyle("text-sm font-semibold text-white")}>
                    {sendingTest ? "Sending…" : "Test"}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                Sends one real message so you can check formatting{credits.creditsApply ? " (uses 1 credit)" : ""}.
              </Text>
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
        <BottomSheet
          visible={editOpen}
          onClose={() => {
            if (savingEdit) return;
            setEditOpen(false);
            setEditingCampaignId(null);
            setForm(emptyCampaignForm());
          }}
          title="Edit campaign"
          subtitle="Draft and scheduled campaigns can be updated before sending"
        >
          <View style={twStyle("gap-3 pb-6")}>
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Campaign name</Text>
              <TextInput
                value={form.name}
                onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
            </View>
            {form.type === "email" ? (
              <View>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Subject</Text>
                <TextInput
                  value={form.subject}
                  onChangeText={(t) => setForm((p) => ({ ...p, subject: t }))}
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
              </View>
            ) : null}
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Message</Text>
              <TextInput
                value={form.content}
                onChangeText={(t) => setForm((p) => ({ ...p, content: t }))}
                multiline
                textAlignVertical="top"
                style={twStyle("min-h-[110px] rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
            </View>
            <ActionButton
              label={savingEdit ? "Saving…" : "Save changes"}
              onPress={saveCampaignEdit}
              loading={savingEdit}
              disabled={savingEdit}
              fullWidth
            />
          </View>
        </BottomSheet>
        <BottomSheet
          visible={topUpOpen}
          onClose={() => !credits.toppingUp && setTopUpOpen(false)}
          title="Top up marketing credit"
          subtitle="Prepaid credit funds email, SMS and WhatsApp campaigns sent via Beautonomi."
        >
          <View style={twStyle("gap-4 pb-6")}>
            <View>
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Choose an amount</Text>
              <View style={twStyle("flex-row flex-wrap gap-2")}>
                {TOPUP_PRESETS_ZAR.map((preset) => {
                  const active = topUpAmount === String(preset);
                  return (
                    <TouchableOpacity
                      key={preset}
                      onPress={() => setTopUpAmount(String(preset))}
                      style={twStyle(`rounded-xl px-4 py-2 ${active ? "bg-indigo-600" : "border border-gray-200 bg-white"}`)}
                    >
                      <Text style={twStyle(`text-sm font-semibold ${active ? "text-white" : "text-gray-700"}`)}>
                        {formatZar(preset)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Or enter an amount (ZAR)</Text>
              <TextInput
                value={topUpAmount}
                onChangeText={(t) => setTopUpAmount(t.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor="#9ca3af"
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>Minimum R10. Paid securely via Paystack.</Text>
            </View>
            <ActionButton
              label={credits.toppingUp ? "Opening payment…" : `Top up ${formatZar(Number(topUpAmount) || 0)}`}
              onPress={submitTopUp}
              loading={credits.toppingUp}
              disabled={credits.toppingUp || !(Number(topUpAmount) >= 10)}
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
