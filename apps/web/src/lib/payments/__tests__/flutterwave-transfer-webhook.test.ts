import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleFlutterwaveTransferWebhook } from "@/lib/payments/flutterwave-transfer-webhook";

const mockRecordPayoutLedger = vi.fn(async () => undefined);

vi.mock("@/lib/provider/record-payout-ledger", () => ({
  recordPayoutLedger: (...args: unknown[]) => mockRecordPayoutLedger(...args),
}));

describe("handleFlutterwaveTransferWebhook", () => {
  beforeEach(() => {
    mockRecordPayoutLedger.mockClear();
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
