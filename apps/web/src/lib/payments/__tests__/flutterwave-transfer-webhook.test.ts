import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleFlutterwaveTransferWebhook } from "@/lib/payments/flutterwave-transfer-webhook";

const mockRecordPayoutLedger = vi.fn(async () => undefined);
const mockReverseCompletedPayoutLedger = vi.fn(async () => ({
  reversed: 1,
  alreadyReversed: 0,
}));

vi.mock("@/lib/provider/record-payout-ledger", () => ({
  recordPayoutLedger: (...args: unknown[]) => mockRecordPayoutLedger(...args),
}));

vi.mock("@/app/api/payments/webhook/_handlers/transfer-events", () => ({
  reverseCompletedPayoutLedger: (...args: unknown[]) => mockReverseCompletedPayoutLedger(...args),
}));

function payoutSupabase(payout: Record<string, unknown>, updates: Array<Record<string, unknown>>) {
  return {
    from: (table: string) => {
      if (table === "payouts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: payout, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              updates.push(payload);
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("handleFlutterwaveTransferWebhook", () => {
  beforeEach(() => {
    mockRecordPayoutLedger.mockClear();
    mockReverseCompletedPayoutLedger.mockClear();
    mockReverseCompletedPayoutLedger.mockResolvedValue({ reversed: 1, alreadyReversed: 0 });
  });

  describe("transfer.failed (F2-21)", () => {
    const payoutId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    it("reverses the payout ledger before marking a previously-completed payout failed", async () => {
      const updates: Array<Record<string, unknown>> = [];
      const supabase = payoutSupabase(
        {
          id: payoutId,
          status: "completed",
          provider_id: "prov-1",
          net_amount: 100,
          amount: 100,
          payout_number: "PO-1",
          currency: "ZAR",
        },
        updates,
      );

      const result = await handleFlutterwaveTransferWebhook(
        { reference: `payout_${payoutId}`, id: "fw-transfer-7", status: "FAILED", complete_message: "Bank rejected" },
        supabase as never,
      );

      expect(result.handled).toBe(true);
      expect(mockReverseCompletedPayoutLedger).toHaveBeenCalledWith(
        supabase,
        expect.objectContaining({ payoutId, event: "transfer.failed" }),
      );
      expect(updates).toHaveLength(1);
      expect(updates[0]?.status).toBe("failed");
      expect(mockRecordPayoutLedger).not.toHaveBeenCalled();
    });

    it("does not mark the payout failed when the ledger reversal cannot be verified", async () => {
      mockReverseCompletedPayoutLedger.mockRejectedValueOnce(new Error("revert not verified"));
      const updates: Array<Record<string, unknown>> = [];
      const supabase = payoutSupabase(
        { id: payoutId, status: "completed", provider_id: "prov-1", net_amount: 100, amount: 100, currency: "ZAR" },
        updates,
      );

      await expect(
        handleFlutterwaveTransferWebhook(
          { reference: `payout_${payoutId}`, id: "fw-transfer-7", status: "FAILED" },
          supabase as never,
        ),
      ).rejects.toThrow(/revert not verified/);
      expect(updates).toHaveLength(0);
    });

    it("is a no-op when the payout is already failed", async () => {
      const updates: Array<Record<string, unknown>> = [];
      const supabase = payoutSupabase(
        { id: payoutId, status: "failed", provider_id: "prov-1", amount: 100, currency: "ZAR" },
        updates,
      );

      const result = await handleFlutterwaveTransferWebhook(
        { reference: `payout_${payoutId}`, status: "failed" },
        supabase as never,
      );
      expect(result.handled).toBe(true);
      expect(mockReverseCompletedPayoutLedger).not.toHaveBeenCalled();
      expect(updates).toHaveLength(0);
    });
  });

  it("records payout ledger before marking completed", async () => {
    const payoutId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const updates: Array<Record<string, unknown>> = [];
    const supabase = {
      from: (table: string) => {
        if (table === "payouts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: payoutId,
                    status: "processing",
                    provider_id: "prov-1",
                    net_amount: 100,
                    amount: 100,
                    payout_number: "PO-1",
                    currency: "ZAR",
                  },
                  error: null,
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: async () => {
                updates.push(payload);
                return { error: null };
              },
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await handleFlutterwaveTransferWebhook(
      {
        reference: `payout_${payoutId}`,
        id: "fw-transfer-99",
        status: "SUCCESSFUL",
      },
      supabase as never,
    );

    expect(result.handled).toBe(true);
    expect(mockRecordPayoutLedger).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        id: payoutId,
        feeGateway: "flutterwave",
      }),
    );
    expect(updates[0]?.status).toBe("completed");
  });

  it("skips ledger when payout already completed", async () => {
    const payoutId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const supabase = {
      from: (table: string) => {
        if (table === "payouts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: payoutId, status: "completed", provider_id: "p" },
                  error: null,
                }),
              }),
            }),
            update: vi.fn(),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    await handleFlutterwaveTransferWebhook(
      { reference: `payout_${payoutId}`, status: "successful" },
      supabase as never,
    );
    expect(mockRecordPayoutLedger).not.toHaveBeenCalled();
  });
});
