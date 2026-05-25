import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export type PaystackTerminal = {
  id: string;
  name: string;
  display_name?: string | null;
  terminal_code: string;
  active: boolean;
  status: string;
  currency: string;
  payment_link?: string | null;
  qr_url?: string | null;
  terminal_url?: string | null;
  poster_url?: string | null;
  asset_status?: string | null;
  asset_request_status?: string | null;
  asset_last_requested_at?: string | null;
  destination_status?: string | null;
  notification_whatsapp?: string | null;
  last_payment_at?: string | null;
};

export type PaystackTerminalPayment = {
  id: string;
  paystack_reference: string;
  paid_amount: number;
  expected_amount?: number | null;
  customer_reference?: string | null;
  amount_due_at_match_time?: number | null;
  amount_difference?: number | null;
  currency: string;
  status: string;
  allocation_status: string;
  amount_match_status: string;
  suggested_entity_type?: string | null;
  suggested_entity_id?: string | null;
  suggestion_confidence?: number | null;
  payer_name?: string | null;
  payer_email?: string | null;
  terminal?: { id?: string; name?: string | null; terminal_code?: string | null } | null;
  created_at: string;
};

export type PaystackTerminalSetupRequest = {
  requested: boolean;
  status: "admin_setup_required";
  suggested_name?: string | null;
  message?: string | null;
};

export function usePaystackTerminals() {
  const [terminals, setTerminals] = useState<PaystackTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ terminals?: PaystackTerminal[] }>(
        "/api/provider/paystack/virtual-terminals",
      );
      if (res.error) throw new Error(res.error.message ?? "Failed to load Paystack terminals");
      setTerminals(res.data?.terminals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Paystack terminals");
    } finally {
      setLoading(false);
    }
  }, []);

  const requestTerminalSetup = useCallback(
    async (name?: string | null) => {
      const res = await api.post<PaystackTerminalSetupRequest>("/api/provider/paystack/virtual-terminals", {
        name,
      });
      if (res.error) throw new Error(res.error.message ?? "Failed to request Paystack Terminal setup");
      await refresh();
      return res.data;
    },
    [refresh],
  );

  const requestAssets = useCallback(
    async (terminalId: string) => {
      const res = await api.post<{ terminal?: PaystackTerminal; message?: string }>(
        `/api/provider/paystack/virtual-terminals/${terminalId}/request-assets`,
        {},
      );
      if (res.error) throw new Error(res.error.message ?? "Failed to request branded assets");
      await refresh();
      return res.data;
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { terminals, loading, error, refresh, requestTerminalSetup, requestAssets };
}

export function usePaystackTerminalPayments() {
  const [payments, setPayments] = useState<PaystackTerminalPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items?: PaystackTerminalPayment[] }>(
        "/api/provider/paystack/terminal-payments",
      );
      if (res.error) throw new Error(res.error.message ?? "Failed to load terminal payments");
      setPayments(res.data?.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load terminal payments");
    } finally {
      setLoading(false);
    }
  }, []);

  const allocate = useCallback(
    async (
      paymentId: string,
      input:
        | {
            action: "confirm";
            entity_type: string;
            entity_id: string;
            amount?: number;
            reason?: string;
          }
        | { action: "decline"; reason: string }
        | { action: "admin_review"; reason?: string },
    ) => {
      const res = await api.post(
        `/api/provider/paystack/terminal-payments/${paymentId}/allocation`,
        input,
      );
      if (res.error) throw new Error(res.error.message ?? "Failed to update allocation");
      await refresh();
      return res.data;
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { payments, loading, error, refresh, allocate };
}
