/**
 * PayCloud integration hooks for the provider app.
 * Calls existing backend API endpoints at /api/provider/paycloud/*.
 */
import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import { api } from "@/lib/api-client";
import type { PaycloudIntentContract, PaycloudIntentPayload } from "@/lib/paycloud-same-terminal";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

/* ─── Platform availability gate ─── */

const PAYCLOUD_PLATFORM_DISABLED_CODE = "PAYCLOUD_DISABLED_BY_PLATFORM";
const PAYCLOUD_PLATFORM_FLAG_KEY = "payment_paycloud";
const PAYCLOUD_SESSION_DISABLE_TTL_MS = 5 * 60 * 1000;

let paycloudPlatformDisabledUntil: number | null = null;

function isPaycloudPlatformSessionDisabled(): boolean {
  if (paycloudPlatformDisabledUntil == null) return false;
  if (Date.now() >= paycloudPlatformDisabledUntil) {
    paycloudPlatformDisabledUntil = null;
    return false;
  }
  return true;
}

function notePaycloudPlatformDisabled(code: string | undefined): void {
  if (code === PAYCLOUD_PLATFORM_DISABLED_CODE) {
    paycloudPlatformDisabledUntil = Date.now() + PAYCLOUD_SESSION_DISABLE_TTL_MS;
    notifySettingsSubscribers();
  }
}

function clearPaycloudPlatformSessionDisable(): void {
  if (paycloudPlatformDisabledUntil != null) {
    paycloudPlatformDisabledUntil = null;
    notifySettingsSubscribers();
  }
}

let appStateSubscriptionAttached = false;
function ensureAppStatePaycloudRecovery(): void {
  if (appStateSubscriptionAttached) return;
  appStateSubscriptionAttached = true;
  AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") {
      clearPaycloudPlatformSessionDisable();
    }
  });
}

function usePayCloudPlatformAvailability(): { ready: boolean; disabled: boolean } {
  ensureAppStatePaycloudRecovery();
  const { bundle, isLoading, error } = useConfigBundle();
  const flag = bundle?.flags?.[PAYCLOUD_PLATFORM_FLAG_KEY];
  const flagDisabled = !isLoading && !error && flag != null && flag.enabled !== true;
  return {
    ready: !isLoading,
    disabled: isPaycloudPlatformSessionDisabled() || flagDisabled,
  };
}

/* ─── Types ─── */

export interface PayCloudMerchantInfo {
  label: string;
  merchant_no: string;
  store_no: string;
}

export interface PayCloudTerminal {
  id: string;
  name: string;
  display_name: string;
  terminal_sn: string;
  serial_number: string;
  model?: string | null;
  paired_device_id?: string | null;
  location_id: string | null;
  location_name?: string | null;
  is_active: boolean;
  status: string;
  source: string;
  total_transactions: number;
  total_amount: number;
  last_used: string | null;
  last_error: string | null;
  in_flight_payment_id?: string | null;
  created_at: string;
  merchant?: PayCloudMerchantInfo | null;
}

export interface PayCloudReadinessBlocker {
  code: string;
  title: string;
  actionLabel: string;
  href?: string;
}

export interface PayCloudReadinessWarning {
  code: string;
  message: string;
}

export interface PayCloudTerminalSummary {
  active: number;
  suspended: number;
  inFlight: number;
  withoutMerchant: number;
}

export interface PayCloudPlanInfo {
  enabled: boolean;
  maxTerminals: number | null;
  usedTerminals: number;
}

export interface PayCloudSettings {
  accept_paycloud: boolean;
  qr_payments_enabled: boolean;
  cashback_enabled: boolean;
  active_terminal_count: number;
  ready: boolean;
  blockers?: PayCloudReadinessBlocker[];
  warnings?: PayCloudReadinessWarning[];
  terminals?: PayCloudTerminalSummary;
  plan?: PayCloudPlanInfo;
  account_environment?: "sandbox" | "live" | "mixed" | null;
}

