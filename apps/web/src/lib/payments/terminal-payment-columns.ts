import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth/permissions";

/** Columns a signed-in session may read. The payer address and the raw charge stay on the service role. */
export const TERMINAL_PAYMENT_COLUMNS_WITHOUT_CONTACT = [
  "id",
  "provider_id",
  "terminal_id",
  "terminal_code",
  "paystack_transaction_id",
  "paystack_reference",
  "status",
  "allocation_status",
  "amount_match_status",
  "gross_amount",
  "paid_amount",
  "expected_amount",
  "amount_due_at_match_time",
  "amount_difference",
  "gateway_fee_amount",
  "net_amount",
  "allocated_amount",
  "overpayment_amount",
  "remaining_balance",
  "currency",
  "payer_name",
  "customer_reference",
  "suggested_entity_type",
  "suggested_entity_id",
  "suggestion_confidence",
  "candidate_match_reasons",
  "provider_notification_status",
  "provider_notified_at",
  "provider_seen_at",
  "provider_assigned_entity_type",
  "provider_assigned_entity_id",
  "provider_assignment_reason",
  "provider_assigned_by",
  "provider_assigned_at",
  "provider_declined_suggestion",
  "provider_decline_reason",
  "payout_eligibility_status",
  "payout_hold_until",
  "payout_id",
  "support_case_id",
  "dispute_id",
  "refund_status",
  "metadata",
  "received_at",
  "allocated_at",
  "created_at",
  "updated_at",
  "match_candidates",
].join(", ");

type ContactRow = {
  id: string;
  payer_email?: string | null;
  payer_phone?: string | null;
};

export async function viewerMaySeeTerminalPayer(
  user: { id: string; role?: string | null },
  request: NextRequest,
): Promise<boolean> {
  if (user.role === "superadmin") return true;
  return hasPermission(user.id, "view_clients", undefined, request);
}

/** Fill the payer address from the service role when the viewer may see clients. */
export async function mergeTerminalPaymentContact<T extends { id: string }>(
  rows: T[],
  includeContact: boolean,
): Promise<T[]> {
  if (!includeContact || rows.length === 0) return rows;
  const ids = [...new Set(rows.map((row) => row.id).filter(Boolean))];
  if (ids.length === 0) return rows;
  const { data, error } = await getSupabaseAdmin()
    .from("provider_paystack_terminal_payments")
    .select("id, payer_email, payer_phone")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map(((data ?? []) as ContactRow[]).map((row) => [row.id, row]));
  return rows.map((row) => {
    const contact = byId.get(row.id);
    if (!contact) return row;
    return {
      ...row,
      payer_email: contact.payer_email ?? null,
      payer_phone: contact.payer_phone ?? null,
    };
  });
}
