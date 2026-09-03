import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleTransferEvent, reverseCompletedPayoutLedger } from "../transfer-events";
import type { SupabaseClient } from "../shared";
import { recordPayoutLedger } from "@/lib/provider/record-payout-ledger";
import { writeAuditLog } from "@/lib/audit/audit";

vi.mock("@/lib/provider/record-payout-ledger", () => ({
  recordPayoutLedger: vi.fn(async () => undefined),
  recordFailedPayoutTransferFee: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: vi.fn(async () => undefined),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

type FtRow = { id: string; payout_id: string; transaction_type: string; metadata: Record<string, unknown> };
type JournalEntry = { id: string; source: string; external_ref: string };

/**
 * Chainable mock for `.select().eq().eq().limit()` style reads over an in-memory array.
 */
function selectChain(rows: Record<string, unknown>[]) {
  const build = (filtered: Record<string, unknown>[]) => {
    const chain: any = {
      eq: (col: string, val: unknown) => build(filtered.filter((r) => r[col] === val)),
      limit: async (n: number) => ({ data: filtered.slice(0, n), error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: filtered, error: null }).then(resolve, reject),
    };
    return chain;
  };
  return build(rows);
}

function createTransferEventSupabase(options: {
  payout: Record<string, unknown> | null;
  updateError?: unknown;
  financeRows?: FtRow[];
  journalEntries?: JournalEntry[];
  /** When true, `revert_journal_for_finance_tx` returns an error. */
  rpcError?: { message: string } | null;
  /** When true, the RPC "succeeds" but writes no reversal entry (verification must fail). */
  rpcSilentNoop?: boolean;
  ftUpdateError?: unknown;
}) {
  const payoutUpdates: unknown[] = [];
  const ftUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const rpcCalls: string[] = [];
  const financeRows: FtRow[] = options.financeRows ?? [];
  const journalEntries: JournalEntry[] = options.journalEntries ?? [];

  const mockSupabase = {
    from: vi.fn((table: string) => {
      if (table === "payouts") {
        return {
          select: vi.fn(() => ({
            or: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: options.payout, error: null })),
            })),
          })),
          update: vi.fn((payload: unknown) => {
            payoutUpdates.push(payload);
            return {
              eq: vi.fn(async () => ({ error: options.updateError ?? null })),
            };
          }),
        };
      }

      if (table === "finance_transactions") {
        return {
          select: vi.fn(() => selectChain(financeRows)),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(async (_col: string, id: string) => {
              if (options.ftUpdateError) return { error: options.ftUpdateError };
              const row = financeRows.find((r) => r.id === id);
              if (row) row.metadata = (payload.metadata as Record<string, unknown>) ?? row.metadata;
              ftUpdates.push({ id, payload });
              return { error: null };
            }),
          })),
          delete: vi.fn(() => {
            throw new Error("finance_transactions DELETE must never be used for payout reversal");
          }),
        };
      }

      if (table === "journal_entries") {
        return {
          select: vi.fn(() => selectChain(journalEntries)),
        };
      }

      if (table === "providers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { user_id: null }, error: null })),
            })),
          })),
        };
      }

      if (table === "notifications") {
        return {
          insert: vi.fn(async () => ({ error: null })),
        };
      }

      throw new Error(`unexpected table: ${table}`);
    }),
    rpc: vi.fn(async (fn: string, args: { p_finance_tx_id: string }) => {
      rpcCalls.push(args.p_finance_tx_id);
      if (options.rpcError) return { data: null, error: options.rpcError };
      if (!options.rpcSilentNoop) {
        journalEntries.push({
          id: `rev-${args.p_finance_tx_id}`,
          source: "finance_transactions_reversal",
          external_ref: args.p_finance_tx_id,
        });
      }
      return { data: null, error: null };
    }),
  };

  return {
    mockSupabase: mockSupabase as unknown as SupabaseClient,
    payoutUpdates,
    ftUpdates,
    rpcCalls,
    financeRows,
    journalEntries,
  };
}