export type PayCloudEntityType =
  | "booking"
  | "group_booking"
  | "sale"
  | "product_order"
  | "additional_charge";

export interface PayCloudPaymentRequest {
  terminal_id: string;
  entity_type: PayCloudEntityType;
  entity_id: string;
  amount?: number;
  tip_amount?: number;
  cashback_amount?: number;
  pay_method?: "card" | "qr";
  currency?: string;
  booking_id?: string | null;
  sale_id?: string | null;
  group_booking_id?: string | null;
  /** cloud = ecrorder to terminal; same_terminal = Intent on this device. */
  channel?: "cloud" | "same_terminal";
  /** Best-effort device serial for same-terminal validation. */
  device_serial?: string;
  device_model?: string;
  device_manufacturer?: string;
  serial_source?: "build_serial" | "wiseasy_property" | "android_id";
}

export type { PaycloudIntentContract, PaycloudIntentPayload };

export type PayCloudPaymentStatus =
  | "pending"
  | "processing"
  | "successful"
  | "failed"
  | "cancelled"
  | "closed";

export type PayCloudAmountMatchStatus = "exact" | "over" | "under" | "mismatch" | "pending";

export interface PayCloudPaymentResult {
  id: string;
  payment_id?: string;
  merchant_order_no: string;
  status: PayCloudPaymentStatus;
  amount: number;
  currency: string;
  tip_amount?: number;
  cashback_amount?: number;
  pay_scenario?: string;
  error_message?: string;
  channel?: "cloud" | "same_terminal";
  intent_payload?: PaycloudIntentPayload;
  /** Captured-vs-expected comparison. "under"/"mismatch" captures are NOT
   *  auto-settled and must be resolved via reconciliation/superadmin. */
  amount_match_status?: PayCloudAmountMatchStatus;
  expected_amount?: number;
}

/** Capture succeeded on the machine but did not settle because the captured
 *  amount fell short of the outstanding balance. Never treat as plain success. */
/** Capture succeeded on the machine but did not settle because the captured
 *  amount fell short of the outstanding balance. Never treat as plain success. */
export function isPaycloudCaptureUnderReview(
  result: PayCloudPaymentResult | null | undefined,
): boolean {
  if (!result || result.status !== "successful") return false;
  return result.amount_match_status === "under" || result.amount_match_status === "mismatch";
}

export type PayCloudPaymentCreateResult =
  | { ok: true; payment: PayCloudPaymentResult; reused?: boolean }
  | { ok: false; code?: string; message: string; existingPaymentId?: string };

export function humanizePaycloudPaymentError(code: string | undefined, fallback?: string): {
  title: string;
  message: string;
} {
  switch (code) {
    case "SUBSCRIPTION_REQUIRED":
      return { title: "Plan upgrade needed", message: "Upgrade your plan to use Beautonomi card machines." };
    case "PAYCLOUD_NOT_ACCEPTED":
      return { title: "Card payments are off", message: "Enable in-person card payments in Card machines settings." };
    case "TERMINAL_UNAVAILABLE":
    case "TERMINAL_NOT_FOUND":
      return {
        title: "Card machine unavailable",
        message:
          fallback ||
          "Could not reach the card machine. Check it is powered on, online, and connected to the internet.",
      };
    case "TERMINAL_NOT_CONFIGURED":
      return { title: "Card machine unavailable", message: "This card machine isn't fully set up yet." };
    case "DEVICE_TERMINAL_MISMATCH":
      return {
        title: "Wrong card machine",
        message: "This device does not match the selected card machine. Choose the machine registered to this device.",
      };
    case "DEVICE_SERIAL_REQUIRED":
      return {
        title: "Device not linked",
        message: "Could not identify this device. Link it in Card machines or send to the card machine instead.",
      };
    case "AMOUNT_MISMATCH":
      return { title: "Amount mismatch", message: "Amount does not match the outstanding balance." };
    case "TERMINAL_IN_FLIGHT":
    case "ENTITY_IN_FLIGHT":
      return {
        title: "Payment already in progress",
        message: fallback || "A payment is already in progress. You can resume it or cancel it first.",
      };
    case "ALREADY_PAID":
      return { title: "Already paid", message: fallback || "This item is already paid." };
    case "BOOKING_NOT_COLLECTIBLE":
      return { title: "Cannot charge", message: fallback || "This booking cannot be charged." };
    case "ZERO_AMOUNT":
      return { title: "Nothing to charge", message: "There is no outstanding balance to collect." };
    default:
      return { title: "Payment failed", message: fallback || "Card payment could not be started." };
  }
}

