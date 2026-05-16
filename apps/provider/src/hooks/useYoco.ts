/**
 * Yoco integration hooks for the provider app.
 * Calls existing backend API endpoints at /api/provider/yoco/*.
 */
import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import { api } from "@/lib/api-client";

/* ─── Types ─── */

export interface YocoDevice {
  id: string;
  name: string;
  serial_number: string;
  device_type: "web_pos" | "card_machine";
  location_id: string | null;
  location_name?: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface YocoIntegration {
  id: string;
  provider_id: string;
  is_enabled: boolean;
  api_key_set: boolean;
  webhook_configured: boolean;
  created_at: string;
  /** Present on GET when plan does not include Yoco (UI can prompt upgrade). */
  subscription_required?: boolean;
}

export interface YocoPaymentRequest {
  amount_cents: number;
  currency: string;
  device_id: string;
  booking_id?: string;
  sale_id?: string;
  description?: string;
}

export interface YocoPaymentResult {
  id: string;
  status: "successful" | "failed" | "pending";
  reference: string;
  amount_cents: number;
  receipt_url?: string;
}

/* ─── Integration Status ─── */

function normalizeIntegrationPayload(raw: Record<string, unknown> | null | undefined): YocoIntegration | null {
  if (!raw || typeof raw !== "object") return null;
  const pub = raw.public_key;
  /** GET /api/provider/yoco/integration sets this when both public + secret are stored (required for Web POS Bearer calls). */
  const hasKey =
    typeof raw.api_key_set === "boolean"
      ? raw.api_key_set
      : (typeof pub === "string" && pub.length > 0);
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    provider_id: typeof raw.provider_id === "string" ? raw.provider_id : "",
    is_enabled: raw.is_enabled === true,
    api_key_set: hasKey,
    webhook_configured: raw.webhook_configured === true,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    subscription_required: raw.subscription_required === true,
  };
}

export function useYocoIntegration() {
  const [integration, setIntegration] = useState<YocoIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Record<string, unknown>>("/api/provider/yoco/integration");
      if (res.error) {
        setError(res.error.message ?? "Failed to load Yoco status");
        setIntegration(null);
        return;
      }
      setIntegration(normalizeIntegrationPayload(res.data as Record<string, unknown>));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Yoco status");
      setIntegration(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connect = useCallback(
    async (apiKey: string, secretKey: string) => {
      try {
        const res = await api.post<Record<string, unknown>>("/api/provider/yoco/integration", {
          api_key: apiKey,
          secret_key: secretKey,
        });
        if (res.error) {
          Alert.alert("Error", res.error.message || "Failed to connect Yoco");
          return false;
        }
        // POST body omits api_key_set; always re-fetch so state matches GET (payments sheet + Settings).
        await load();
        return true;
      } catch {
        Alert.alert("Error", "Failed to connect Yoco");
        return false;
      }
    },
    [load],
  );

  const disconnect = useCallback(async () => {
    try {
      const res = await api.delete("/api/provider/yoco/integration");
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to disconnect");
        return false;
      }
      await load();
      return true;
    } catch {
      Alert.alert("Error", "Failed to disconnect Yoco");
      return false;
    }
  }, [load]);

  return { integration, loading, error, reload: load, connect, disconnect };
}

/* ─── Device Management ─── */

