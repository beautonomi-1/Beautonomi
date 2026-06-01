import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePaystackVirtualTerminalEnabledForProvider } from "@/lib/payments/paystack-virtual-terminal-feature-gate";
import { checkRateLimit } from "@/lib/rate-limit/store";
import {
  reconcilePaystackTerminalPayments,
  reconcileWindowFromDays,
  type ReconcileLocalTerminal,
} from "@/lib/payments/paystack-terminal-reconcile";

/**
 * POST /api/provider/paystack/terminal-payments/reconcile
 *
 * Provider-initiated "Check for new payments". Pulls recent successful transactions for the
 * provider's terminals from Paystack and backfills any the webhook missed. Rate-limited so a
 * provider cannot hammer the Paystack API.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const rate = await checkRateLimit(
      { prefix: "paystack-terminal-reconcile", limit: 6, windowSeconds: 60 },
      providerId,
    );
    if (!rate.allowed) {
      return errorResponse(
        "You're checking too often. Please wait a moment and try again.",
        "RATE_LIMITED",
        429,
      );
    }

    const admin = getSupabaseAdmin();
    const { data: terminalRows, error } = await (admin
      .from("provider_paystack_virtual_terminals") as any)
      .select("id, provider_id, paystack_terminal_id, terminal_code, currency, provider:providers(tenant_id)")
      .eq("provider_id", providerId)
      .not("paystack_terminal_id", "is", null)
      .is("deleted_at", null);
    if (error) throw error;

    const terminals = (terminalRows ?? []) as ReconcileLocalTerminal[];
    if (terminals.length === 0) {
      return successResponse({
        message:
          "No terminal is ready to check yet. Once Ops finishes setup, payments will appear automatically.",
        checked: 0,
        terminalsChecked: 0,
        terminalPayments: 0,
        recorded: 0,
        results: [],
      });
    }

    const summary = await reconcilePaystackTerminalPayments({
      supabase: admin,
      terminals,
      from: reconcileWindowFromDays(7),
      perPage: 100,
      maxPages: 5,
    });

    return successResponse({
      message:
        summary.recorded > 0
          ? `Found ${summary.recorded} new payment${summary.recorded === 1 ? "" : "s"}.`
          : "You're all caught up. No new payments found.",
      ...summary,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check for new Paystack Terminal payments");
  }
}
