import { useCallback, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
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
import { useRouter } from "expo-router";
import { showPlanGateAlert } from "@/lib/plan-gate";
import { useMarketingCredits } from "@/lib/marketing/useMarketingCredits";
import { MarketingCreditsCard } from "@/components/marketing/MarketingCreditsCard";
import { shouldUseAppleIap } from "@/lib/iap/platform";
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
import { formatMoney } from "@beautonomi/utils";

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
  return formatMoney(n, "ZAR");
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
function channelLabel(type: string, m: (key: string, opts?: Record<string, unknown>) => string): string {
  if (type === "email") return m("channelEmail");
  if (type === "sms") return m("channelSms");
  if (type === "whatsapp") return m("channelWhatsapp");
  return type.toUpperCase();
}

function typeLabel(type: string, m: (key: string, opts?: Record<string, unknown>) => string): string {
  if (type === "email") return m("typeEmail");
  if (type === "sms") return m("typeSms");
  if (type === "whatsapp") return m("typeWhatsapp");
  return type;
}

function statusLabel(status: string, m: (key: string, opts?: Record<string, unknown>) => string): string {
  if (status === "sent") return m("statusSent");
  if (status === "draft") return m("statusDraft");
  if (status === "scheduled") return m("statusScheduled");
  if (status === "sending") return m("statusSending");
  if (status === "cancelled") return m("statusCancelled");
  return status;
}

function audienceLabel(value: string, m: (key: string, opts?: Record<string, unknown>) => string): string {
  if (value === "all_clients") return m("audienceAllClients");
  if (value === "segment") return m("audienceSegment");
  if (value === "custom") return m("audienceCustom");
  return value.replace(/_/g, " ");
}

export function MarketingCampaignsContent() {
  const { t } = useTranslation();
  const m = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.marketing.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
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
      Alert.alert(m("invalidAmountTitle"), m("invalidAmountBody"));
      return;
    }
    const result = await credits.topUp(amount);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTopUpOpen(false);
      Alert.alert(m("creditsAddedTitle"), m("creditsAddedBody"));
    } else if (!result.cancelled) {
      Alert.alert(m("topUpFailedTitle"), result.message ?? m("tryAgain"));
    }
  }, [topUpAmount, credits]);

  const { items: campaigns, total } = normalizeCampaignsList(data);

  const createCampaign = useCallback(async () => {
    if (!form.name.trim() || !form.content.trim()) {
      Alert.alert(m("missingDetailsTitle"), m("missingDetailsBody"));
      return;
    }
    if (form.type === "email" && !form.subject.trim()) {
      Alert.alert(m("missingSubjectTitle"), m("missingSubjectBody"));
      return;
    }
    if (form.recipientType === "custom" && form.recipientIds.length === 0) {
      Alert.alert(m("noRecipientsTitle"), m("noRecipientsBody"));
      return;
    }
    let scheduled_at: string | undefined;
    const rawSchedule = form.scheduledAt.trim();
    if (rawSchedule) {
      const parsed = Date.parse(rawSchedule);
      if (!Number.isFinite(parsed)) {
        Alert.alert(m("invalidScheduleTitle"), m("invalidScheduleBody"));
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
        const msg = getApiErrorMessage(res.error, m("tryAgainShort"));
        const code = (res.error as { code?: string } | undefined)?.code;
        showPlanGateAlert({ title: m("createFailedTitle"), message: msg, errorCode: code, router });
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateOpen(false);
      setShowPreview(false);
      setForm(emptyCampaignForm());
      refresh();
    } catch (e: unknown) {
      showPlanGateAlert({
        title: m("createFailedTitle"),
        message: getApiErrorMessage(e, m("tryAgainShort")),
        errorCode: (e as { code?: string } | undefined)?.code,
        router,
      });
    } finally {
      setCreating(false);
    }
  }, [form, refresh, router]);

  const sendTest = useCallback(async () => {
    const to = testRecipient.trim();
    if (!to) {
      Alert.alert(m("addTestRecipientTitle"), form.type === "email" ? m("addTestRecipientEmail") : m("addTestRecipientPhone"));
      return;
    }
    if (!form.content.trim()) {
      Alert.alert(m("nothingToSendTitle"), m("nothingToSendBody"));
      return;
    }
    setSendingTest(true);
    try {
      const res = await api.post<{ sent?: boolean; message?: string }>(
        "/api/provider/campaigns/test-send",
        {
          type: form.type,
          subject: form.type === "email" ? form.subject.trim() || m("testSubjectFallback") : undefined,
          content: form.content.trim(),
          to,
        },
      );
      if (res.error) {
        showPlanGateAlert({
          title: m("testNotSentTitle"),
          message: getApiErrorMessage(res.error, m("tryAgainShort")),
          errorCode: (res.error as { code?: string } | undefined)?.code,
          router,
        });
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(m("testSentTitle"), m("testSentBody", { channel: channelLabel(form.type, m), to }));
      void credits.refresh();
    } catch (e: unknown) {
      showPlanGateAlert({
        title: m("testNotSentTitle"),
        message: getApiErrorMessage(e, m("tryAgainShort")),
        errorCode: (e as { code?: string } | undefined)?.code,
        router,
      });
    } finally {
      setSendingTest(false);
    }
  }, [testRecipient, form, credits, router]);

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
      Alert.alert(m("missingDetailsTitle"), m("missingDetailsBody"));
      return;
    }
    if (form.type === "email" && !form.subject.trim()) {
      Alert.alert(m("missingSubjectTitle"), m("missingSubjectBody"));
      return;
    }
    let scheduled_at: string | null = null;
    const rawSchedule = form.scheduledAt.trim();
    if (rawSchedule) {
      const parsed = Date.parse(rawSchedule);
      if (!Number.isFinite(parsed)) {
        Alert.alert(m("invalidScheduleTitle"), m("invalidScheduleShort"));
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
        Alert.alert(m("updateFailedTitle"), getApiErrorMessage(res.error, m("tryAgainShort")));
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
      Alert.alert(m("deleteDraftTitle"), m("deleteDraftBody", { name: campaign.name }), [
        { text: m("cancel"), style: "cancel" },
        {
          text: m("delete"),
          style: "destructive",
          onPress: async () => {
            const res = await api.delete(`/api/provider/campaigns/${campaign.id}`);
            if (res.error) {
              Alert.alert(m("deleteFailedTitle"), getApiErrorMessage(res.error, m("tryAgainShort")));
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
        showPlanGateAlert({
          title: m("sendFailedTitle"),
          message: getApiErrorMessage(res.error, m("tryAgainShort")),
          errorCode: (res.error as { code?: string } | undefined)?.code,
          router,
        });
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const sent = res.data?.sent_count ?? 0;
      const failed = res.data?.failed_count ?? 0;
      Alert.alert(
        m("campaignSentTitle"),
        failed > 0
          ? m("campaignSentPartial", { count: sent, failed })
          : m("campaignSentOk", { count: sent }),
      );
      await Promise.all([refresh(), credits.refresh()]);
    } catch (e: unknown) {
      showPlanGateAlert({
        title: m("sendFailedTitle"),
        message: getApiErrorMessage(e, m("tryAgainShort")),
        errorCode: (e as { code?: string } | undefined)?.code,
        router,
      });
    } finally {
      setSendingId(null);
    }
  }, [refresh, credits, router]);

  // Gate sending behind a cost-aware confirmation. On the platform sending path
  // this shows the estimated credit cost and blocks (offering a top-up) when the
  // balance is short — matching the web portal and preventing partial sends.
  const confirmSend = useCallback(async (campaign: Campaign) => {
    const recipients = campaign.total_recipients ?? 0;
    const channel = channelLabel(String(campaign.type || ""), m);

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
          m("insufficientCreditTitle"),
          `${m("insufficientCredit", {
            channel,
            count: recipients,
            cost: formatZar(est.estimated_cost_zar),
            balance: formatZar(est.current_balance_zar),
          })}${shouldUseAppleIap() ? m("insufficientCreditIos") : ""}`,
          shouldUseAppleIap()
            ? [{ text: m("ok"), style: "cancel" }]
            : [
                { text: m("cancel"), style: "cancel" },
                { text: m("topUp"), onPress: () => { setTopUpOpen(true); } },
              ],
        );
        return;
      }
      Alert.alert(
        m("sendConfirmTitle"),
        m("sendConfirmWithCost", {
          channel,
          count: recipients,
          cost: formatZar(est.estimated_cost_zar),
        }),
        [
          { text: m("cancel"), style: "cancel" },
          { text: m("send"), onPress: () => { void performSend(campaign.id); } },
        ],
      );
      return;
    }

    Alert.alert(
      m("sendConfirmTitle"),
      m("sendConfirmNow", { channel, count: recipients }),
      [
        { text: m("cancel"), style: "cancel" },
        { text: m("send"), onPress: () => { void performSend(campaign.id); } },
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
          onTopUp={shouldUseAppleIap() ? undefined : () => setTopUpOpen(true)}
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
            <Ionicons name="add" size={16} color="#4338ca" style={{ marginEnd: 6 }} />
            <Text style={twStyle("text-sm font-semibold text-indigo-800")}>{m("createCampaign")}</Text>
          </TouchableOpacity>
        </View>
        {campaigns.length === 0 ? (
          <View style={twStyle("items-center rounded-2xl border border-gray-100 bg-gray-50/50 p-8")}>
            <View style={twStyle("mb-4 h-16 w-16 items-center justify-center rounded-full bg-red-100")}>
              <Ionicons name="megaphone-outline" size={32} color="#ef4444" />
            </View>
            <Text style={twStyle("text-center font-semibold text-gray-900")}>{m("emptyTitle")}</Text>
            <Text style={twStyle("mt-2 text-center text-sm text-gray-500")}>
              {m("emptyBody")}
            </Text>
          </View>
        ) : (
          <>
            <Text style={twStyle("mb-3 text-sm text-gray-500")}>
              {m("campaignCount", { count: total })}
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
                <View style={twStyle("ms-3 flex-1 min-w-0")}>
                  <Text style={twStyle("font-semibold text-gray-900")} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-sm text-gray-600")}>
                    {typeLabel(c.type, m)}
                    {c.recipient_type ? ` · ${audienceLabel(String(c.recipient_type), m)}` : ""}
                  </Text>
                  {c.type === "email" && c.subject ? (
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")} numberOfLines={1}>
                      {m("subjectLine", { subject: c.subject })}
                    </Text>
                  ) : null}
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {c.sent_at
                      ? m("sentMeta", {
                          date: formatDateSafe(c.sent_at),
                          sent: c.sent_count ?? 0,
                          total: Math.max(c.total_recipients ?? 0, 1),
                        })
                      : c.scheduled_at
                        ? m("scheduledMeta", {
                            date: formatDateSafe(c.scheduled_at),
                            count: c.total_recipients ?? 0,
                          })
                        : m("recipientsMeta", { count: c.total_recipients ?? 0 })}
                  </Text>
                  {(c.total_recipients ?? 0) === 0 && (c.status === "draft" || c.status === "scheduled") ? (
                    <Text style={twStyle("mt-1 text-xs text-amber-700")}>
                      {m("noMatchingClients")}
                    </Text>
                  ) : null}
                </View>
                <View style={twStyle(`rounded-full px-2.5 py-1 ${st.wrap}`)}>
                  <Text style={twStyle(`text-xs font-medium ${st.text}`)}>
                    {statusLabel(c.status, m)}
                  </Text>
                </View>
                {canEditDraft ? (
                  <View style={twStyle("ms-2 items-end gap-1")}>
                    <TouchableOpacity
                      onPress={() => openEditCampaign(c)}
                      style={twStyle("rounded-full border border-gray-200 bg-white px-3 py-1.5")}
                    >
                      <Text style={twStyle("text-xs font-semibold text-gray-700")}>{m("edit")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteCampaign(c)}>
                      <Text style={twStyle("text-xs font-medium text-red-600")}>{m("delete")}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {canSendNow ? (
                  <TouchableOpacity
                    onPress={() => confirmSend(c)}
                    disabled={sendingId === c.id}
                    style={twStyle("ms-2 rounded-full bg-indigo-600 px-3 py-1.5")}
                  >
                    <Text style={twStyle("text-xs font-semibold text-white")}>
                      {sendingId === c.id ? m("sending") : m("send")}
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
          title={m("createCampaign")}
          subtitle={m("createSheetSubtitle")}
        >
          <View style={twStyle("gap-3 pb-6")}>
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{m("campaignName")}</Text>
              <TextInput
                value={form.name}
                onChangeText={(text) => setForm((p) => ({ ...p, name: text }))}
                placeholder={m("namePlaceholder")}
                placeholderTextColor="#9ca3af"
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
            </View>
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{m("channel")}</Text>
              <View style={twStyle("flex-row gap-2")}>
                {(["email", "sms", "whatsapp"] as const).map((channel) => (
                  <TouchableOpacity
                    key={channel}
                    onPress={() => setForm((p) => ({ ...p, type: channel }))}
                    style={twStyle(`rounded-xl px-3 py-2 ${form.type === channel ? "bg-indigo-600" : "border border-gray-200 bg-white"}`)}
                  >
                    <Text style={twStyle(`text-sm font-medium ${form.type === channel ? "text-white" : "text-gray-700"}`)}>
                      {channelLabel(channel, m)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {form.type === "email" && (
              <View>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{m("subject")}</Text>
                <TextInput
                  value={form.subject}
                  onChangeText={(text) => setForm((p) => ({ ...p, subject: text }))}
                  placeholder={m("subjectPlaceholder")}
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
              </View>
            )}
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{m("message")}</Text>
              <TextInput
                value={form.content}
                onChangeText={(text) => setForm((p) => ({ ...p, content: text }))}
                placeholder={m("messagePlaceholder")}
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
                {m("mergeTagsHint")}
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
                  style={{ marginEnd: 6 }}
                />
                <Text style={twStyle("text-sm font-semibold text-indigo-800")}>
                  {showPreview ? m("hidePreview") : m("previewMessage")}
                </Text>
              </TouchableOpacity>
              {showPreview ? (
                <View style={twStyle("mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
                  {form.type === "email" ? (
                    <Text style={twStyle("mb-1 text-sm font-semibold text-gray-900")}>
                      {substituteMergeTags(form.subject || m("subjectPlaceholder"), MERGE_TAG_PREVIEW_SAMPLE)}
                    </Text>
                  ) : null}
                  <Text style={twStyle("text-sm text-gray-700")}>
                    {substituteMergeTags(form.content || m("previewEmpty"), MERGE_TAG_PREVIEW_SAMPLE)}
                  </Text>
                  <Text style={twStyle("mt-2 text-[11px] text-gray-400")}>
                    {m("previewSample", { name: MERGE_TAG_PREVIEW_SAMPLE.customer_name })}
                  </Text>
                </View>
              ) : null}
            </View>

            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{m("sendATest")}</Text>
              <View style={twStyle("flex-row items-center gap-2")}>
                <TextInput
                  value={testRecipient}
                  onChangeText={setTestRecipient}
                  placeholder={form.type === "email" ? m("testEmailPlaceholder") : m("testPhonePlaceholder")}
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
                    {sendingTest ? m("sendingEllipsis") : m("test")}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                {credits.creditsApply ? m("testHintWithCredit") : m("testHint")}
              </Text>
            </View>

            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{m("scheduleOptional")}</Text>
              <TextInput
                value={form.scheduledAt}
                onChangeText={(text) => setForm((p) => ({ ...p, scheduledAt: text }))}
                placeholder={m("schedulePlaceholder")}
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                {m("scheduleHint")}
              </Text>
            </View>
            <ActionButton
              label={
                creating
                  ? m("creating")
                  : form.scheduledAt.trim()
                    ? m("createScheduled")
                    : m("createDraft")
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
          title={m("editTitle")}
          subtitle={m("editSubtitle")}
        >
          <View style={twStyle("gap-3 pb-6")}>
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{m("campaignName")}</Text>
              <TextInput
                value={form.name}
                onChangeText={(text) => setForm((p) => ({ ...p, name: text }))}
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
            </View>
            {form.type === "email" ? (
              <View>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{m("subject")}</Text>
                <TextInput
                  value={form.subject}
                  onChangeText={(text) => setForm((p) => ({ ...p, subject: text }))}
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
              </View>
            ) : null}
            <View>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{m("message")}</Text>
              <TextInput
                value={form.content}
                onChangeText={(text) => setForm((p) => ({ ...p, content: text }))}
                multiline
                textAlignVertical="top"
                style={twStyle("min-h-[110px] rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
            </View>
            <ActionButton
              label={savingEdit ? m("saving") : m("saveChanges")}
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
          title={m("topUpTitle")}
          subtitle={m("topUpSubtitle")}
        >
          <View style={twStyle("gap-4 pb-6")}>
            <View>
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{m("chooseAmount")}</Text>
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
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{m("enterAmountZar")}</Text>
              <TextInput
                value={topUpAmount}
                onChangeText={(t) => setTopUpAmount(t.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor="#9ca3af"
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
              />
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>{m("minPaystack")}</Text>
            </View>
            <ActionButton
              label={credits.toppingUp ? m("openingPayment") : m("topUpAmountCta", { amount: formatZar(Number(topUpAmount) || 0) })}
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
  const { t } = useTranslation();
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title={t("provider.mobile.screens.marketing.title")} showBack subtitle={t("provider.mobile.screens.marketing.subtitle")} />
      <MarketingCampaignsContent />
    </ScreenContainer>
  );
}
