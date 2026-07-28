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
import { useProviderStackBack } from "@/lib/provider-tab-navigation";
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

const SETUP_STEPS = [
  { code: "FLAG_OFF", label: "Card machines enabled for your market" },
  { code: "PLAN_REQUIRED", label: "Plan includes card machines" },
  { code: "NOT_ACCEPTED", label: "Accept in-person card payments" },
  { code: "NO_TERMINALS", label: "Add a card machine" },
  { code: "ALL_SUSPENDED", label: "At least one active machine" },
  { code: "NO_MERCHANT", label: "Merchant setup complete" },
  { code: "NO_CREDENTIALS", label: "Beautonomi is finishing your card machine account" },
] as const;

const KNOWN_SETUP_CODES = new Set(SETUP_STEPS.map((s) => s.code));

function formatLastUsedShort(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "recently";
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export default function CardMachinesScreen() {
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
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
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
      Alert.alert("Required", "Give this card machine a name.");
      return;
    }
    if (!editTerminal && !formSerial.trim()) {
      Alert.alert("Required", "Enter the serial number from the device label.");
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
      "Remove card machine",
      `Remove "${terminal.name}" from your account?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
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
        "Could not read device ID",
        "Enter the serial from your device label when adding the machine, or contact support.",
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
          "Device linked",
          `${terminal.name} is now linked to this device for Pay on this device.`,
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
            setActivationName(order!.terminal_products?.name ?? "Card machine");
            return;
          }
        }

        const listRes = await api.get<{ orders?: PendingTerminalOrder[] }>(
          "/api/provider/terminal-orders",
        );
        const pending = (listRes.data?.orders ?? []).find((o) => isPendingActivation(o));
        if (pending) {
          setPendingOrder(pending);
          setActivationName(pending.terminal_products?.name ?? "Card machine");
        } else {
          setPendingOrder(null);
        }
      } catch {
        setPendingOrder(null);
      }
    })();
  }, [activationOrderId, terminalShopEnabled]);

  async function handleActivateOrder() {
    if (!activationSerial.trim()) {
      Alert.alert("Required", "Enter the serial number from your device label.");
      return;
    }
    setActivating(true);
    try {
      const result = await addTerminal({
        terminal_sn: activationSerial.trim(),
        display_name: activationName.trim() || `Card machine ${activationSerial.trim().slice(-4)}`,
      });
      if (result) {
        setActivationSerial("");
        setPendingOrder(null);
        void reloadTerminals();
        void reloadSettings();
        if (!settings?.accept_paycloud) {
          Alert.alert(
            "Machine added",
            "Turn on Accept in-person card payments to start collecting.",
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
        Alert.alert("Couldn't check status", res.error.message || "Please try again shortly.");
      } else {
        const checked = res.data?.checked ?? 0;
        const settled = res.data?.settled ?? 0;
        Alert.alert(
          "Status checked",
          settled > 0
            ? `Checked ${checked} payment${checked === 1 ? "" : "s"} — ${settled} settled.`
            : `Checked ${checked} payment${checked === 1 ? "" : "s"} — no changes.`,
        );
        void loadReconciliation();
        void reloadSettings();
      }
    } catch {
      Alert.alert("Couldn't check status", "Something went wrong. Please try again.");
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
        <ScreenHeader title="Card machines" showBack onBack={handleBack} />
        <EmptyState
          icon="hardware-chip-outline"
          title="Card machines unavailable"
          description="Beautonomi card machines aren't available in your market yet."
        />
        {terminalShopEnabled ? (
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/terminal-shop" as never)}
            style={twStyle("mx-4 mt-4 flex-row items-center rounded-2xl border border-pink-200 bg-pink-50 p-4")}
          >
            <Ionicons name="cart-outline" size={20} color="#db2777" />
            <Text style={twStyle("ml-3 flex-1 text-sm font-semibold text-pink-900")}>
              Order terminals from the shop
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#db2777" />
          </TouchableOpacity>
        ) : null}
      </ScreenContainer>
    );
  }

  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Card machines" showBack onBack={handleBack} />
        <LoadingState />
      </ScreenContainer>
    );
  }

  const loadError = terminalsError ?? settingsError;
  if (loadError) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Card machines" showBack onBack={handleBack} />
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
    ? "Ready"
    : !acceptPaycloud
      ? "Not accepting"
      : topBlocker?.title ?? "Setup incomplete";
  const unknownBlockers =
    settings?.blockers?.filter((b) => !KNOWN_SETUP_CODES.has(b.code as (typeof SETUP_STEPS)[number]["code"])) ?? [];

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Card machines"
        subtitle="Beautonomi in-person card machines"
        showBack
        onBack={handleBack}
      />

      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <Text style={twStyle("text-xs text-gray-500")}>Status</Text>
        <Text style={twStyle("text-xl font-semibold text-gray-900")}>{statusLabel}</Text>
        <Text style={twStyle("mt-1 text-xs text-gray-500")}>
          {settings?.active_terminal_count ?? 0} active machine
          {(settings?.active_terminal_count ?? 0) === 1 ? "" : "s"}
          {settings?.account_environment
            ? ` · ${settings.account_environment === "sandbox" ? "Test" : settings.account_environment === "live" ? "Live" : "Test & Live"}`
            : ""}
        </Text>
      </View>

      {merchantApplication && ["draft", "submitted", "info_required", "in_review", "sent_to_acquirer", "awaiting_term_sheet"].includes(merchantApplication.status) ? (
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/terminal-merchant-application" as never)}
          style={twStyle("mb-4 flex-row items-center rounded-2xl border border-indigo-200 bg-indigo-50 p-4")}
          activeOpacity={0.75}
        >
          <Ionicons name="document-text-outline" size={22} color="#4338ca" />
          <View style={twStyle("ml-3 flex-1")}>
            <Text style={twStyle("text-sm font-semibold text-indigo-900")}>
              Finish card machine application ({merchantApplication.application_no})
            </Text>
            <Text style={twStyle("mt-0.5 text-xs text-indigo-700")}>
              {merchantApplication.status === "draft" || merchantApplication.status === "info_required"
                ? "Complete your details so we can ship your terminal."
                : "Track your application status."}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#4338ca" />
        </TouchableOpacity>
      ) : null}

      {terminalShopEnabled && terminals.length === 0 && !pendingOrder ? (
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/terminal-shop" as never)}
          style={twStyle("mb-4 flex-row items-center rounded-2xl border border-pink-200 bg-pink-50 p-4")}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Get your first Beautonomi card machine"
        >
          <View style={twStyle("h-12 w-12 items-center justify-center rounded-xl bg-white")}>
            <Ionicons name="phone-portrait-outline" size={22} color="#db2777" />
          </View>
          <View style={twStyle("ml-3 flex-1")}>
            <Text style={twStyle("text-sm font-semibold text-pink-900")}>
              Get your first Beautonomi card machine
            </Text>
            <Text style={twStyle("mt-0.5 text-xs text-pink-700")}>
              Order from the catalog — some plans include a machine at no extra cost.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#db2777" />
        </TouchableOpacity>
      ) : null}

      {pendingOrder ? (
        <View style={twStyle("mb-4 rounded-2xl border border-pink-200 bg-pink-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-pink-900")}>Activate your new card machine</Text>
          <Text style={twStyle("mt-1 text-xs text-pink-800")}>
            {pendingOrder.terminal_products?.name
              ? `Order: ${pendingOrder.terminal_products.name}`
              : "Enter the serial number to finish setup"}
          </Text>
          <TextInput
            style={twStyle("mt-3 rounded-xl border border-pink-200 bg-white px-4 py-3 text-sm text-gray-900")}
            value={activationSerial}
            onChangeText={setActivationSerial}
            placeholder="Serial number from device label"
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
          />
          <TextInput
            style={twStyle("mt-2 rounded-xl border border-pink-200 bg-white px-4 py-3 text-sm text-gray-900")}
            value={activationName}
            onChangeText={setActivationName}
            placeholder="Display name"
            placeholderTextColor="#9ca3af"
          />
          <TouchableOpacity
            onPress={() => void handleActivateOrder()}
            disabled={activating}
            style={twStyle("mt-3 self-start rounded-xl bg-pink-600 px-4 py-2")}
          >
            <Text style={twStyle("text-sm font-semibold text-white")}>
              {activating ? "Activating…" : "Activate machine"}
            </Text>
          </TouchableOpacity>
          {!acceptPaycloud ? (
            <TouchableOpacity
              onPress={() => void handleAcceptToggle(true)}
              disabled={savingAccept}
              style={twStyle("mt-2 self-start rounded-xl border border-pink-300 bg-white px-4 py-2")}
            >
              <Text style={twStyle("text-sm font-semibold text-pink-800")}>
                Enable acceptance
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <SectionHeader title="Acceptance" />
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-1 pr-4")}>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>
              Accept in-person card payments
            </Text>
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>
              Show Card machine at checkout when you have an active machine.
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
              Ready — {settings.active_terminal_count} active card machine
              {settings.active_terminal_count === 1 ? "" : "s"}.
            </Text>
          </View>
        ) : acceptPaycloud && (settings?.active_terminal_count ?? 0) === 0 ? (
          <View style={twStyle("mt-3 rounded-xl bg-amber-50 px-3 py-2")}>
            <Text style={twStyle("text-xs text-amber-800")}>
              Add at least one card machine below to start taking card payments.
            </Text>
          </View>
        ) : null}
      </View>

      {settings?.blockers && settings.blockers.length > 0 ? (
        <View style={twStyle("mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-amber-950")}>Setup checklist</Text>
          {SETUP_STEPS.map((step) => {
            const blocker = settings.blockers?.find((b) => b.code === step.code);
            const done = !blocker;
            return (
              <View key={step.code} style={twStyle("mt-2 flex-row items-center justify-between")}>
                <Text
                  style={twStyle(
                    `flex-1 text-xs ${done ? "text-emerald-800" : "text-amber-900"}`,
                  )}
                >
                  {done ? "✓" : "○"}{" "}
                  {blocker?.title && !done ? blocker.title : step.label}
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
              <Text style={twStyle("text-xs font-semibold text-amber-950")}>Contact Beautonomi</Text>
            </TouchableOpacity>
          ) : null}
          {settings.blockers.find((b) => b.code === "PLAN_REQUIRED") ? (
            <TouchableOpacity
              style={twStyle("mt-3 self-start rounded-full bg-amber-900 px-3 py-2")}
              onPress={() => router.push("/(app)/(tabs)/more/settings/subscription" as never)}
            >
              <Text style={twStyle("text-xs font-semibold text-white")}>Upgrade plan</Text>
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
              <Text style={twStyle("text-xs font-semibold text-amber-950")}>Contact Beautonomi</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : settings && !settings.ready ? (
        <View style={twStyle("mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-amber-950")}>Setup checklist</Text>
          <Text style={twStyle("mt-2 text-xs text-amber-900")}>
            Finish acceptance and add an active machine to start collecting.
          </Text>
        </View>
      ) : settings?.ready ? (
        <View style={twStyle("mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-emerald-900")}>Setup complete</Text>
          <Text style={twStyle("mt-1 text-xs text-emerald-800")}>
            Ready to collect with Beautonomi card machines.
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
          <Text style={twStyle("text-xs text-gray-500")}>Account</Text>
          <Text style={twStyle("text-sm font-medium text-gray-900")}>
            {settings.account_environment === "sandbox"
              ? "Test"
              : settings.account_environment === "live"
                ? "Live"
                : "Test & Live"}
          </Text>
        </View>
      ) : null}

      {qrFlagEnabled ? (
        <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <View style={twStyle("flex-1 pr-4")}>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>Wallet QR payments</Text>
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                Let customers pay with mobile wallet QR on the device.
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
            <View style={twStyle("flex-1 pr-4")}>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>Cashback</Text>
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                Offer cashback when charging on the card machine.
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
          <Text style={twStyle("text-sm font-semibold text-amber-900")}>Needs attention</Text>
          {inFlight > 0 ? (
            <Text style={twStyle("mt-1 text-xs text-amber-800")}>
              {inFlight} payment{inFlight === 1 ? "" : "s"} waiting on a card machine.
            </Text>
          ) : null}
          {reconcileExceptions > 0 ? (
            <Text style={twStyle("mt-1 text-xs text-amber-800")}>
              {reconcileExceptions} amount mismatch{reconcileExceptions === 1 ? "" : "es"} in recent payments.
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => void handleReconcile()}
            disabled={reconcileLoading}
            style={twStyle("mt-3 self-start rounded-xl bg-amber-600 px-4 py-2")}
            accessibilityRole="button"
            accessibilityLabel="Check payment status"
          >
            <Text style={twStyle("text-xs font-semibold text-white")}>
              {reconcileLoading ? "Checking…" : "Check payment status"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {sameDeviceAvailable && deviceInfo?.serial ? (
        <View style={twStyle("mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4")}>
          <Text style={twStyle("text-sm font-semibold text-indigo-900")}>This device</Text>
          <Text style={twStyle("mt-1 text-xs text-indigo-800")}>
            {deviceInfo.manufacturer ? `${deviceInfo.manufacturer} ` : ""}
            {deviceInfo.model ?? "Wiseasy terminal"} · ID {deviceInfo.serial.slice(0, 12)}
            {deviceInfo.serial.length > 12 ? "…" : ""}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-indigo-700")}>
            WiseCashier detected — you can pay on this device or link it to a registered machine below.
          </Text>
        </View>
      ) : null}

      <SectionHeader title="Your machines" actionLabel="Add" onAction={openAdd} />

      {terminals.length === 0 ? (
        <EmptyState
          icon="hardware-chip-outline"
          title="No card machines yet"
          description="Add a serial number from your device label or activation email to start taking card payments."
          actionLabel="Add card machine"
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
              accessibilityLabel={`${terminal.name} card machine`}
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
                  <View style={twStyle("ml-3 flex-1")}>
                    <View style={twStyle("flex-row flex-wrap items-center")}>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                        {terminal.name}
                      </Text>
                      {terminal.status === "assigned" ? (
                        <View style={twStyle("ml-2 rounded-full bg-sky-100 px-2 py-0.5")}>
                          <Text style={twStyle("text-[10px] font-semibold text-sky-800")}>
                            Assigned by Beautonomi
                          </Text>
                        </View>
                      ) : null}
                      {terminal.location_id == null ? (
                        <View style={twStyle("ml-2 rounded-full bg-indigo-100 px-2 py-0.5")}>
                          <Text style={twStyle("text-[10px] font-semibold text-indigo-700")}>
                            Portable
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      Serial {terminal.terminal_sn}
                    </Text>
                    {terminal.location_name ? (
                      <Text style={twStyle("text-xs text-gray-400")}>{terminal.location_name}</Text>
                    ) : terminal.location_id == null ? (
                      <Text style={twStyle("text-xs text-gray-400")}>
                        All locations · travels with you
                      </Text>
                    ) : null}
                    {terminal.last_used || terminal.total_transactions > 0 ? (
                      <Text style={twStyle("text-[11px] text-gray-400 mt-0.5")}>
                        {terminal.last_used
                          ? `Last used ${formatLastUsedShort(terminal.last_used)}`
                          : "Never used yet"}
                        {terminal.total_transactions > 0
                          ? ` · ${terminal.total_transactions} payment${terminal.total_transactions === 1 ? "" : "s"}`
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
                        Merchant {terminal.merchant.merchant_no} · Store {terminal.merchant.store_no}
                      </Text>
                    ) : (
                      <Text style={twStyle("text-[11px] text-amber-600 mt-0.5")}>
                        Merchant setup pending
                      </Text>
                    )}
                    {terminal.model ? (
                      <Text style={twStyle("text-[11px] text-gray-400 mt-0.5")}>
                        Device model {terminal.model}
                      </Text>
                    ) : null}
                    {terminal.paired_device_id ? (
                      <Text style={twStyle("text-[11px] text-indigo-600 mt-0.5")}>
                        Linked to device {terminal.paired_device_id.slice(0, 10)}…
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
                      { marginRight: 8 },
                    ]}
                  >
                    <Text
                      style={twStyle(`text-xs ${
                        terminal.is_active ? "text-green-600" : "text-gray-400"
                      }`)}
                    >
                      {terminal.is_active ? "Active" : "Hidden"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => openEdit(terminal)}
                    style={[twStyle("min-h-[44px] min-w-[44px] items-center justify-center"), { marginRight: 8 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${terminal.name}`}
                  >
                    <Ionicons name="pencil-outline" size={18} color="#6b7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(terminal)}
                    style={twStyle("min-h-[44px] min-w-[44px] items-center justify-center")}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${terminal.name}`}
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
                      ? "Linking…"
                      : terminal.paired_device_id === deviceInfo.serial
                        ? "Linked to this device"
                        : "Link this device"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      )}

      <SectionHeader title="Recent card payments" />
      {recentPayments.length === 0 ? (
        <EmptyState
          icon="card-outline"
          title="No card payments yet"
          description="Collect at a booking or sale to see recent card machine payments here."
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
              {reconcileLoading ? "Checking…" : "Check payment status"}
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
          accessibilityLabel="Order card machines from terminal shop"
        >
          <View style={twStyle("h-10 w-10 items-center justify-center rounded-lg bg-pink-100")}>
            <Ionicons name="cart-outline" size={20} color="#db2777" />
          </View>
          <View style={twStyle("ml-3 flex-1")}>
            <Text style={twStyle("text-sm font-semibold text-pink-900")}>Need another machine?</Text>
            <Text style={twStyle("text-xs text-pink-700")}>
              Order from the Beautonomi catalog
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#db2777" />
        </TouchableOpacity>
      ) : null}

      <View style={twStyle("h-8")} />

      <BottomSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        title={editTerminal ? "Edit card machine" : "Add card machine"}
        snapHeight="auto"
      >
        {!editTerminal ? (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
              Serial number *
            </Text>
            <TextInput
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
              value={formSerial}
              onChangeText={setFormSerial}
              placeholder="From device label or activation email"
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Card machine serial number"
            />
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>
              Printed on the device label or included in your activation email.
            </Text>
          </View>
        ) : (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Serial number</Text>
            <Text
              style={twStyle("rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-xs text-gray-600")}
              selectable
            >
              {editTerminal.terminal_sn}
            </Text>
          </View>
        )}

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Display name *</Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
            value={formName}
            onChangeText={setFormName}
            placeholder="e.g. Front desk, Portable"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Card machine display name"
          />
        </View>

        {Array.isArray(locations) && locations.length > 0 ? (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Location</Text>
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>
              Choose All locations for a portable machine you take to house calls.
            </Text>
            <View style={twStyle("flex-row flex-wrap")}>
              <TouchableOpacity
                onPress={() => setFormLocationId(null)}
                style={[
                  twStyle(`rounded-full px-3 py-1.5 ${
                    !formLocationId ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"
                  }`),
                  { marginRight: 8, marginBottom: 8 },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: !formLocationId }}
              >
                <Text
                  style={twStyle(`text-xs font-medium ${
                    !formLocationId ? "text-white" : "text-gray-600"
                  }`)}
                >
                  All locations
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
                      { marginRight: 8, marginBottom: 8 },
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
          <View style={twStyle("flex-1 pr-4")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>Show at checkout</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              Turn off to hide this machine without removing it.
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
          label={editTerminal ? "Save changes" : "Add card machine"}
          onPress={handleSaveTerminal}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}
