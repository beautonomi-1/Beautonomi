import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { errorResponse, handleApiError, requireAdminSection, successResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { listTransactions } from "@/lib/payments/paystack-complete";
import {
  isPaystackTerminalCharge,
  recordPaystackTerminalCharge,
} from "@/lib/payments/paystack-terminal-webhook";
import {
  reconcilePaystackTerminalPayments,
  type ReconcileLocalTerminal,
} from "@/lib/payments/paystack-terminal-reconcile";
import { resolvePaystackTerminalTenantScope } from "@/lib/admin/paystack-terminal-tenant-scope";

function defaultFromIso() {
  const date = new Date();
  date.setDate(date.getDate() - 2);
  return date.toISOString();
}

type LocalTerminal = ReconcileLocalTerminal;

function transactionRecord(transaction: unknown): Record<string, unknown> {
  return transaction && typeof transaction === "object" && !Array.isArray(transaction)
    ? (transaction as Record<string, unknown>)
    : {};
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantScope = await resolvePaystackTerminalTenantScope(supabase, request);
    const body = await request.json().catch(() => ({}));
    const from = typeof body?.from === "string" && body.from.trim() ? body.from.trim() : defaultFromIso();
    const to = typeof body?.to === "string" && body.to.trim() ? body.to.trim() : undefined;
    const page = Number.isFinite(Number(body?.page)) ? Math.max(1, Number(body.page)) : 1;
    const perPage = Number.isFinite(Number(body?.perPage))
      ? Math.min(100, Math.max(1, Number(body.perPage)))
      : 100;
    const tenantId =
      typeof body?.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : tenantScope.tenantId;
    const requestedTerminalId =
      typeof body?.terminalid === "string" || typeof body?.terminalid === "number"
        ? String(body.terminalid).trim()
        : null;
    const localTerminalId =
      typeof body?.local_terminal_id === "string" && body.local_terminal_id.trim()
        ? body.local_terminal_id.trim()
        : null;

    let localTerminals: LocalTerminal[] = [];
    if (localTerminalId || !requestedTerminalId) {
      if (tenantScope.providerIds.length === 0) {
        return successResponse({
          checked: 0,
          terminalsChecked: 0,
          terminalPayments: 0,
          recorded: 0,
          results: [],
          basis:
            "Fallback reconciliation from Paystack Transaction API. Uses terminalid where a local Paystack terminal ID is available; primary path remains charge.success webhook and mapping uses Virtual Terminal code, not WhatsApp destination.",
        });
      }
      let terminalQuery = (supabase.from("provider_paystack_virtual_terminals") as any)
        .select("id, provider_id, paystack_terminal_id, terminal_code, currency, provider:providers(tenant_id)")
        .not("paystack_terminal_id", "is", null)
        .is("deleted_at", null)
        .in("provider_id", tenantScope.providerIds);
      if (localTerminalId) terminalQuery = terminalQuery.eq("id", localTerminalId);
      const { data: terminalRows, error: terminalError } = await terminalQuery;
      if (terminalError) throw terminalError;
      localTerminals = (terminalRows ?? []) as LocalTerminal[];
      if (localTerminalId && localTerminals.length === 0) {
        return errorResponse("Local Paystack terminal not found.", "TERMINAL_NOT_FOUND", 404);
      }
    }

    const basis =
      "Fallback reconciliation from Paystack Transaction API. Uses terminalid where a local Paystack terminal ID is available; primary path remains charge.success webhook and mapping uses Virtual Terminal code, not WhatsApp destination.";

    if (localTerminals.length > 0 && !requestedTerminalId) {
      const summary = await reconcilePaystackTerminalPayments({
        supabase,
        terminals: localTerminals,
        from,
        to,
        perPage,
        maxPages: 1,
        fallbackTenantId: tenantId,
      });
      return successResponse({ ...summary, basis });
    }

    // Single explicit terminalid path (no local mapping): pull and filter by detection.
    const remote = await listTransactions({
      status: "success",
      from,
      to,
      page,
      perPage,
      terminalid: requestedTerminalId ?? undefined,
      tenantId,
    });
    const remoteTransactions = remote.data ?? [];
    const terminalTransactions = remoteTransactions.filter((transaction) =>
      isPaystackTerminalCharge(transaction as any),
    );
    const results = [];
    for (const transaction of terminalTransactions) {
      const record = transactionRecord(transaction);
      const result = await recordPaystackTerminalCharge(supabase, record as any);
      results.push({
        terminalid: requestedTerminalId,
        reference: (record.reference as string | undefined) ?? null,
        recorded: result.recorded,
        reason: "reason" in result ? result.reason : null,
        payment_id: result.recorded ? (result.payment as { id?: string })?.id ?? null : null,
      });
    }

    return successResponse({
      checked: remoteTransactions.length,
      terminalsChecked: requestedTerminalId ? 1 : 0,
      terminalPayments: results.length,
      recorded: results.filter((result) => result.recorded).length,
      results,
      basis,
    });
  } catch (error) {
    return handleApiError(error, "Failed to sync Paystack Terminal payments");
  }
}