const completedPayout = {
  id: "payout-2",
  provider_id: "provider-2",
  status: "completed",
  amount: 75,
  transfer_code: "TRF_2",
  currency: "ZAR",
};

const payoutFt: FtRow = { id: "ft-1", payout_id: "payout-2", transaction_type: "payout", metadata: {} };
const originalEntry: JournalEntry = { id: "je-1", source: "finance_transactions", external_ref: "ft-1" };

describe("handleTransferEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws on transfer.success ledger failure so Paystack can retry", async () => {
    vi.mocked(recordPayoutLedger).mockRejectedValueOnce(new Error("ledger down"));
    const { mockSupabase, payoutUpdates } = createTransferEventSupabase({
      payout: {
        id: "payout-1",
        provider_id: "provider-1",
        status: "processing",
        amount: 120,
        net_amount: 120,
        payout_number: "PAY-1",
      },
    });

    await expect(
      handleTransferEvent(
        {
          event: "transfer.success",
          data: { transfer_code: "TRF_1", id: 99, status: "success" },
        },
        mockSupabase,
      ),
    ).rejects.toThrow("ledger down");

    expect(payoutUpdates).toHaveLength(0);
  });

  it("two-phase: reverts the journal, verifies it, marks the payout FT reversed (no DELETE), then flips status", async () => {
    const { mockSupabase, payoutUpdates, ftUpdates, rpcCalls, financeRows } = createTransferEventSupabase({
      payout: completedPayout,
      financeRows: [{ ...payoutFt, metadata: {} }],
      journalEntries: [{ ...originalEntry }],
    });

    const response = await handleTransferEvent(
      {
        event: "transfer.reversed",
        data: { transfer_code: "TRF_2", id: 100, status: "reversed", reason: "bank reversal" },
      },
      mockSupabase,
    );

    expect(response.status).toBe(200);
    expect(rpcCalls).toEqual(["ft-1"]);
    expect(ftUpdates).toHaveLength(1);
    expect(ftUpdates[0].id).toBe("ft-1");
    const meta = financeRows[0].metadata as { reversed_at?: string; reversed_reason?: string; reversed_event?: string };
    expect(typeof meta.reversed_at).toBe("string");
    expect(meta.reversed_reason).toBe("bank reversal");
    expect(meta.reversed_event).toBe("transfer.reversed");
    expect(payoutUpdates).toHaveLength(1);
    expect((payoutUpdates[0] as { status?: string }).status).toBe("failed");
    expect((payoutUpdates[0] as { failure_reason?: string }).failure_reason).toBe("bank reversal");
  });

  it("does NOT flip payout status when the journal revert RPC fails, and escalates to the audit log", async () => {
    const { mockSupabase, payoutUpdates, ftUpdates } = createTransferEventSupabase({
      payout: completedPayout,
      financeRows: [{ ...payoutFt, metadata: {} }],
      journalEntries: [{ ...originalEntry }],
      rpcError: { message: "gl unavailable" },
    });

    await expect(
      handleTransferEvent(
        {
          event: "transfer.failed",
          data: { transfer_code: "TRF_2", id: 101, status: "failed", reason: "insufficient funds" },
        },
        mockSupabase,
      ),
    ).rejects.toThrow(/revert_journal_for_finance_tx failed/);

    expect(ftUpdates).toHaveLength(0);
    expect(payoutUpdates).toHaveLength(0);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "webhook.payout.reversal_gl_failed", risk_level: "critical" }),
    );
  });

  it("does NOT flip payout status when the revert cannot be verified (RPC returned ok but no reversal entry exists)", async () => {
    const { mockSupabase, payoutUpdates, ftUpdates } = createTransferEventSupabase({
      payout: completedPayout,
      financeRows: [{ ...payoutFt, metadata: {} }],
      journalEntries: [{ ...originalEntry }],
      rpcSilentNoop: true,
    });

    await expect(
      handleTransferEvent(
        {
          event: "transfer.reversed",
          data: { transfer_code: "TRF_2", id: 102, status: "reversed", reason: "bank reversal" },
        },
        mockSupabase,
      ),
    ).rejects.toThrow(/NOT verified/);

    expect(ftUpdates).toHaveLength(0);
    expect(payoutUpdates).toHaveLength(0);
  });

  it("is idempotent on a repeated webhook: already-reversed FT rows are skipped and no second reversal is posted", async () => {
    const { mockSupabase, payoutUpdates, ftUpdates, rpcCalls } = createTransferEventSupabase({
      payout: completedPayout,
      financeRows: [{ ...payoutFt, metadata: { reversed_at: "2026-01-01T00:00:00.000Z" } }],
      journalEntries: [
        { ...originalEntry },
        { id: "rev-ft-1", source: "finance_transactions_reversal", external_ref: "ft-1" },
      ],
    });

    const response = await handleTransferEvent(
      {
        event: "transfer.reversed",
        data: { transfer_code: "TRF_2", id: 103, status: "reversed", reason: "bank reversal" },
      },
      mockSupabase,
    );

    expect(response.status).toBe(200);
    expect(rpcCalls).toEqual([]);
    expect(ftUpdates).toHaveLength(0);
    expect(payoutUpdates).toHaveLength(1);
    expect((payoutUpdates[0] as { status?: string }).status).toBe("failed");
  });

  it("does not ignore transfer.success for a payout incorrectly marked failed", async () => {
    const { mockSupabase, payoutUpdates } = createTransferEventSupabase({
      payout: {
        id: "payout-3",
        provider_id: "provider-3",
        status: "failed",
        amount: 90,
        net_amount: 90,
        transfer_code: "TRF_3",
      },
    });

    const response = await handleTransferEvent(
      {
        event: "transfer.success",
        data: { transfer_code: "TRF_3", id: 101, status: "success" },
      },
      mockSupabase,
    );

    expect(response.status).toBe(200);
    expect(recordPayoutLedger).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({ id: "payout-3", provider_id: "provider-3" }),
    );
    expect(payoutUpdates).toHaveLength(1);
    expect((payoutUpdates[0] as { status?: string }).status).toBe("completed");
  });
});