/* ─── Terminal Management ─── */

function normalizeTerminal(raw: unknown): PayCloudTerminal | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) return null;
  const terminalSn =
    (typeof row.terminal_sn === "string" && row.terminal_sn) ||
    (typeof row.serial_number === "string" && row.serial_number) ||
    "";
  const displayName =
    (typeof row.display_name === "string" && row.display_name) ||
    (typeof row.name === "string" && row.name) ||
    "Card machine";
  const lastUsed =
    (typeof row.last_used === "string" && row.last_used) ||
    (typeof row.last_used_at === "string" && row.last_used_at) ||
    null;
  return {
    id,
    name: displayName,
    display_name: displayName,
    terminal_sn: terminalSn,
    serial_number: terminalSn,
    model: typeof row.model === "string" ? row.model : null,
    paired_device_id:
      typeof row.paired_device_id === "string" ? row.paired_device_id : null,
    location_id: typeof row.location_id === "string" ? row.location_id : null,
    location_name:
      typeof row.location_name === "string" ? row.location_name : undefined,
    is_active: row.is_active === true,
    status: typeof row.status === "string" ? row.status : "active",
    source: typeof row.source === "string" ? row.source : "self_add",
    total_transactions:
      typeof row.total_transactions === "number" ? row.total_transactions : 0,
    total_amount: typeof row.total_amount === "number" ? row.total_amount : 0,
    last_used: lastUsed,
    last_error: typeof row.last_error === "string" ? row.last_error : null,
    in_flight_payment_id:
      typeof row.in_flight_payment_id === "string" ? row.in_flight_payment_id : null,
    created_at:
      typeof row.created_at === "string" && row.created_at.length > 0
        ? row.created_at
        : new Date().toISOString(),
    merchant:
      row.merchant && typeof row.merchant === "object"
        ? {
            label: String((row.merchant as Record<string, unknown>).label ?? ""),
            merchant_no: String((row.merchant as Record<string, unknown>).merchant_no ?? ""),
            store_no: String((row.merchant as Record<string, unknown>).store_no ?? ""),
          }
        : null,
  };
}

