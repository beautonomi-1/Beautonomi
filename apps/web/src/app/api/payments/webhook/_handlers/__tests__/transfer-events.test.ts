import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleTransferEvent } from "../transfer-events";
import type { SupabaseClient } from "../shared";
import { recordPayoutLedger } from "@/lib/provider/record-payout-ledger";

vi.mock("@/lib/provider/record-payout-ledger", () => ({
  recordPayoutLedger: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: vi.fn(async () => undefined),
}));

function createTransferEventSupabase(options: {
  payout: Record<string, unknown> | null;
  updateError?: unknown;
  deleteError?: unknown;
}) {
  const payoutUpdates: unknown[] = [];
  const ledgerDeletes: string[][] = [];

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
          delete: vi.fn(() => ({
            eq: vi.fn((column: string, value: string) => {
              ledgerDeletes.push([column, value]);
              return {
                eq: vi.fn(async (column2: string, value2: string) => {
                  ledgerDeletes.push([column2, value2]);
                  return { error: options.deleteError ?? null };
                }),
              };
            }),
          })),
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
  };

  return {
    mockSupabase: mockSupabase as unknown as SupabaseClient,
    payoutUpdates,
    ledgerDeletes,
  };
}

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

  it("reconciles a completed payout when Paystack later reverses it", async () => {
    const { mockSupabase, payoutUpdates, ledgerDeletes } = createTransferEventSupabase({
      payout: {
        id: "payout-2",
        provider_id: "provider-2",
        status: "completed",
        amount: 75,
        transfer_code: "TRF_2",
      },
    });

    const response = await handleTransferEvent(
      {
        event: "transfer.reversed",
        data: { transfer_code: "TRF_2", id: 100, status: "reversed", reason: "bank reversal" },
      },
      mockSupabase,
    );

    expect(response.status).toBe(200);
    expect(ledgerDeletes).toEqual([
      ["payout_id", "payout-2"],
      ["transaction_type", "payout"],
    ]);
    expect(payoutUpdates).toHaveLength(1);
    expect((payoutUpdates[0] as { status?: string; failure_reason?: string }).status).toBe("failed");
    expect((payoutUpdates[0] as { failure_reason?: string }).failure_reason).toBe("bank reversal");
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