describe("reverseCompletedPayoutLedger", () => {
  it("reuses an existing reversal entry (crash between RPC and metadata mark) instead of posting a second one", async () => {
    const { mockSupabase, rpcCalls, financeRows } = createTransferEventSupabase({
      payout: completedPayout,
      financeRows: [{ ...payoutFt, metadata: {} }],
      journalEntries: [
        { ...originalEntry },
        { id: "rev-ft-1", source: "finance_transactions_reversal", external_ref: "ft-1" },
      ],
    });

    const result = await reverseCompletedPayoutLedger(mockSupabase, {
      payoutId: "payout-2",
      reason: "retry",
      event: "transfer.reversed",
    });

    expect(rpcCalls).toEqual([]);
    expect(result).toEqual({ rows: 1, reversed: 1, alreadyReversed: 0 });
    expect(typeof (financeRows[0].metadata as { reversed_at?: string }).reversed_at).toBe("string");
  });

  it("marks reversed without an RPC when the payout never had a shadow journal entry", async () => {
    const { mockSupabase, rpcCalls, financeRows } = createTransferEventSupabase({
      payout: completedPayout,
      financeRows: [{ ...payoutFt, metadata: {} }],
      journalEntries: [],
    });

    const result = await reverseCompletedPayoutLedger(mockSupabase, {
      payoutId: "payout-2",
      reason: "no gl",
      event: "transfer.failed",
    });

    // RPC is attempted (harmless no-op server-side) but verification is skipped
    // because there is no original entry to reverse.
    expect(rpcCalls).toEqual(["ft-1"]);
    expect(result.reversed).toBe(1);
    expect(typeof (financeRows[0].metadata as { reversed_at?: string }).reversed_at).toBe("string");
  });
});