export function usePayCloudTerminals() {
  const { ready: platformReady, disabled: platformDisabled } =
    usePayCloudPlatformAvailability();
  const [terminals, setTerminals] = useState<PayCloudTerminal[]>([]);
  const [acceptPaycloud, setAcceptPaycloud] = useState(false);
  const [qrPaymentsEnabled, setQrPaymentsEnabled] = useState(false);
  const [cashbackEnabled, setCashbackEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{
        terminals?: PayCloudTerminal[];
        accept_paycloud?: boolean;
        qr_payments_enabled?: boolean;
        cashback_enabled?: boolean;
      }>("/api/provider/paycloud/terminals");
      if (res.error) {
        notePaycloudPlatformDisabled(res.error.code);
        setError(res.error.message ?? "Failed to load card machines");
        setTerminals([]);
        return;
      }
      const data = res.data;
      const list = Array.isArray(data?.terminals) ? data.terminals : [];
      setTerminals(
        list
          .map((row) => normalizeTerminal(row))
          .filter((row): row is PayCloudTerminal => row != null),
      );
      setAcceptPaycloud(data?.accept_paycloud === true);
      setQrPaymentsEnabled(data?.qr_payments_enabled === true);
      setCashbackEnabled(data?.cashback_enabled === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load card machines");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!platformReady) return;
    if (platformDisabled) {
      setTerminals([]);
      setError(null);
      setLoading(false);
      return;
    }
    void load();
  }, [platformReady, platformDisabled, load]);

  const addTerminal = useCallback(
    async (input: {
      terminal_sn: string;
      display_name: string;
      location_id?: string | null;
    }) => {
      try {
        const res = await api.post<PayCloudTerminal>(
          "/api/provider/paycloud/terminals",
          {
            terminal_sn: input.terminal_sn.trim(),
            display_name: input.display_name.trim(),
            location_id: input.location_id ?? undefined,
          },
        );
        if (res.error) {
          const code = res.error.code;
          const msg =
            code === "SUBSCRIPTION_REQUIRED"
              ? "Upgrade your plan to add card machines."
              : code === "TERMINAL_LIMIT_REACHED"
                ? res.error.message || "You've reached the card machine limit on your plan."
                : code === "DUPLICATE_TERMINAL"
                  ? "This serial number is already registered."
                  : res.error.message || "Failed to add card machine";
          Alert.alert("Couldn't add card machine", msg);
          return null;
        }
        await load();
        return normalizeTerminal(res.data);
      } catch {
        Alert.alert("Couldn't add card machine", "Something went wrong. Please try again.");
        return null;
      }
    },
    [load],
  );

  const updateTerminal = useCallback(
    async (
      id: string,
      updates: Partial<{
        display_name: string;
        location_id: string | null;
        is_active: boolean;
        paired_device_id: string | null;
      }>,
    ) => {
      try {
        const body: Record<string, unknown> = {};
        if (updates.display_name !== undefined) body.display_name = updates.display_name;
        if (updates.location_id !== undefined) body.location_id = updates.location_id;
        if (updates.is_active !== undefined) body.is_active = updates.is_active;
        if (updates.paired_device_id !== undefined) body.paired_device_id = updates.paired_device_id;
        const res = await api.put<PayCloudTerminal>(
          `/api/provider/paycloud/terminals/${id}`,
          body,
        );
        if (res.error) {
          Alert.alert("Couldn't update", res.error.message || "Failed to update card machine");
          return false;
        }
        await load();
        return true;
      } catch {
        Alert.alert("Couldn't update", "Failed to update card machine");
        return false;
      }
    },
    [load],
  );

  const deleteTerminal = useCallback(
    async (id: string) => {
      try {
        const res = await api.delete(`/api/provider/paycloud/terminals/${id}`);
        if (res.error) {
          Alert.alert("Couldn't remove", res.error.message || "Failed to remove card machine");
          return false;
        }
        setTerminals((prev) => prev.filter((t) => t.id !== id));
        return true;
      } catch {
        Alert.alert("Couldn't remove", "Failed to remove card machine");
        return false;
      }
    },
    [],
  );

  return {
    terminals,
    acceptPaycloud,
    qrPaymentsEnabled,
    cashbackEnabled,
    loading,
    error,
    reload: load,
    addTerminal,
    updateTerminal,
    deleteTerminal,
  };
}

/* ─── Settings (shared module cache) ─── */

type SettingsStore = {
  settings: PayCloudSettings | null;
  loading: boolean;
  error: string | null;
  subscribers: Set<() => void>;
  loadPromise: Promise<void> | null;
  platformReady: boolean;
  platformDisabled: boolean;
};

const settingsStore: SettingsStore = {
  settings: null,
  loading: true,
  error: null,
  subscribers: new Set(),
  loadPromise: null,
  platformReady: false,
  platformDisabled: false,
};

/** Cached snapshot so useSyncExternalStore getSnapshot returns a stable reference. */
let settingsSnapshot: Pick<SettingsStore, "settings" | "loading" | "error"> = {
  settings: settingsStore.settings,
  loading: settingsStore.loading,
  error: settingsStore.error,
};

