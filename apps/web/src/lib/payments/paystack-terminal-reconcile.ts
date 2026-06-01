import { listTransactions } from "@/lib/payments/paystack-complete";
import { recordPaystackTerminalCharge } from "@/lib/payments/paystack-terminal-webhook";

type SupabaseLike = any;

export type ReconcileLocalTerminal = {
  id: string;
  provider_id: string;
  paystack_terminal_id: number | string | null;
  terminal_code: string;
  currency?: string | null;
  provider?: { tenant_id?: string | null } | null;
};

export type ReconcileResultRow = {
  terminalid: number | string | null;
  terminal_code: string;
  reference: string | null;
  recorded: boolean;
  reason: string | null;
  payment_id: string | null;
};

export type ReconcileSummary = {
  checked: number;
  terminalsChecked: number;
  terminalPayments: number;
  recorded: number;
  results: ReconcileResultRow[];
};

function transactionRecord(transaction: unknown): Record<string, unknown> {
  return transaction && typeof transaction === "object" && !Array.isArray(transaction)
    ? (transaction as Record<string, unknown>)
    : {};
}

function enrichTransactionWithTerminal(
  transaction: Record<string, unknown>,
  terminal: ReconcileLocalTerminal,
) {
  const metadata =
    transaction.metadata && typeof transaction.metadata === "object" && !Array.isArray(transaction.metadata)
      ? { ...(transaction.metadata as Record<string, unknown>) }
      : {};
  const source =
    transaction.source && typeof transaction.source === "object" && !Array.isArray(transaction.source)
      ? { ...(transaction.source as Record<string, unknown>) }
      : {};

  metadata.provider_id = metadata.provider_id ?? terminal.provider_id;
  metadata.paystack_terminal_code = metadata.paystack_terminal_code ?? terminal.terminal_code;
  metadata.virtual_terminal = metadata.virtual_terminal ?? { code: terminal.terminal_code };
  source.source = source.source ?? "virtual_terminal";
  source.identifier = source.identifier ?? terminal.terminal_code;

  return {
    ...transaction,
    metadata,
    source,
    terminal: { code: terminal.terminal_code },
    currency: transaction.currency ?? terminal.currency ?? "ZAR",
  };
}

/**
 * Fallback reconciliation from the Paystack Transaction API. For each terminal that has a
 * Paystack terminal id, it pulls successful transactions (paginated) and upserts them via
 * `recordPaystackTerminalCharge` (idempotent on `paystack_reference`). This backfills any
 * payment the `charge.success` webhook may have missed so it still lands in the inbox.
 */
export async function reconcilePaystackTerminalPayments(params: {
  supabase: SupabaseLike;
  terminals: ReconcileLocalTerminal[];
  from: string;
  to?: string;
  perPage?: number;
  maxPages?: number;
  fallbackTenantId?: string | null;
}): Promise<ReconcileSummary> {
  const perPage = Math.min(100, Math.max(1, params.perPage ?? 100));
  const maxPages = Math.min(20, Math.max(1, params.maxPages ?? 5));
  const results: ReconcileResultRow[] = [];
  let checked = 0;

  for (const terminal of params.terminals) {
    if (!terminal.paystack_terminal_id) continue;
    for (let page = 1; page <= maxPages; page += 1) {
      const remote = await listTransactions({
        status: "success",
        from: params.from,
        to: params.to,
        page,
        perPage,
        terminalid: terminal.paystack_terminal_id ?? undefined,
        tenantId: terminal.provider?.tenant_id ?? params.fallbackTenantId ?? null,
      });
      const rows = (remote.data ?? []).map((transaction) =>
        enrichTransactionWithTerminal(transactionRecord(transaction), terminal),
      );
      checked += rows.length;
      for (const transaction of rows) {
        const result = await recordPaystackTerminalCharge(params.supabase, transaction as any);
        results.push({
          terminalid: terminal.paystack_terminal_id,
          terminal_code: terminal.terminal_code,
          reference: (transaction.reference as string | undefined) ?? null,
          recorded: result.recorded,
          reason: "reason" in result ? result.reason ?? null : null,
          payment_id: result.recorded ? ((result.payment as { id?: string })?.id ?? null) : null,
        });
      }
      if (rows.length < perPage) break;
    }
  }

  return {
    checked,
    terminalsChecked: params.terminals.filter((t) => t.paystack_terminal_id).length,
    terminalPayments: results.length,
    recorded: results.filter((result) => result.recorded).length,
    results,
  };
}

export function reconcileWindowFromDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(1, days));
  return date.toISOString();
}
