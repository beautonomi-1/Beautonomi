/**
 * Card machines hub — PayCloud terminal management for in-person card payments.
 */
import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  usePayCloudTerminals,
  usePayCloudSettings,
  type PayCloudTerminal,
} from "@/hooks/usePayCloud";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { twStyle } from "@/lib/twStyle";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePaycloudFeatureEnabled } from "@/hooks/usePaycloudFeatureEnabled";
import { useProviderStackBack } from "@/lib/provider-tab-navigation";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
import {
  canLaunchPaycloudSameTerminal,
  getPaycloudDeviceInfo,
} from "@/lib/paycloud-same-terminal";

interface Location {
  id: string;
  name: string;
}

type ReconciliationPayment = {
  id: string;
  merchant_order_no: string;
  amount: number;
  currency: string;
  status: string;
  amount_match_status: string | null;
  created_at: string;
};

type PendingTerminalOrder = {
  id: string;
  invoice_status: string;
  integration_setup_status?: string | null;
  terminal_products?: { name?: string; vendor?: string };
};

type MerchantApplicationSummary = {
  id: string;
  application_no: string;
  status: string;
};

const SETUP_STEP_CODES = [
  "FLAG_OFF",
  "PLAN_REQUIRED",
  "NOT_ACCEPTED",
  "NO_TERMINALS",
  "ALL_SUSPENDED",
  "NO_MERCHANT",
  "NO_CREDENTIALS",
] as const;

const SETUP_STEP_LABEL_KEYS: Record<(typeof SETUP_STEP_CODES)[number], string> = {
  FLAG_OFF: "flagOff",
  PLAN_REQUIRED: "planRequired",
  NOT_ACCEPTED: "notAccepted",
  NO_TERMINALS: "noTerminals",
  ALL_SUSPENDED: "allSuspended",
  NO_MERCHANT: "noMerchant",
  NO_CREDENTIALS: "noCredentials",
};

const KNOWN_SETUP_CODES = new Set<string>(SETUP_STEP_CODES);

