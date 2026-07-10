/**
 * PayCloud API Client for Provider Portal
 */
import { fetcher } from "@/lib/http/fetcher";

export interface PaycloudMerchantInfo {
  label: string;
  merchant_no: string;
  store_no: string;
}

export interface PaycloudTerminal {
  id: string;
  name: string;
  display_name: string;
  terminal_sn: string;
  serial_number: string;
  location_id: string | null;
  location_name?: string | null;
  is_active: boolean;
  status: string;
  source: string;
  total_transactions: number;
  total_amount: number;
  last_used: string | null;
  last_error: string | null;
  created_at: string;
  merchant?: PaycloudMerchantInfo | null;
}

export type PaycloudReadinessBlockerCode =
  | "FLAG_OFF"
  | "PLAN_REQUIRED"
  | "NOT_ACCEPTED"
  | "NO_TERMINALS"
  | "ALL_SUSPENDED"
  | "NO_MERCHANT";

export interface PaycloudReadinessBlocker {
  code: PaycloudReadinessBlockerCode | string;
  title: string;
  actionLabel: string;
  href?: string;
}

export interface PaycloudReadinessWarning {
  code: string;
  message: string;
}

export interface PaycloudTerminalSummary {
  active: number;
  suspended: number;
  inFlight: number;
  withoutMerchant: number;
}

export interface PaycloudPlanInfo {
  enabled: boolean;
  maxTerminals: number | null;
  usedTerminals: number;
}

export interface PaycloudSettings {
  accept_paycloud: boolean;
  qr_payments_enabled: boolean;
  cashback_enabled: boolean;
  active_terminal_count: number;
  ready: boolean;
  blockers?: PaycloudReadinessBlocker[];
  warnings?: PaycloudReadinessWarning[];
  terminals?: PaycloudTerminalSummary;
  plan?: PaycloudPlanInfo;
  account_environment?: "sandbox" | "live" | "mixed" | null;
}

export interface PaycloudReconcileSummary {
  checked: number;
  settled: number;
  cancelled: number;
  closed: number;
  processing: number;
  unchanged: number;
  errors: number;
}

export interface PaycloudReconciliationPayment {
  id: string;
  merchant_order_no: string;
  amount: number;
  expected_amount: number;
  amount_match_status: string | null;
  status: string;
  currency: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  updated_at: string;
}

export interface PaycloudPayment {
  id: string;
  payment_id?: string;
  merchant_order_no: string;
  status: "pending" | "processing" | "successful" | "failed" | "cancelled" | "closed";
  amount: number;
  currency: string;
  tip_amount?: number;
  cashback_amount?: number;
  pay_scenario?: string;
  error_message?: string;
}

export class PaycloudApi {
  async listTerminals(): Promise<{
    terminals: PaycloudTerminal[];
    accept_paycloud: boolean;
    qr_payments_enabled: boolean;
    cashback_enabled: boolean;
  }> {
    const response = await fetcher.get<{
      data: {
        terminals: PaycloudTerminal[];
        accept_paycloud: boolean;
        qr_payments_enabled: boolean;
        cashback_enabled: boolean;
      };
    }>("/api/provider/paycloud/terminals");
    return response.data;
  }

  async createTerminal(data: {
    terminal_sn: string;
    display_name: string;
    location_id?: string | null;
  }): Promise<PaycloudTerminal> {
    const response = await fetcher.post<{ data: PaycloudTerminal }>(
      "/api/provider/paycloud/terminals",
      data,
    );
    return response.data;
  }

  async updateTerminal(
    id: string,
    data: Partial<{ display_name: string; location_id: string | null; is_active: boolean }>,
  ): Promise<PaycloudTerminal> {
    const response = await fetcher.put<{ data: PaycloudTerminal }>(
      `/api/provider/paycloud/terminals/${id}`,
      data,
    );
    return response.data;
  }

  async deleteTerminal(id: string): Promise<void> {
    await fetcher.delete(`/api/provider/paycloud/terminals/${id}`);
  }

  async getSettings(): Promise<PaycloudSettings> {
    const response = await fetcher.get<{ data: PaycloudSettings }>(
      "/api/provider/paycloud/settings",
    );
    return response.data;
  }

  async updateSettings(data: Partial<PaycloudSettings>): Promise<void> {
    await fetcher.patch("/api/provider/paycloud/settings", data);
  }

  async createPayment(data: {
    terminal_id: string;
    entity_type: string;
    entity_id: string;
    amount?: number;
    tip_amount?: number;
    cashback_amount?: number;
    pay_method?: "card" | "qr";
    currency?: string;
    booking_id?: string | null;
    sale_id?: string | null;
    group_booking_id?: string | null;
  }): Promise<PaycloudPayment> {
    const response = await fetcher.post<{ data: PaycloudPayment }>(
      "/api/provider/paycloud/payments",
      data,
    );
    return response.data;
  }

  async getPayment(id: string): Promise<PaycloudPayment> {
    const response = await fetcher.get<{ data: PaycloudPayment }>(
      `/api/provider/paycloud/payments/${id}`,
    );
    return response.data;
  }

  async closePayment(id: string): Promise<PaycloudPayment> {
    const response = await fetcher.post<{ data: PaycloudPayment }>(
      `/api/provider/paycloud/payments/${id}/close`,
      {},
    );
    return response.data;
  }

  async voidPayment(id: string): Promise<PaycloudPayment> {
    const response = await fetcher.post<{ data: PaycloudPayment }>(
      `/api/provider/paycloud/payments/${id}/void`,
      {},
    );
    return response.data;
  }

  async reconcilePayments(): Promise<PaycloudReconcileSummary> {
    const response = await fetcher.post<{ data: PaycloudReconcileSummary }>(
      "/api/provider/paycloud/payments/reconcile",
      {},
    );
    return response.data;
  }

  async getReconciliation(): Promise<{
    payments: PaycloudReconciliationPayment[];
    summary: { total: number; exceptions: number };
  }> {
    const response = await fetcher.get<{
      data: {
        payments: PaycloudReconciliationPayment[];
        summary: { total: number; exceptions: number };
      };
    }>("/api/provider/paycloud/reconciliation");
    return response.data;
  }
}

export const paycloudApi = new PaycloudApi();
