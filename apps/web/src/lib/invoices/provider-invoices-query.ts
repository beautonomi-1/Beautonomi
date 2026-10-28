import type { SupabaseClient } from "@supabase/supabase-js";
import {
  effectiveInvoiceStatus,
  invoiceAmountDue,
  isOpenInvoiceStatus,
} from "@/lib/invoices/provider-invoice-status";

export function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function applyInvoiceStatusFilter(
  query: ReturnType<SupabaseClient["from"]> extends infer _T ? any : never,
  status: string | null,
  today = todayUtcYmd(),
) {
  if (!status || status === "all") return query;
  if (status === "open") {
    return query
      .in("status", ["sent", "partially_paid", "overdue"])
      .gt("amount_due", 0);
  }
  if (status === "overdue") {
    return query.or(
      `status.eq.overdue,and(status.in.(sent,partially_paid),due_date.lt.${today})`,
    );
  }
  return query.eq("status", status);
}

export function computeInvoiceSummary(
  rows: Array<{
    status?: string | null;
    due_date?: string | null;
    total_amount?: number | null;
    amount_paid?: number | null;
    amount_due?: number | null;
  }>,
  today = todayUtcYmd(),
) {
  return rows.reduce(
    (acc, row) => {
      const effective = effectiveInvoiceStatus(row, today);
      const due = invoiceAmountDue(row);
      const paid = Number(row.amount_paid ?? 0);
      acc.paid_amount += paid;
      if (isOpenInvoiceStatus(effective) && due > 0) {
        acc.outstanding_amount += due;
      }
      if (effective === "overdue") {
        acc.overdue_count += 1;
      }
      return acc;
    },
    { paid_amount: 0, outstanding_amount: 0, overdue_count: 0 },
  );
}

export function withEffectiveStatus<T extends Record<string, unknown>>(
  invoice: T,
  today = todayUtcYmd(),
): T & { effective_status: string } {
  return {
    ...invoice,
    effective_status: effectiveInvoiceStatus(invoice as any, today),
  };
}
