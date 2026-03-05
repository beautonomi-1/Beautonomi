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

export function useYocoIntegration() {
  const [integration, setIntegration] = useState<YocoIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<YocoIntegration | { data: YocoIntegration }>(
        "/api/provider/yoco/integration"
      );
      const raw = (res as any)?.data ?? (res as any);
      if ((res as any)?.error) {
        setError((res as any).error.message);
      } else if (raw && typeof raw === "object") {
        setIntegration({
          id: (raw as any).id ?? "",
          provider_id: (raw as any).provider_id ?? "",
          is_enabled: !!(raw as any).is_enabled,
          api_key_set: !!((raw as any).api_key_set ?? (raw as any).public_key),
          webhook_configured: !!(raw as any).webhook_configured,
          created_at: (raw as any).created_at ?? new Date().toISOString(),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Yoco status");
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
        const res = await api.post<YocoIntegration>(
          "/api/provider/yoco/integration",
          { api_key: apiKey, secret_key: secretKey },
        );
        if (res.error) {
          Alert.alert("Error", res.error.message || "Failed to connect Yoco");
          return false;
        }
        if (res.data) setIntegration(res.data);
        return true;
      } catch {
        Alert.alert("Error", "Failed to connect Yoco");
        return false;
      }
    },
    [],
  );

  const disconnect = useCallback(async () => {
    try {
      const res = await api.delete("/api/provider/yoco/integration");
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to disconnect");
        return false;
      }
      setIntegration(null);
      return true;
    } catch {
      Alert.alert("Error", "Failed to disconnect Yoco");
      return false;
    }
  }, []);

  return { integration, loading, error, reload: load, connect, disconnect };
}

/* ─── Device Management ─── */

export function useYocoDevices() {
  const [devices, setDevices] = useState<YocoDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setDevices(list);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addDevice = useCallback(
    async (device: Omit<YocoDevice, "id" | "created_at" | "last_used_at">) => {
      try {
        const res = await api.post<YocoDevice>("/api/provider/yoco/devices", device);
        if (res.error) {
          Alert.alert("Error", res.error.message || "Failed to add device");
          return null;
        }
        if (res.data) {
          setDevices((prev) => [...prev, res.data!]);
        }
        return res.data;
      } catch {
        Alert.alert("Error", "Failed to add device");
        return null;
      }
    },
    [],
  );

  const updateDevice = useCallback(
    async (id: string, updates: Partial<YocoDevice>) => {
      try {
        const res = await api.put<YocoDevice>(
          `/api/provider/yoco/devices/${id}`,
          updates,
        );
        if (res.error) {
          Alert.alert("Error", res.error.message || "Failed to update");
          return false;
        }
        setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
        return true;
      } catch {
        Alert.alert("Error", "Failed to update device");
        return false;
      }
    },
    [],
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

export function useYocoPayment() {
  const [processing, setProcessing] = useState(false);

  const processPayment = useCallback(
    async (request: YocoPaymentRequest): Promise<YocoPaymentResult | null> => {
      setProcessing(true);
      try {
        const res = await api.post<YocoPaymentResult>(
          "/api/provider/yoco/payments",
          request as unknown as Record<string, unknown>,
        );
        if (res.error) {
          Alert.alert(
            "Payment Failed",
            res.error.message || "Card payment could not be processed",
          );
          return null;
        }
        return res.data ?? null;
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
