import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  reconcilePaystackTerminalPayments,
  reconcileWindowFromDays,
  type ReconcileLocalTerminal,
} from "@/lib/payments/paystack-terminal-reconcile";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "sync-paystack-terminal-payments";
export const maxDuration = 300;

/**
 * GET /api/cron/sync-paystack-terminal-payments
 *
 * Safety-net reconciliation for Paystack Virtual Terminal payments. Pulls recent successful
 * transactions for every terminal (across all tenants) from the Paystack Transaction API and
 * upserts any the webhook missed. Idempotent on `paystack_reference`.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return new Response(auth.error || "Unauthorized", { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request), { staleAfterMinutes: 20 });
}

async function runJob(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const days = Number.isFinite(Number(searchParams.get("days")))
      ? Math.max(1, Number(searchParams.get("days")))
      : 7;

    const { data: terminalRows, error } = await (supabase
      .from("provider_paystack_virtual_terminals") as any)
      .select("id, provider_id, paystack_terminal_id, terminal_code, currency, provider:providers(tenant_id)")
      .not("paystack_terminal_id", "is", null)
      .is("deleted_at", null);
    if (error) throw error;

    const terminals = (terminalRows ?? []) as ReconcileLocalTerminal[];
    const summary = await reconcilePaystackTerminalPayments({
      supabase,
      terminals,
      from: reconcileWindowFromDays(days),
      perPage: 100,
      maxPages: 10,
    });

    return successResponse({
      message: "Paystack Terminal payment reconciliation complete",
      windowDays: days,
      ...summary,
    });
  } catch (error) {
    return handleApiError(error, "Failed to reconcile Paystack Terminal payments");
  }
}