function refreshSettingsSnapshot(): void {
  if (
    settingsSnapshot.settings === settingsStore.settings &&
    settingsSnapshot.loading === settingsStore.loading &&
    settingsSnapshot.error === settingsStore.error
  ) {
    return;
  }
  settingsSnapshot = {
    settings: settingsStore.settings,
    loading: settingsStore.loading,
    error: settingsStore.error,
  };
}

function notifySettingsSubscribers(): void {
  refreshSettingsSnapshot();
  settingsStore.subscribers.forEach((fn) => fn());
}

function subscribeSettings(onStoreChange: () => void): () => void {
  settingsStore.subscribers.add(onStoreChange);
  return () => {
    settingsStore.subscribers.delete(onStoreChange);
  };
}

function getSettingsSnapshot(): Pick<SettingsStore, "settings" | "loading" | "error"> {
  return settingsSnapshot;
}

function normalizePayCloudSettings(raw: PayCloudSettings | null | undefined): PayCloudSettings | null {
  if (!raw) return null;
  return {
    accept_paycloud: raw.accept_paycloud === true,
    qr_payments_enabled: raw.qr_payments_enabled === true,
    cashback_enabled: raw.cashback_enabled === true,
    active_terminal_count:
      typeof raw.active_terminal_count === "number" ? raw.active_terminal_count : 0,
    ready: raw.ready === true,
    blockers: Array.isArray(raw.blockers) ? raw.blockers : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    terminals:
      raw.terminals && typeof raw.terminals === "object"
        ? (raw.terminals as PayCloudTerminalSummary)
        : undefined,
    plan:
      raw.plan && typeof raw.plan === "object" ? (raw.plan as PayCloudPlanInfo) : undefined,
    account_environment:
      raw.account_environment === "sandbox" ||
      raw.account_environment === "live" ||
      raw.account_environment === "mixed"
        ? raw.account_environment
        : null,
  };
}

async function loadPayCloudSettingsShared(): Promise<void> {
  if (!settingsStore.platformReady) return;
  if (settingsStore.platformDisabled) {
    settingsStore.settings = null;
    settingsStore.error = null;
    settingsStore.loading = false;
    notifySettingsSubscribers();
    return;
  }
  if (settingsStore.loadPromise) {
    await settingsStore.loadPromise;
    return;
  }

  settingsStore.loading = true;
  settingsStore.error = null;
  notifySettingsSubscribers();

  settingsStore.loadPromise = (async () => {
    try {
      const res = await api.get<PayCloudSettings>("/api/provider/paycloud/settings");
      if (res.error) {
        notePaycloudPlatformDisabled(res.error.code);
        settingsStore.error = res.error.message ?? "Failed to load card machine settings";
        settingsStore.settings = null;
        return;
      }
      settingsStore.settings = normalizePayCloudSettings(res.data);
    } catch (e) {
      settingsStore.error =
        e instanceof Error ? e.message : "Failed to load card machine settings";
      settingsStore.settings = null;
    } finally {
      settingsStore.loading = false;
      settingsStore.loadPromise = null;
      notifySettingsSubscribers();
    }
  })();

  await settingsStore.loadPromise;
}

