/**
 * Regression test for the gift-card-order `charge.failed` atomic claim.
 *
 * A duplicate/out-of-order Paystack webhook delivery must not re-mark a gift
 * card order as `failed` once a prior delivery (or the matching
 * `charge.success`) already moved it out of `pending` — e.g. it was already
 * fulfilled (`paid`) or already failed by an earlier retry.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleChargeFailed } from "../charge-success";
import type { PaystackEvent, SupabaseClient } from "../shared";

vi.mock("@/lib/integrations/slack/ops-triggers", () => ({
  slackNotifyPaymentFailed: vi.fn(),
}));

function makeGiftCardOrderFailedSupabase(claimedRows: Array<{ id: string }>) {
  const updates: Array<Record<string, unknown>> = [];

  const mockSupabase = {
    from: vi.fn((table: string) => {
      if (table === "gift_card_orders") {
        return {
          update: vi.fn((values: Record<string, unknown>) => {
            updates.push(values);
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(async () => ({ data: claimedRows, error: null })),
                })),
              })),
            };
          }),
        };
      }
      throw new Error(`unexpected table in gift card charge-failed test: ${table}`);
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };

  return { mockSupabase: mockSupabase as unknown as SupabaseClient, updates };
}

function makeGiftCardChargeFailedEvent(reference: string, orderId: string): PaystackEvent {
  return {
    event: "charge.failed",
    data: {
      reference,
      message: "Card declined",
      gateway_response: "Declined",
      metadata: {
        gift_card_order_id: orderId,
      },
    },
  } as unknown as PaystackEvent;
}

describe("charge.failed gift card order handler — atomic claim guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a genuinely pending gift card order as failed", async () => {
    const { mockSupabase, updates } = makeGiftCardOrderFailedSupabase([{ id: "order-1" }]);

    await handleChargeFailed(makeGiftCardChargeFailedEvent("ref-1", "order-1"), mockSupabase);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: "failed" });
  });

  it("no-ops (does not throw, does not double count) when the order already left pending", async () => {
    // Claim update matches 0 rows: order already `paid` (charge.success won the
    // race) or already `failed` from a prior delivery of this same event.
    const { mockSupabase, updates } = makeGiftCardOrderFailedSupabase([]);

    await expect(
      handleChargeFailed(makeGiftCardChargeFailedEvent("ref-dup", "order-1"), mockSupabase),
    ).resolves.not.toThrow();

    // The atomic update is still attempted (it's what enforces the guard via
    // `.eq("status", "pending")`), but since it matched 0 rows the handler
    // does not proceed to any further mutation.
    expect(updates).toHaveLength(1);
  });
});
