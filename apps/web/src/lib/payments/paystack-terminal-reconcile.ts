import { listTransactions, verifyTransaction } from "@/lib/payments/paystack-complete";
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

function nestedCode(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const code = (value as Record<string, unknown>).code;
  return typeof code === "string" && code.trim().length > 0 ? code.trim() : null;
}

/**
 * Extract the Virtual Terminal code a transaction *itself* carries. This is the only
 * trustworthy way to attribute a reconciled transaction to a terminal: the Paystack
 * transaction-list `terminalid` filter is for physical POS terminals and is not a
 * documented filter for Virtual Terminals, so we must never assume a returned row
 * belongs to the terminal we queried.
 */
function extractTransactionTerminalCode(transaction: Record<string, unknown>): string | null {
  const metadata =
    transaction.metadata && typeof transaction.metadata === "object" && !Array.isArray(transaction.metadata)
      ? (transaction.metadata as Record<string, unknown>)
      : {};
  const metaString = (key: string): string | null => {
    const value = metadata[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  };
  const source =
    transaction.source && typeof transaction.source === "object" && !Array.isArray(transaction.source)
      ? (transaction.source as Record<string, unknown>)
      : {};
  const sourceIdentifier =
    typeof source.identifier === "string" && source.identifier.trim().length > 0
      ? source.identifier.trim()
      : null;

  return (
    metaString("paystack_terminal_code") ??
    metaString("terminal_code") ??
    nestedCode(metadata.virtual_terminal) ??
    nestedCode((transaction as Record<string, unknown>).virtual_terminal) ??
    nestedCode((transaction as Record<string, unknown>).terminal) ??
    (sourceIdentifier && sourceIdentifier.toUpperCase().startsWith("VT_") ? sourceIdentifier : null)
  );
}

function codesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/**
 * Decide whether a transaction returned by the list/verify API genuinely belongs to the
 * given terminal. We trust the transaction's own VT markers; when a listed row carries no
 * marker at all we re-read it from Paystack (verify) before accepting it, so unrelated
 * platform transactions can never be stamped into a provider's terminal inbox.
 */
async function transactionBelongsToTerminal(
  transaction: Record<string, unknown>,
  terminal: ReconcileLocalTerminal,
): Promise<boolean> {
  const code = extractTransactionTerminalCode(transaction);
  if (code) return codesMatch(code, terminal.terminal_code);

  const reference = typeof transaction.reference === "string" ? transaction.reference : null;
  if (!reference) return false;
  try {
    const verified = await verifyTransaction(reference);
    const verifiedData = transactionRecord(verified?.data as unknown);
    const verifiedCode = extractTransactionTerminalCode(verifiedData);
    return codesMatch(verifiedCode, terminal.terminal_code);
  } catch (verifyError) {
    console.error("Paystack terminal reconcile verify failed:", verifyError);
    return false;
  }
}

/**
 * Fallback reconciliation from the Paystack Transaction API. For each terminal that has a
 * Paystack terminal id, it pulls successful transactions (paginated) and, only for the rows
 * that genuinely belong to the terminal, upserts them via `recordPaystackTerminalCharge`
 * (idempotent on `paystack_reference`). This backfills any payment the `charge.success`
 * webhook may have missed so it still lands in the correct, terminal-scoped inbox. The
 * webhook remains the primary ingestion path.
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
    const context = {
      id: terminal.id,
      provider_id: terminal.provider_id,
      terminal_code: terminal.terminal_code,
      currency: terminal.currency ?? null,
    };
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
      const rows = (remote.data ?? []).map((transaction) => transactionRecord(transaction));
      checked += rows.length;
      for (const transaction of rows) {
        const ref = typeof transaction.reference === "string" ? transaction.reference : null;
        const belongs = await transactionBelongsToTerminal(transaction, terminal);
        if (!belongs) {
          results.push({
            terminalid: terminal.paystack_terminal_id,
            terminal_code: terminal.terminal_code,
            reference: ref,
            recorded: false,
            reason: "not_this_terminal",
            payment_id: null,
          });
          continue;
        }
        const result = await recordPaystackTerminalCharge(params.supabase, transaction as any, {
          context,
        });
        results.push({
          terminalid: terminal.paystack_terminal_id,
          terminal_code: terminal.terminal_code,
          reference: ref,
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
    // Transactions that actually belong to one of our terminals (recorded or already-known),
    // excluding unrelated platform transactions we deliberately skipped.
    terminalPayments: results.filter((result) => result.reason !== "not_this_terminal").length,
    recorded: results.filter((result) => result.recorded).length,
    results,
  };
}

export function reconcileWindowFromDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(1, days));
  return date.toISOString();
}