export function usePayCloudSettings() {
  const { ready: platformReady, disabled: platformDisabled } =
    usePayCloudPlatformAvailability();

  useEffect(() => {
    const prevReady = settingsStore.platformReady;
    const prevDisabled = settingsStore.platformDisabled;
    settingsStore.platformReady = platformReady;
    settingsStore.platformDisabled = platformDisabled;

    if (
      platformReady &&
      (!prevReady || prevDisabled !== platformDisabled || !settingsStore.settings)
    ) {
      void loadPayCloudSettingsShared();
    }
  }, [platformReady, platformDisabled]);

  const snapshot = useSyncExternalStore(subscribeSettings, getSettingsSnapshot, getSettingsSnapshot);

  const reload = useCallback(async () => {
    settingsStore.loadPromise = null;
    await loadPayCloudSettingsShared();
  }, []);

  const updateSettings = useCallback(
    async (
      updates: Partial<
        Pick<
          PayCloudSettings,
          "accept_paycloud" | "qr_payments_enabled" | "cashback_enabled"
        >
      >,
    ) => {
      try {
        const res = await api.patch("/api/provider/paycloud/settings", updates);
        if (res.error) {
          Alert.alert("Error", res.error.message || "Failed to update settings");
          return false;
        }
        settingsStore.loadPromise = null;
        await loadPayCloudSettingsShared();
        return true;
      } catch {
        Alert.alert("Error", "Failed to update settings");
        return false;
      }
    },
    [],
  );

  return {
    settings: snapshot.settings,
    loading: snapshot.loading,
    error: snapshot.error,
    reload,
    updateSettings,
  };
}

/* ─── Payment Processing ─── */

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

function normalizePaymentStatus(raw: string | undefined | null): PayCloudPaymentStatus {
  const s = (raw ?? "").toLowerCase();
  if (s === "successful" || s === "completed" || s === "paid" || s === "success") {
    return "successful";
  }
  if (
    s === "failed" ||
    s === "declined" ||
    s === "cancelled" ||
    s === "canceled" ||
    s === "voided"
  ) {
    return "failed";
  }
  if (s === "closed") return "closed";
  if (s === "processing") return "processing";
  return "pending";
}

function toPaymentResult(row: Record<string, unknown>): PayCloudPaymentResult {
  const id = String(row.id ?? row.payment_id ?? "");
  const amount =
    typeof row.amount === "number"
      ? row.amount
      : typeof row.order_amount === "number"
        ? row.order_amount
        : 0;
  return {
    id,
    payment_id:
      typeof row.payment_id === "string"
        ? row.payment_id
        : typeof row.id === "string"
          ? row.id
          : undefined,
    merchant_order_no:
      typeof row.merchant_order_no === "string" ? row.merchant_order_no : "",
    status: normalizePaymentStatus(typeof row.status === "string" ? row.status : undefined),
    amount,
    currency: typeof row.currency === "string" ? row.currency : "ZAR",
    tip_amount: typeof row.tip_amount === "number" ? row.tip_amount : undefined,
    cashback_amount:
      typeof row.cashback_amount === "number" ? row.cashback_amount : undefined,
    pay_scenario:
      typeof row.pay_scenario === "string" ? row.pay_scenario : undefined,
    error_message:
      typeof row.error_message === "string" ? row.error_message : undefined,
    channel:
      row.channel === "same_terminal" || row.channel === "cloud"
        ? row.channel
        : undefined,
    intent_payload:
      row.intent_payload && typeof row.intent_payload === "object"
        ? (row.intent_payload as PaycloudIntentPayload)
        : undefined,
    amount_match_status:
      row.amount_match_status === "exact" ||
      row.amount_match_status === "over" ||
      row.amount_match_status === "under" ||
      row.amount_match_status === "mismatch" ||
      row.amount_match_status === "pending"
        ? row.amount_match_status
        : undefined,
    expected_amount:
      typeof row.expected_amount === "number" ? row.expected_amount : undefined,
  };
}