export default function CardMachinesScreen() {
  const { t } = useTranslation();
  const cm = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.cardMachines.${key}`, opts) as string,
    [t],
  );

  const formatLastUsedShort = useCallback(
    (iso: string): string => {
      const ms = Date.parse(iso);
      if (!Number.isFinite(ms)) return cm("lastUsedRecent");
      const diff = Math.max(0, Date.now() - ms);
      const mins = Math.round(diff / 60_000);
      if (mins < 1) return cm("lastUsedJustNow");
      if (mins < 60) return cm("lastUsedMinutes", { count: mins });
      const hours = Math.round(mins / 60);
      if (hours < 24) return cm("lastUsedHours", { count: hours });
      const days = Math.round(hours / 24);
      if (days < 30) return cm("lastUsedDays", { count: days });
      const months = Math.round(days / 30);
      return cm("lastUsedMonths", { count: months });
    },
    [cm],
  );

  const router = useRouter();
  const handleBack = useProviderStackBack();
  const { order: orderParam, order_id: orderIdParam } = useLocalSearchParams<{
    order?: string;
    order_id?: string;
  }>();
  const activationOrderId =
    (Array.isArray(orderParam) ? orderParam[0] : orderParam) ||
    (Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam) ||
    null;
  const paycloudEnabled = usePaycloudFeatureEnabled();
  const sameTerminalFlag = useFeatureFlag("payment_paycloud_same_terminal");
  const qrFlagEnabled = useFeatureFlag("payment_paycloud_qr");
  const cashbackFlagEnabled = useFeatureFlag("payment_paycloud_cashback");
  const terminalEcommerceEnabled = useFeatureFlag("terminal_ecommerce_enabled");
  const terminalCatalogEnabled = useFeatureFlag("terminal_product_catalog_enabled");
  const terminalShopEnabled = terminalEcommerceEnabled || terminalCatalogEnabled;

  const {
    terminals,
    loading: terminalsLoading,
    error: terminalsError,
    reload: reloadTerminals,
    addTerminal,
    updateTerminal,
    deleteTerminal,
  } = usePayCloudTerminals();
  const {
    settings,
    loading: settingsLoading,
    error: settingsError,
    updateSettings,
    reload: reloadSettings,
  } = usePayCloudSettings();
  const { data: locations } = useApi<Location[]>("/api/provider/locations");

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editTerminal, setEditTerminal] = useState<PayCloudTerminal | null>(null);
  const [formName, setFormName] = useState("");
  const [formSerial, setFormSerial] = useState("");
  const [formLocationId, setFormLocationId] = useState<string | null>(null);
  const [formActive, setFormActive] = useState(true);
  const [savingAccept, setSavingAccept] = useState(false);
  const [savingQr, setSavingQr] = useState(false);
  const [savingCashback, setSavingCashback] = useState(false);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileExceptions, setReconcileExceptions] = useState(0);
  const [recentPayments, setRecentPayments] = useState<ReconciliationPayment[]>([]);
  const [pendingOrder, setPendingOrder] = useState<PendingTerminalOrder | null>(null);
  const [merchantApplication, setMerchantApplication] = useState<MerchantApplicationSummary | null>(null);
  const [activationSerial, setActivationSerial] = useState("");
  const [activationName, setActivationName] = useState("");
  const [activating, setActivating] = useState(false);
  const [sameDeviceAvailable, setSameDeviceAvailable] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<{
    serial: string | null;
    model: string | null;
    manufacturer: string | null;
    serialSource: string | null;
  } | null>(null);
  const [pairingTerminalId, setPairingTerminalId] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormSerial("");
    setFormLocationId(null);
    setFormActive(true);
  }, []);

  function openAdd() {
    resetForm();
    setEditTerminal(null);
    setShowAddSheet(true);
  }

  function openEdit(terminal: PayCloudTerminal) {
    setFormName(terminal.display_name);
    setFormSerial(terminal.terminal_sn);
    setFormLocationId(terminal.location_id ?? null);
    setFormActive(terminal.is_active);
    setEditTerminal(terminal);
    setShowAddSheet(true);
  }

  async function handleSaveTerminal() {
    if (!formName.trim()) {
      Alert.alert(cm("requiredTitle"), cm("nameRequiredBody"));
      return;
    }
    if (!editTerminal && !formSerial.trim()) {
      Alert.alert(cm("requiredTitle"), cm("serialRequiredBody"));
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (editTerminal) {
      const ok = await updateTerminal(editTerminal.id, {
        display_name: formName.trim(),
        location_id: formLocationId,
        is_active: formActive,
      });
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowAddSheet(false);
        void reloadTerminals();
      }
    } else {
      const result = await addTerminal({
        terminal_sn: formSerial.trim(),
        display_name: formName.trim(),
        location_id: formLocationId,
      });
      if (result) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowAddSheet(false);
        void reloadTerminals();
        void reloadSettings();
      }
    }
  }

  async function handleDelete(terminal: PayCloudTerminal) {
    Alert.alert(
      cm("removeTitle"),
      cm("removeBody", { name: terminal.name }),
      [
        { text: cm("cancelCta"), style: "cancel" },
        {
          text: cm("removeCta"),
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            await deleteTerminal(terminal.id);
            void reloadTerminals();
            void reloadSettings();
          },
        },
      ],
    );
  }

  async function handleAcceptToggle(value: boolean) {
    setSavingAccept(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ok = await updateSettings({ accept_paycloud: value });
    setSavingAccept(false);
    if (ok) {
      void reloadTerminals();
      void reloadSettings();
    }
  }

  async function handleQrToggle(value: boolean) {
    setSavingQr(true);
    const ok = await updateSettings({ qr_payments_enabled: value });
    setSavingQr(false);
    if (ok) void reloadSettings();
  }

  async function handleCashbackToggle(value: boolean) {
    setSavingCashback(true);
    const ok = await updateSettings({ cashback_enabled: value });
    setSavingCashback(false);
    if (ok) void reloadSettings();
  }

  async function loadReconciliation() {
    try {
      const res = await api.get<{
        payments?: ReconciliationPayment[];
        summary?: { exceptions?: number };
      }>("/api/provider/paycloud/reconciliation");
      if (!res.error && res.data) {
        setRecentPayments((res.data.payments ?? []).slice(0, 10));
        setReconcileExceptions(Number(res.data.summary?.exceptions ?? 0));
      }
    } catch {
      /* non-blocking */
    }
  }

  useEffect(() => {
    if (!paycloudEnabled || !sameTerminalFlag) {
      setSameDeviceAvailable(false);
      return;
    }
    void canLaunchPaycloudSameTerminal().then(async (ok) => {
      setSameDeviceAvailable(ok);
      if (ok) {
        const info = await getPaycloudDeviceInfo();
        setDeviceInfo(info);
      }
    });
  }, [paycloudEnabled, sameTerminalFlag]);

  async function handlePairDevice(terminal: PayCloudTerminal) {
    if (!deviceInfo?.serial) {
      Alert.alert(
        cm("readDeviceIdTitle"),
        cm("readDeviceIdBody"),
      );
      return;
    }
    setPairingTerminalId(terminal.id);
    try {
      const ok = await updateTerminal(terminal.id, {
        paired_device_id: deviceInfo.serial,
      });
      if (ok) {
        Alert.alert(
          cm("deviceLinkedTitle"),
          cm("deviceLinkedBody", { name: terminal.name }),
        );
      }
    } finally {
      setPairingTerminalId(null);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<{ application?: MerchantApplicationSummary | null }>(
          "/api/provider/terminal-merchant-application?create=false",
        );
        const app = res.data?.application;
        if (app && !["approved", "declined", "cancelled"].includes(app.status)) {
          setMerchantApplication(app);
        } else {
          setMerchantApplication(null);
        }
      } catch {
        setMerchantApplication(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!terminalShopEnabled) {
      setPendingOrder(null);
      return;
    }

    const isPendingActivation = (order: PendingTerminalOrder | undefined | null) => {
      if (!order) return false;
      if (order.invoice_status !== "paid") return false;
      if (order.integration_setup_status === "awaiting_merchant_onboarding") return false;
      if (order.integration_setup_status !== "pending") return false;
      const vendor = (order.terminal_products?.vendor ?? "").toLowerCase();
      return !vendor || vendor === "paycloud" || Boolean(activationOrderId);
    };

    void (async () => {
      try {
        if (activationOrderId) {
          const res = await api.get<{ order?: PendingTerminalOrder }>(
            `/api/provider/terminal-orders/${encodeURIComponent(activationOrderId)}`,
          );
          const order = res.data?.order;
          if (isPendingActivation(order)) {
            setPendingOrder(order!);
            setActivationName(
              order!.terminal_products?.name ?? cm("defaultActivationName"),
            );
            return;
          }
        }

        const listRes = await api.get<{ orders?: PendingTerminalOrder[] }>(
          "/api/provider/terminal-orders",
        );
        const pending = (listRes.data?.orders ?? []).find((o) => isPendingActivation(o));
        if (pending) {
          setPendingOrder(pending);
          setActivationName(
            pending.terminal_products?.name ?? cm("defaultActivationName"),
          );
        } else {
          setPendingOrder(null);
        }
      } catch {
        setPendingOrder(null);
      }
    })();
  }, [activationOrderId, terminalShopEnabled, cm]);

  async function handleActivateOrder() {
    if (!activationSerial.trim()) {
      Alert.alert(cm("requiredTitle"), cm("activateSerialRequiredBody"));
      return;
    }
    setActivating(true);
    try {
      const defaultName = cm("defaultActivationNameWithSerial", {
        serial: activationSerial.trim().slice(-4),
      });
      const result = await addTerminal({
        terminal_sn: activationSerial.trim(),
        display_name: activationName.trim() || defaultName,
      });
      if (result) {
        setActivationSerial("");
        setPendingOrder(null);
        void reloadTerminals();
        void reloadSettings();
        if (!settings?.accept_paycloud) {
          Alert.alert(
            cm("machineAddedTitle"),
            cm("machineAddedBody"),
          );
        }
      }
    } finally {
      setActivating(false);
    }
  }

  async function handleReconcile() {
    setReconcileLoading(true);
    try {
      const res = await api.post<{
        checked?: number;
        settled?: number;
        processing?: number;
      }>("/api/provider/paycloud/payments/reconcile", {});
      if (res.error) {
        Alert.alert(
          cm("checkStatusFailedTitle"),
          res.error.message || cm("checkStatusFailedFallback"),
        );
      } else {
        const checked = res.data?.checked ?? 0;
        const settled = res.data?.settled ?? 0;
        const suffix =
          checked === 1 ? cm("checkStatusOkSuffixOne") : cm("checkStatusOkSuffixOther");
        Alert.alert(
          cm("checkStatusOkTitle"),
          settled > 0
            ? cm("checkStatusOkSettled", { count: checked, suffix, settled })
            : cm("checkStatusOkNoChanges", { count: checked, suffix }),
        );
        void loadReconciliation();
        void reloadSettings();
      }
    } catch {
      Alert.alert(cm("checkStatusFailedTitle"), cm("checkStatusErrorBody"));
    } finally {
      setReconcileLoading(false);
    }
  }

  const loading = terminalsLoading || settingsLoading;

  useEffect(() => {
    if (paycloudEnabled && !loading) {
      void loadReconciliation();
    }
  }, [paycloudEnabled, loading]);

  if (!paycloudEnabled) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={cm("title")} showBack onBack={handleBack} />
        <EmptyState
          icon="hardware-chip-outline"
          title={cm("unavailableTitle")}
          description={cm("unavailableBody")}
        />
        {terminalShopEnabled ? (
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/terminal-shop" as never)}
            style={twStyle("mx-4 mt-4 flex-row items-center rounded-2xl border border-pink-200 bg-pink-50 p-4")}
          >
            <Ionicons name="cart-outline" size={20} color="#db2777" />
            <Text style={twStyle("ms-3 flex-1 text-sm font-semibold text-pink-900")}>
              {cm("orderFromShop")}
            </Text>
            <DirectionalIcon name="chevron-forward" size={18} color="#db2777" />
          </TouchableOpacity>
        ) : null}
      </ScreenContainer>
    );
  }

  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={cm("title")} showBack onBack={handleBack} />
        <LoadingState />
      </ScreenContainer>
    );
  }

  const loadError = terminalsError ?? settingsError;
  if (loadError) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={cm("title")} showBack onBack={handleBack} />
        <ErrorState
          message={loadError}
          onRetry={() => {
            void reloadTerminals();
            void reloadSettings();
          }}
        />
      </ScreenContainer>
    );
  }

  const acceptPaycloud = settings?.accept_paycloud === true;
  const inFlight = settings?.terminals?.inFlight ?? 0;
  const needsAttention = inFlight > 0 || reconcileExceptions > 0;
  const topBlocker = settings?.blockers?.[0];
  const statusLabel = settings?.ready
    ? cm("statusReady")
    : !acceptPaycloud
      ? cm("statusNotAccepting")
      : topBlocker?.title ?? cm("statusSetupIncomplete");
  const unknownBlockers =
    settings?.blockers?.filter((b) => !KNOWN_SETUP_CODES.has(b.code as (typeof SETUP_STEP_CODES)[number])) ?? [];

  const activeTerminalCount = settings?.active_terminal_count ?? 0;
  const envKey =
    settings?.account_environment === "sandbox"
      ? "envTest"
      : settings?.account_environment === "live"
        ? "envLive"
        : "envTestLive";
  const envSuffix = settings?.account_environment
    ? cm("envSuffix", { env: cm(envKey) })
    : "";
  const activeMachinesSuffix =
    activeTerminalCount === 1 ? cm("activeMachinesOne") : cm("activeMachinesOther");

  return (
    <ScreenContainer>
      <ScreenHeader
        title={cm("title")}
        subtitle={cm("subtitle")}
        showBack
        onBack={handleBack}
      />

      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <Text style={twStyle("text-xs text-gray-500")}>{cm("statusLabel")}</Text>
        <Text style={twStyle("text-xl font-semibold text-gray-900")}>{statusLabel}</Text>
        <Text style={twStyle("mt-1 text-xs text-gray-500")}>
          {cm("activeMachines", { count: activeTerminalCount, suffix: activeMachinesSuffix })}
          {envSuffix}
        </Text>
      </View>

      {merchantApplication && ["draft", "submitted", "info_required", "in_review", "sent_to_acquirer", "awaiting_term_sheet"].includes(merchantApplication.status) ? (
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/terminal-merchant-application" as never)}
          style={twStyle("mb-4 flex-row items-center rounded-2xl border border-indigo-200 bg-indigo-50 p-4")}
          activeOpacity={0.75}
        >
          <Ionicons name="document-text-outline" size={22} color="#4338ca" />
          <View style={twStyle("ms-3 flex-1")}>
            <Text style={twStyle("text-sm font-semibold text-indigo-900")}>
              {cm("finishApplication", { ref: merchantApplication.application_no })}
            </Text>
            <Text style={twStyle("mt-0.5 text-xs text-indigo-700")}>
              {merchantApplication.status === "draft" || merchantApplication.status === "info_required"
                ? cm("finishApplicationDraft")
                : cm("finishApplicationReview")}
            </Text>
          </View>
          <DirectionalIcon name="chevron-forward" size={18} color="#4338ca" />
        </TouchableOpacity>
      ) : null}

      {terminalShopEnabled && terminals.length === 0 && !pendingOrder ? (
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/terminal-shop" as never)}
          style={twStyle("mb-4 flex-row items-center rounded-2xl border border-pink-200 bg-pink-50 p-4")}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={cm("firstMachineA11y")}
        >
          <View style={twStyle("h-12 w-12 items-center justify-center rounded-xl bg-white")}>
            <Ionicons name="phone-portrait-outline" size={22} color="#db2777" />
          </View>
          <View style={twStyle("ms-3 flex-1")}>
            <Text style={twStyle("text-sm font-semibold text-pink-900")}>
              {cm("firstMachineTitle")}
            </Text>
            <Text style={twStyle("mt-0.5 text-xs text-pink-700")}>
              {cm("firstMachineBody")}
            </Text>
          </View>
          <DirectionalIcon name="chevron-forward" size={18} color="#db2777" />
        </TouchableOpacity>
      ) : null}

      {pendingOrder ? (
        <View style={twStyle("mb-4 rounded-2xl border border-pink-200 bg-pink-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-pink-900")}>{cm("activateTitle")}</Text>
          <Text style={twStyle("mt-1 text-xs text-pink-800")}>
            {pendingOrder.terminal_products?.name
              ? cm("activateOrderLabel", { name: pendingOrder.terminal_products.name })
              : cm("activateEnterSerial")}
          </Text>
          <TextInput
            style={twStyle("mt-3 rounded-xl border border-pink-200 bg-white px-4 py-3 text-sm text-gray-900")}
            value={activationSerial}
            onChangeText={setActivationSerial}
            placeholder={cm("serialPlaceholder")}
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
          />
          <TextInput
            style={twStyle("mt-2 rounded-xl border border-pink-200 bg-white px-4 py-3 text-sm text-gray-900")}
            value={activationName}
            onChangeText={setActivationName}
            placeholder={cm("displayNamePlaceholder")}
            placeholderTextColor="#9ca3af"
          />
          <TouchableOpacity
            onPress={() => void handleActivateOrder()}
            disabled={activating}
            style={twStyle("mt-3 self-start rounded-xl bg-pink-600 px-4 py-2")}
          >
            <Text style={twStyle("text-sm font-semibold text-white")}>
              {activating ? cm("activating") : cm("activateCta")}
            </Text>
          </TouchableOpacity>
          {!acceptPaycloud ? (
            <TouchableOpacity
              onPress={() => void handleAcceptToggle(true)}
              disabled={savingAccept}
              style={twStyle("mt-2 self-start rounded-xl border border-pink-300 bg-white px-4 py-2")}
            >
              <Text style={twStyle("text-sm font-semibold text-pink-800")}>
                {cm("enableAcceptance")}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <SectionHeader title={cm("sectionAcceptance")} />
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-1 pe-4")}>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>
              {cm("acceptTitle")}
            </Text>
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>
              {cm("acceptBody")}
            </Text>
          </View>
          <Switch
            value={acceptPaycloud}
            onValueChange={handleAcceptToggle}
            disabled={savingAccept}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={acceptPaycloud ? "#6366f1" : "#f3f4f6"}
          />
        </View>
        {settings?.ready ? (
          <View style={twStyle("mt-3 rounded-xl bg-emerald-50 px-3 py-2")}>
            <Text style={twStyle("text-xs text-emerald-800")}>
              {cm("acceptReady", {
                count: settings.active_terminal_count,
                suffix:
                  settings.active_terminal_count === 1
                    ? cm("acceptReadySuffixOne")
                    : cm("acceptReadySuffixOther"),
              })}
            </Text>
          </View>
        ) : acceptPaycloud && (settings?.active_terminal_count ?? 0) === 0 ? (
          <View style={twStyle("mt-3 rounded-xl bg-amber-50 px-3 py-2")}>
            <Text style={twStyle("text-xs text-amber-800")}>
              {cm("acceptAddHint")}
            </Text>
          </View>
        ) : null}
      </View>

      {settings?.blockers && settings.blockers.length > 0 ? (
        <View style={twStyle("mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-amber-950")}>{cm("setupChecklist")}</Text>
          {SETUP_STEP_CODES.map((code) => {
            const blocker = settings.blockers?.find((b) => b.code === code);
            const done = !blocker;
            const labelKey = SETUP_STEP_LABEL_KEYS[code];
            return (
              <View key={code} style={twStyle("mt-2 flex-row items-center justify-between")}>
                <Text
                  style={twStyle(
                    `flex-1 text-xs ${done ? "text-emerald-800" : "text-amber-900"}`,
                  )}
                >
                  {done ? "✓" : "○"}{" "}
                  {blocker?.title && !done ? blocker.title : cm(`setupSteps.${labelKey}`)}
                </Text>
              </View>
            );
          })}
          {unknownBlockers.map((blocker) => (
            <View key={blocker.code} style={twStyle("mt-2")}>
              <Text style={twStyle("text-xs text-amber-900")}>
                ○ {blocker.title}
              </Text>
              {blocker.actionLabel ? (
                <Text style={twStyle("mt-0.5 text-[11px] text-amber-800")}>
                  {blocker.actionLabel}
                </Text>
              ) : null}
            </View>
          ))}
          {settings.blockers.find((b) => b.code === "FLAG_OFF") ? (
            <TouchableOpacity
              style={twStyle("mt-3 self-start rounded-full border border-amber-900 px-3 py-2")}
              onPress={() => {
                void Linking.openURL(
                  "mailto:support@beautonomi.com?subject=Card%20machines%20not%20enabled",
                );
              }}
            >
              <Text style={twStyle("text-xs font-semibold text-amber-950")}>{cm("contactBeautonomi")}</Text>
            </TouchableOpacity>
          ) : null}
          {settings.blockers.find((b) => b.code === "PLAN_REQUIRED") ? (
            <TouchableOpacity
              style={twStyle("mt-3 self-start rounded-full bg-amber-900 px-3 py-2")}
              onPress={() => router.push("/(app)/(tabs)/more/settings/subscription" as never)}
            >
              <Text style={twStyle("text-xs font-semibold text-white")}>{cm("upgradePlan")}</Text>
            </TouchableOpacity>
          ) : null}
          {settings.blockers.some((b) => b.code === "NO_MERCHANT" || b.code === "ALL_SUSPENDED") ? (
            <TouchableOpacity
              style={twStyle("mt-3 self-start rounded-full border border-amber-900 px-3 py-2")}
              onPress={() => {
                void Linking.openURL(
                  "mailto:support@beautonomi.com?subject=Card%20machine%20setup%20help",
                );
              }}
            >
              <Text style={twStyle("text-xs font-semibold text-amber-950")}>{cm("contactBeautonomi")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : settings && !settings.ready ? (
        <View style={twStyle("mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-amber-950")}>{cm("setupChecklist")}</Text>
          <Text style={twStyle("mt-2 text-xs text-amber-900")}>
            {cm("checklistFinishHint")}
          </Text>
        </View>
      ) : settings?.ready ? (
        <View style={twStyle("mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-emerald-900")}>{cm("setupComplete")}</Text>
          <Text style={twStyle("mt-1 text-xs text-emerald-800")}>
            {cm("setupCompleteBody")}
          </Text>
        </View>
      ) : null}

      {(settings?.warnings ?? []).length > 0 ? (
        <View style={twStyle("mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
          {(settings?.warnings ?? []).map((w) => (
            <Text key={w.code} style={twStyle("text-xs text-amber-800")}>
              {w.message}
            </Text>
          ))}
        </View>
      ) : null}

      {settings?.account_environment ? (
        <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs text-gray-500")}>{cm("accountLabel")}</Text>
          <Text style={twStyle("text-sm font-medium text-gray-900")}>
            {cm(envKey)}
          </Text>
        </View>
      ) : null}

      {qrFlagEnabled ? (
        <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <View style={twStyle("flex-1 pe-4")}>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>{cm("walletQrTitle")}</Text>
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                {cm("walletQrBody")}
              </Text>
            </View>
            <Switch
              value={settings?.qr_payments_enabled === true}
              onValueChange={handleQrToggle}
              disabled={savingQr}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={settings?.qr_payments_enabled ? "#6366f1" : "#f3f4f6"}
            />
          </View>
        </View>
      ) : null}

      {cashbackFlagEnabled ? (
        <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <View style={twStyle("flex-1 pe-4")}>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>{cm("cashbackTitle")}</Text>
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                {cm("cashbackBody")}
              </Text>
            </View>
            <Switch
              value={settings?.cashback_enabled === true}
              onValueChange={handleCashbackToggle}
              disabled={savingCashback}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={settings?.cashback_enabled ? "#6366f1" : "#f3f4f6"}
            />
          </View>
        </View>
      ) : null}

      {needsAttention ? (
        <View style={twStyle("mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-amber-900")}>{cm("needsAttention")}</Text>
          {inFlight > 0 ? (
            <Text style={twStyle("mt-1 text-xs text-amber-800")}>
              {cm("paymentsWaiting", {
                count: inFlight,
                suffix: inFlight === 1 ? cm("paymentsWaitingSuffixOne") : cm("paymentsWaitingSuffixOther"),
              })}
            </Text>
          ) : null}
          {reconcileExceptions > 0 ? (
            <Text style={twStyle("mt-1 text-xs text-amber-800")}>
              {cm("amountMismatches", {
                count: reconcileExceptions,
                suffix:
                  reconcileExceptions === 1
                    ? cm("amountMismatchesSuffixOne")
                    : cm("amountMismatchesSuffixOther"),
              })}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => void handleReconcile()}
            disabled={reconcileLoading}
            style={twStyle("mt-3 self-start rounded-xl bg-amber-600 px-4 py-2")}
            accessibilityRole="button"
            accessibilityLabel={cm("checkStatusA11y")}
          >
            <Text style={twStyle("text-xs font-semibold text-white")}>
              {reconcileLoading ? cm("checking") : cm("checkStatus")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {sameDeviceAvailable && deviceInfo?.serial ? (
        <View style={twStyle("mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-indigo-900")}>{cm("thisDevice")}</Text>
          <Text style={twStyle("mt-1 text-xs text-indigo-800")}>
            {cm("deviceId", {
              manufacturer: deviceInfo.manufacturer ? `${deviceInfo.manufacturer} ` : "",
              model: deviceInfo.model ?? cm("deviceInfoFallback"),
              serial: deviceInfo.serial.slice(0, 12),
            })}
            {deviceInfo.serial.length > 12 ? cm("deviceIdSerialEllipsis") : ""}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-indigo-700")}>
            {cm("thisDeviceHint")}
          </Text>
        </View>
      ) : null}

      <SectionHeader title={cm("sectionYourMachines")} actionLabel={cm("addCta")} onAction={openAdd} />

      {terminals.length === 0 ? (
        <EmptyState
          icon="hardware-chip-outline"
          title={cm("emptyMachinesTitle")}
          description={cm("emptyMachinesBody")}
          actionLabel={cm("addCardMachineCta")}
          onAction={openAdd}
        />
      ) : (
        <View>
          {terminals.map((terminal, idx) => (
            <View
              key={terminal.id}
              style={[
                twStyle("rounded-2xl border border-gray-100 bg-white p-4"),
                idx > 0 ? { marginTop: 12 } : undefined,
              ]}
              accessibilityLabel={cm("terminalA11y", { name: terminal.name })}
            >
              <View style={twStyle("flex-row items-center justify-between")}>
                <View style={twStyle("flex-row items-center flex-1")}>
                  <View
                    style={twStyle(`h-10 w-10 items-center justify-center rounded-lg ${
                      terminal.is_active ? "bg-indigo-50" : "bg-gray-100"
                    }`)}
                  >
                    <Ionicons
                      name="hardware-chip-outline"
                      size={20}
                      color={terminal.is_active ? "#6366f1" : "#9ca3af"}
                    />
                  </View>
                  <View style={twStyle("ms-3 flex-1")}>
                    <View style={twStyle("flex-row flex-wrap items-center")}>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                        {terminal.name}
                      </Text>
                      {terminal.status === "assigned" ? (
                        <View style={twStyle("ms-2 rounded-full bg-sky-100 px-2 py-0.5")}>
                          <Text style={twStyle("text-[10px] font-semibold text-sky-800")}>
                            {cm("assignedByBeautonomi")}
                          </Text>
                        </View>
                      ) : null}
                      {terminal.location_id == null ? (
                        <View style={twStyle("ms-2 rounded-full bg-indigo-100 px-2 py-0.5")}>
                          <Text style={twStyle("text-[10px] font-semibold text-indigo-700")}>
                            {cm("portable")}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {cm("serialLabel", { serial: terminal.terminal_sn })}
                    </Text>
                    {terminal.location_name ? (
                      <Text style={twStyle("text-xs text-gray-400")}>{terminal.location_name}</Text>
                    ) : terminal.location_id == null ? (
                      <Text style={twStyle("text-xs text-gray-400")}>
                        {cm("allLocationsTravels")}
                      </Text>
                    ) : null}
                    {terminal.last_used || terminal.total_transactions > 0 ? (
                      <Text style={twStyle("text-[11px] text-gray-400 mt-0.5")}>
                        {terminal.last_used
                          ? cm("lastUsed", { when: formatLastUsedShort(terminal.last_used) })
                          : cm("neverUsed")}
                        {terminal.total_transactions > 0
                          ? cm("txnCount", {
                              count: terminal.total_transactions,
                              suffix:
                                terminal.total_transactions === 1
                                  ? cm("txnCountSuffixOne")
                                  : cm("txnCountSuffixOther"),
                            })
                          : ""}
                      </Text>
                    ) : null}
                    {terminal.last_error ? (
                      <Text style={twStyle("text-[11px] text-rose-600 mt-0.5")}>
                        {terminal.last_error}
                      </Text>
                    ) : null}
                    {terminal.merchant ? (
                      <Text style={twStyle("text-[11px] text-gray-400 mt-0.5")}>
                        {cm("merchantStore", {
                          merchantNo: terminal.merchant.merchant_no,
                          storeNo: terminal.merchant.store_no,
                        })}
                      </Text>
                    ) : (
                      <Text style={twStyle("text-[11px] text-amber-600 mt-0.5")}>
                        {cm("merchantSetupPending")}
                      </Text>
                    )}
                    {terminal.model ? (
                      <Text style={twStyle("text-[11px] text-gray-400 mt-0.5")}>
                        {cm("deviceModel", { model: terminal.model })}
                      </Text>
                    ) : null}
                    {terminal.paired_device_id ? (
                      <Text style={twStyle("text-[11px] text-indigo-600 mt-0.5")}>
                        {cm("linkedToDevice", { id: terminal.paired_device_id.slice(0, 10) })}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={twStyle("flex-row items-center")}>
                  <View
                    style={[
                      twStyle(`rounded-full px-2 py-0.5 ${
                        terminal.is_active ? "bg-green-50" : "bg-gray-100"
                      }`),
                      { marginEnd: 8 },
                    ]}
                  >
                    <Text
                      style={twStyle(`text-xs ${
                        terminal.is_active ? "text-green-600" : "text-gray-400"
                      }`)}
                    >
                      {terminal.is_active ? cm("active") : cm("hidden")}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => openEdit(terminal)}
                    style={[twStyle("min-h-[44px] min-w-[44px] items-center justify-center"), { marginEnd: 8 }]}
                    accessibilityRole="button"
                    accessibilityLabel={cm("editTerminalA11y", { name: terminal.name })}
                  >
                    <Ionicons name="pencil-outline" size={18} color="#6b7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(terminal)}
                    style={twStyle("min-h-[44px] min-w-[44px] items-center justify-center")}
                    accessibilityRole="button"
                    accessibilityLabel={cm("removeTerminalA11y", { name: terminal.name })}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
              {sameDeviceAvailable && deviceInfo?.serial ? (
                <TouchableOpacity
                  onPress={() => void handlePairDevice(terminal)}
                  disabled={pairingTerminalId === terminal.id}
                  style={twStyle("mt-3 self-start rounded-lg border border-indigo-300 bg-white px-3 py-2")}
                >
                  <Text style={twStyle("text-xs font-semibold text-indigo-700")}>
                    {pairingTerminalId === terminal.id
                      ? cm("linking")
                      : terminal.paired_device_id === deviceInfo.serial
                        ? cm("linkedToThisDevice")
                        : cm("linkThisDevice")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      )}

      <SectionHeader title={cm("sectionRecentPayments")} />
      {recentPayments.length === 0 ? (
        <EmptyState
          icon="card-outline"
          title={cm("emptyPaymentsTitle")}
          description={cm("emptyPaymentsBody")}
        />
      ) : (
        <View style={twStyle("mb-4")}>
          {recentPayments.map((payment, idx) => (
            <View
              key={payment.id}
              style={[
                twStyle("rounded-2xl border border-gray-100 bg-white p-4"),
                idx > 0 ? { marginTop: 8 } : undefined,
              ]}
            >
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                {payment.currency} {Number(payment.amount).toFixed(2)}
              </Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                {new Date(payment.created_at).toLocaleString()} · {payment.status.replace(/_/g, " ")}
              </Text>
              <Text style={twStyle("text-xs text-gray-400")}>
                {payment.merchant_order_no}
                {payment.amount_match_status ? ` · ${payment.amount_match_status}` : ""}
              </Text>
            </View>
          ))}
          <TouchableOpacity
            onPress={() => void handleReconcile()}
            disabled={reconcileLoading}
            style={twStyle("mt-3 self-start rounded-xl border border-gray-200 px-4 py-2")}
          >
            <Text style={twStyle("text-xs font-medium text-gray-700")}>
              {reconcileLoading ? cm("checking") : cm("checkStatus")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {terminalShopEnabled && terminals.length > 0 ? (
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/terminal-shop" as never)}
          style={twStyle("mb-4 flex-row items-center rounded-2xl border border-pink-200 bg-pink-50 p-4")}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={cm("orderFromShopA11y")}
        >
          <View style={twStyle("h-10 w-10 items-center justify-center rounded-lg bg-pink-100")}>
            <Ionicons name="cart-outline" size={20} color="#db2777" />
          </View>
          <View style={twStyle("ms-3 flex-1")}>
            <Text style={twStyle("text-sm font-semibold text-pink-900")}>{cm("needAnotherTitle")}</Text>
            <Text style={twStyle("text-xs text-pink-700")}>
              {cm("needAnotherBody")}
            </Text>
          </View>
          <DirectionalIcon name="chevron-forward" size={18} color="#db2777" />
        </TouchableOpacity>
      ) : null}

      <View style={twStyle("h-8")} />

      <BottomSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        title={editTerminal ? cm("editSheetTitle") : cm("addSheetTitle")}
        snapHeight="auto"
      >
        {!editTerminal ? (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
              {cm("serialNumberRequired")}
            </Text>
            <TextInput
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
              value={formSerial}
              onChangeText={setFormSerial}
              placeholder={cm("serialFromPlaceholder")}
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel={cm("serialA11y")}
            />
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>
              {cm("serialHelp")}
            </Text>
          </View>
        ) : (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>{cm("serialNumberLabel")}</Text>
            <Text
              style={twStyle("rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-xs text-gray-600")}
              selectable
            >
              {editTerminal.terminal_sn}
            </Text>
          </View>
        )}

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>{cm("displayNameRequired")}</Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
            value={formName}
            onChangeText={setFormName}
            placeholder={cm("displayNamePlaceholder")}
            placeholderTextColor="#9ca3af"
            accessibilityLabel={cm("displayNameA11y")}
          />
        </View>

        {Array.isArray(locations) && locations.length > 0 ? (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>{cm("locationLabel")}</Text>
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>
              {cm("locationHelp")}
            </Text>
            <View style={twStyle("flex-row flex-wrap")}>
              <TouchableOpacity
                onPress={() => setFormLocationId(null)}
                style={[
                  twStyle(`rounded-full px-3 py-1.5 ${
                    !formLocationId ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"
                  }`),
                  { marginEnd: 8, marginBottom: 8 },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: !formLocationId }}
              >
                <Text
                  style={twStyle(`text-xs font-medium ${
                    !formLocationId ? "text-white" : "text-gray-600"
                  }`)}
                >
                  {cm("allLocations")}
                </Text>
              </TouchableOpacity>
              {locations.map((loc) => {
                const sel = formLocationId === loc.id;
                return (
                  <TouchableOpacity
                    key={loc.id}
                    onPress={() => setFormLocationId(loc.id)}
                    style={[
                      twStyle(`rounded-full px-3 py-1.5 ${
                        sel ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"
                      }`),
                      { marginEnd: 8, marginBottom: 8 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                  >
                    <Text
                      style={twStyle(`text-xs font-medium ${sel ? "text-white" : "text-gray-600"}`)}
                    >
                      {loc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={twStyle("mb-4 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1 pe-4")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>{cm("showAtCheckout")}</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              {cm("showAtCheckoutHelp")}
            </Text>
          </View>
          <Switch
            value={formActive}
            onValueChange={setFormActive}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={formActive ? "#6366f1" : "#f3f4f6"}
          />
        </View>

        <ActionButton
          label={editTerminal ? cm("saveChangesCta") : cm("addCardMachineCta")}
          onPress={handleSaveTerminal}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}
