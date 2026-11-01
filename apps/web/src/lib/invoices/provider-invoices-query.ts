import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NON_PAYABLE_INVOICE_TYPES,
  effectiveInvoiceStatus,
  invoiceAmountDue,
  isOpenInvoiceStatus,
  isProviderInvoicePayable,
} from "@/lib/invoices/provider-invoice-status";

/** PostgREST filter: exclude legacy customer-paid fee invoice types from payable lists. */
export function excludeNonPayableInvoiceTypes<T extends { not: (...args: unknown[]) => T }>(
  query: T,
): T {
  return query.not(
    "invoice_type",
    "in",
    `(${[...NON_PAYABLE_INVOICE_TYPES].map((t) => `"${t}"`).join(",")})`,
  );
}

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
    return excludeNonPayableInvoiceTypes(
      query.in("status", ["sent", "partially_paid", "overdue"]).gt("amount_due", 0),
    );
  }
  if (status === "overdue") {
    return excludeNonPayableInvoiceTypes(
      query.or(
        `status.eq.overdue,and(status.in.(sent,partially_paid),due_date.lt.${today})`,
      ),
    );
  }
  return query.eq("status", status);
}

export function computeInvoiceSummary(
  rows: Array<{
    invoice_type?: string | null;
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
      if (!isProviderInvoicePayable(row)) {
        return acc;
      }
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

/** Amount due for CSV/export — zero when the invoice must not be presented as payable. */
export function exportableInvoiceAmountDue(
  row: {
    invoice_type?: string | null;
    status?: string | null;
    due_date?: string | null;
    total_amount?: number | null;
    amount_paid?: number | null;
    amount_due?: number | null;
    effective_status?: string | null;
  },
  today = todayUtcYmd(),
): number {
  const effective = row.effective_status ?? effectiveInvoiceStatus(row, today);
  if (!isProviderInvoicePayable(row)) return 0;
  if (effective === "cancelled" || effective === "refunded" || effective === "paid") {
    return 0;
  }
  return invoiceAmountDue(row);
}