export function usePayCloudPayment() {
  const [processing, setProcessing] = useState(false);

  const pollPayment = useCallback(
    async (paymentId: string): Promise<PayCloudPaymentResult | null> => {
      try {
        const res = await api.get<Record<string, unknown>>(
          `/api/provider/paycloud/payments/${paymentId}`,
        );
        if (res.error) return null;
        const raw = res.data;
        if (!raw || typeof raw !== "object") return null;
        return toPaymentResult(raw as Record<string, unknown>);
      } catch {
        return null;
      }
    },
    [],
  );

  const closePayment = useCallback(async (paymentId: string): Promise<boolean> => {
    try {
      const res = await api.post<Record<string, unknown>>(
        `/api/provider/paycloud/payments/${paymentId}/close`,
        {},
      );
      if (res.error) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const voidPayment = useCallback(async (paymentId: string): Promise<PayCloudPaymentResult | null> => {
    try {
      const res = await api.post<Record<string, unknown>>(
        `/api/provider/paycloud/payments/${paymentId}/void`,
        {},
      );
      if (res.error) {
        Alert.alert("Void failed", res.error.message || "Could not void on the card machine.");
        return null;
      }
      const raw = res.data;
      if (!raw || typeof raw !== "object") return null;
      return toPaymentResult(raw as Record<string, unknown>);
    } catch {
      Alert.alert("Void failed", "Could not void on the card machine.");
      return null;
    }
  }, []);

  const confirmPayment = useCallback(
    async (
      paymentId: string,
      options?: {
        intent_result?: {
          result?: string;
          resultMsg?: string;
          transData?: string | Record<string, unknown>;
        };
        device_model?: string;
        device_manufacturer?: string;
        serial_source?: "build_serial" | "wiseasy_property" | "android_id";
      },
    ): Promise<PayCloudPaymentResult | null> => {
    try {
      const res = await api.post<Record<string, unknown>>(
        `/api/provider/paycloud/payments/${paymentId}/confirm`,
        options ?? {},
      );
      if (res.error) return null;
      const raw = res.data;
      if (!raw || typeof raw !== "object") return null;
      const payment = (raw as { payment?: Record<string, unknown> }).payment ?? raw;
      if (payment && typeof payment === "object") {
        return toPaymentResult(payment as Record<string, unknown>);
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const createPayment = useCallback(
    async (request: PayCloudPaymentRequest): Promise<PayCloudPaymentCreateResult> => {
      setProcessing(true);
      try {
        const res = await api.post<Record<string, unknown>>(
          "/api/provider/paycloud/payments",
          request as unknown as Record<string, unknown>,
        );
        if (res.error) {
          const code = res.error.code;
          const existingPaymentId =
            typeof (res.data as { payment_id?: string } | null)?.payment_id === "string"
              ? (res.data as { payment_id: string }).payment_id
              : undefined;
          const humanized = humanizePaycloudPaymentError(code, res.error.message);
          if (code !== "TERMINAL_IN_FLIGHT" && code !== "ENTITY_IN_FLIGHT") {
            Alert.alert(humanized.title, humanized.message);
          }
          return {
            ok: false,
            code,
            message: humanized.message,
            existingPaymentId,
          };
        }

        const raw = res.data;
        if (!raw || typeof raw !== "object") {
          return { ok: false, message: "Card payment could not be started." };
        }
        const data = toPaymentResult(raw as Record<string, unknown>);
        const reused = (raw as { reused?: boolean }).reused === true;
        const paymentId = data.id || data.payment_id;
        if (!paymentId) return { ok: true, payment: data, reused };

        if (data.channel === "same_terminal" && data.intent_payload) {
          return { ok: true, payment: data, reused };
        }

        if (data.status === "successful" || data.status === "failed") {
          return { ok: true, payment: data, reused };
        }

        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          const polled = await pollPayment(paymentId);
          if (!polled) continue;
          if (
            polled.status === "successful" ||
            polled.status === "failed" ||
            polled.status === "closed" ||
            polled.status === "cancelled"
          ) {
            return { ok: true, payment: polled, reused };
          }
        }

        return {
          ok: false,
          code: "POLL_TIMEOUT",
          message: "The card machine did not respond in time. You can resume or cancel the payment.",
          existingPaymentId: paymentId,
        };
      } catch {
        Alert.alert("Payment failed", "Could not process the card payment");
        return { ok: false, message: "Could not process the card payment" };
      } finally {
        setProcessing(false);
      }
    },
    [pollPayment],
  );

  return { createPayment, pollPayment, closePayment, voidPayment, confirmPayment, processing };
}