export function useYocoDevices() {
  const [devices, setDevices] = useState<YocoDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const normalizeDevice = useCallback((raw: unknown): YocoDevice | null => {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) return null;
    const fallbackDeviceId =
      typeof row.device_id === "string" && row.device_id.length > 0
        ? row.device_id
        : "";
    const serialNumber =
      typeof row.serial_number === "string" && row.serial_number.length > 0
        ? row.serial_number
        : fallbackDeviceId;
    const deviceType =
      row.device_type === "card_machine" || row.device_type === "web_pos"
        ? row.device_type
        : "web_pos";
    const isActive =
      typeof row.is_active === "boolean"
        ? row.is_active
        : row.active === true;
    return {
      id,
      name: typeof row.name === "string" && row.name.length > 0 ? row.name : "Yoco device",
      serial_number: serialNumber,
      device_type: deviceType,
      location_id: typeof row.location_id === "string" ? row.location_id : null,
      location_name: typeof row.location_name === "string" ? row.location_name : undefined,
      is_active: isActive,
      last_used_at: typeof row.last_used_at === "string" ? row.last_used_at : null,
      created_at:
        typeof row.created_at === "string" && row.created_at.length > 0
          ? row.created_at
          : new Date().toISOString(),
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<YocoDevice[] | { data: YocoDevice[] }>(
        "/api/provider/yoco/devices",
      );
      if (res.error) {
        setError(res.error.message);
      } else {
        const data = res.data;
        const list = Array.isArray(data)
          ? data
          : (data as { data: YocoDevice[] })?.data ?? [];
        setDevices(
          list
            .map((row) => normalizeDevice(row))
            .filter((row): row is YocoDevice => row != null),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, [normalizeDevice]);

  useEffect(() => {
    load();
  }, [load]);

  const addDevice = useCallback(
    async (input: {
      name: string;
      location_id?: string | null;
      is_active?: boolean;
    }) => {
      try {
        const res = await api.post<YocoDevice>("/api/provider/yoco/devices", {
          name: input.name,
          location_id: input.location_id ?? undefined,
          is_active: input.is_active ?? true,
        });
        if (res.error) {
          Alert.alert("Error", res.error.message || "Failed to add device");
          return null;
        }
        await load();
        return res.data;
      } catch {
        Alert.alert("Error", "Failed to add device");
        return null;
      }
    },
    [load],
  );

  const updateDevice = useCallback(
    async (id: string, updates: Partial<Pick<YocoDevice, "name" | "location_id" | "is_active">>) => {
      try {
        const body: Record<string, unknown> = {};
        if (updates.name !== undefined) body.name = updates.name;
        if (updates.location_id !== undefined) body.location_id = updates.location_id;
        if (updates.is_active !== undefined) body.is_active = updates.is_active;
        const res = await api.put<YocoDevice>(`/api/provider/yoco/devices/${id}`, body);
        if (res.error) {
          Alert.alert("Error", res.error.message || "Failed to update");
          return false;
        }
        await load();
        return true;
      } catch {
        Alert.alert("Error", "Failed to update device");
        return false;
      }
    },
    [load],
  );

  const deleteDevice = useCallback(async (id: string) => {
    try {
      const res = await api.delete(`/api/provider/yoco/devices/${id}`);
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to delete");
        return false;
      }
      setDevices((prev) => prev.filter((d) => d.id !== id));
      return true;
    } catch {
      Alert.alert("Error", "Failed to delete device");
      return false;
    }
  }, []);

  return { devices, loading, error, reload: load, addDevice, updateDevice, deleteDevice };
}

/* ─── Payment Processing ─── */

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

/** Map Yoco / API status strings to a stable union (Yoco may return different casings). */
function normalizePaymentStatus(raw: string | undefined | null): YocoPaymentResult["status"] {
  const s = (raw ?? "").toLowerCase();
  if (s === "successful" || s === "completed" || s === "paid" || s === "success") return "successful";
  if (s === "failed" || s === "declined" || s === "cancelled" || s === "canceled" || s === "voided") {
    return "failed";
  }
  return "pending";
}

function toPaymentResult(row: Record<string, unknown>): YocoPaymentResult {
  const ref =
    (typeof row.reference === "string" && row.reference) ||
    (typeof row.yoco_payment_id === "string" && row.yoco_payment_id) ||
    String(row.id ?? "");
  const amountCents =
    typeof row.amount_cents === "number"
      ? row.amount_cents
      : typeof row.amount === "number"
        ? row.amount
        : 0;
  return {
    id: String(row.id ?? ""),
    status: normalizePaymentStatus(typeof row.status === "string" ? row.status : undefined),
    reference: ref,
    amount_cents: amountCents,
    receipt_url:
      typeof row.receipt_url === "string"
        ? row.receipt_url
        : undefined,
  };
}

export function useYocoPayment() {
  const [processing, setProcessing] = useState(false);

  const processPayment = useCallback(
    async (request: YocoPaymentRequest): Promise<YocoPaymentResult | null> => {
      setProcessing(true);
      try {
        const res = await api.post<Record<string, unknown>>(
          "/api/provider/yoco/payments",
          request as unknown as Record<string, unknown>,
        );
        if (res.error) {
          const code = res.error.code;
          const msg =
            code === "SUBSCRIPTION_REQUIRED"
              ? "Upgrade your plan to use Yoco card payments."
              : code === "TERMINAL_UNAVAILABLE" || code === "TERMINAL_NOT_FOUND"
                ? res.error.message ||
                  "Could not reach your Yoco terminal. Check that it is powered on, online, and paired, then try again."
                : res.error.message || "Card payment could not be processed";
          const title =
            code === "SUBSCRIPTION_REQUIRED"
              ? "Yoco not available"
              : code === "TERMINAL_UNAVAILABLE" || code === "TERMINAL_NOT_FOUND"
                ? "Terminal unavailable"
                : "Payment Failed";
          Alert.alert(title, msg);
          return null;
        }
        const raw = res.data;
        if (!raw || typeof raw !== "object") return null;
        const data = toPaymentResult(raw as Record<string, unknown>);

        // If still pending, poll until success/fail or timeout (avoids "check the device" without follow-up)
        if (data.status === "pending" && data.id) {
          const deadline = Date.now() + POLL_TIMEOUT_MS;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            try {
              const pollRes = await api.get<Record<string, unknown>>(
                `/api/provider/yoco/payments/${data.id}`,
              );
              if (pollRes.error) continue;
              const pr = pollRes.data;
              if (!pr || typeof pr !== "object") continue;
              const merged = toPaymentResult({ ...(raw as Record<string, unknown>), ...pr });
              if (merged.status === "successful" || merged.status === "failed") {
                return merged;
              }
            } catch {
              // continue polling
            }
          }
          Alert.alert("Payment timed out", "You can try again.");
          return null;
        }

        return data;
      } catch {
        Alert.alert("Payment Failed", "Could not process card payment");
        return null;
      } finally {
        setProcessing(false);
      }
    },
    [],
  );

  return { processPayment, processing };
}
