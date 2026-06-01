import { describe, expect, it, vi, beforeEach } from "vitest";
import { rankTerminalCandidates } from "../paystack-terminal-allocation";
import { reconcileWindowFromDays } from "../paystack-terminal-reconcile";

vi.mock("@/lib/payments/paystack-complete", () => ({
  listTransactions: vi.fn(),
}));
vi.mock("../paystack-terminal-webhook", () => ({
  recordPaystackTerminalCharge: vi.fn(),
}));

import { listTransactions } from "@/lib/payments/paystack-complete";
import { recordPaystackTerminalCharge } from "../paystack-terminal-webhook";
import { reconcilePaystackTerminalPayments } from "../paystack-terminal-reconcile";

describe("rankTerminalCandidates", () => {
  const now = new Date("2026-06-01T12:00:00.000Z").getTime();

  it("returns unmatched when no candidate amounts are plausible", () => {
    const { suggestion, candidates } = rankTerminalCandidates({
      paidAmount: 500,
      currency: "ZAR",
      rawCandidates: [],
      now,
    });
    expect(candidates).toHaveLength(0);
    expect(suggestion.allocationStatus).toBe("unmatched");
  });

  it("suggests a single exact-amount candidate with provider confirmation", () => {
    const { suggestion, candidates } = rankTerminalCandidates({
      paidAmount: 250,
      currency: "ZAR",
      rawCandidates: [
        {
          entityType: "booking",
          entityId: "booking-exact",
          label: "Booking #1001",
          expectedAmount: 250,
          expectedCurrency: "ZAR",
          occurredAt: new Date(now - 60_000).toISOString(),
        },
        {
          entityType: "booking",
          entityId: "booking-far",
          label: "Booking #999",
          expectedAmount: 999,
          expectedCurrency: "ZAR",
          occurredAt: new Date(now - 60_000).toISOString(),
        },
      ],
      now,
    });
    expect(suggestion.entityId).toBe("booking-exact");
    expect(suggestion.amountMatchStatus).toBe("exact_match");
    expect(suggestion.allocationStatus).toBe("suggested");
    expect(candidates[0].entity_id).toBe("booking-exact");
  });

  it("flags ambiguity when multiple exact matches exist and prefers the most recent", () => {
    const { suggestion } = rankTerminalCandidates({
      paidAmount: 250,
      currency: "ZAR",
      rawCandidates: [
        {
          entityType: "booking",
          entityId: "older",
          label: "Older",
          expectedAmount: 250,
          expectedCurrency: "ZAR",
          occurredAt: new Date(now - 36 * 60 * 60 * 1000).toISOString(),
        },
        {
          entityType: "booking",
          entityId: "newer",
          label: "Newer",
          expectedAmount: 250,
          expectedCurrency: "ZAR",
          occurredAt: new Date(now - 5 * 60 * 1000).toISOString(),
        },
      ],
      now,
    });
    expect(suggestion.amountMatchStatus).toBe("ambiguous_amount_match");
    expect(suggestion.entityId).toBe("newer");
    expect(suggestion.reasons).toContain("multiple_amount_matches");
    expect(suggestion.confidence).toBeLessThanOrEqual(60);
  });

  it("downgrades a close-but-not-exact match to amount_only_match", () => {
    const { suggestion } = rankTerminalCandidates({
      paidAmount: 100,
      currency: "ZAR",
      rawCandidates: [
        {
          entityType: "product_order",
          entityId: "order-1",
          label: "Order #5",
          expectedAmount: 250,
          expectedCurrency: "ZAR",
          occurredAt: new Date(now - 60_000).toISOString(),
        },
      ],
      now,
    });
    expect(suggestion.entityId).toBe("order-1");
    expect(suggestion.amountMatchStatus).toBe("amount_only_match");
  });
});

describe("reconcileWindowFromDays", () => {
  it("returns an ISO timestamp roughly N days in the past", () => {
    const iso = reconcileWindowFromDays(7);
    const parsed = new Date(iso).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    // Allow a generous delta for execution time.
    expect(Math.abs(parsed - sevenDaysAgo)).toBeLessThan(5 * 60 * 1000);
  });

  it("clamps the window to at least one day", () => {
    const iso = reconcileWindowFromDays(0);
    const parsed = new Date(iso).getTime();
    expect(parsed).toBeLessThan(Date.now());
  });
});

describe("reconcilePaystackTerminalPayments", () => {
  beforeEach(() => {
    vi.mocked(listTransactions).mockReset();
    vi.mocked(recordPaystackTerminalCharge).mockReset();
  });

  it("skips terminals without a Paystack terminal id", async () => {
    const summary = await reconcilePaystackTerminalPayments({
      supabase: {},
      terminals: [
        { id: "t1", provider_id: "p1", paystack_terminal_id: null, terminal_code: "VT_1" },
      ],
      from: reconcileWindowFromDays(7),
    });
    expect(listTransactions).not.toHaveBeenCalled();
    expect(summary.terminalsChecked).toBe(0);
    expect(summary.recorded).toBe(0);
  });

  it("records transactions pulled from Paystack and counts the recorded ones", async () => {
    vi.mocked(listTransactions).mockResolvedValueOnce({
      data: [
        { reference: "ref-1", amount: 25000, currency: "ZAR" },
        { reference: "ref-2", amount: 10000, currency: "ZAR" },
      ],
    } as never);
    vi.mocked(recordPaystackTerminalCharge)
      .mockResolvedValueOnce({ recorded: true, payment: { id: "pay-1" } } as never)
      .mockResolvedValueOnce({ recorded: false, reason: "duplicate" } as never);

    const summary = await reconcilePaystackTerminalPayments({
      supabase: {},
      terminals: [
        {
          id: "t1",
          provider_id: "p1",
          paystack_terminal_id: 123,
          terminal_code: "VT_1",
          provider: { tenant_id: "tenant-1" },
        },
      ],
      from: reconcileWindowFromDays(7),
      perPage: 100,
      maxPages: 1,
    });

    expect(listTransactions).toHaveBeenCalledTimes(1);
    expect(recordPaystackTerminalCharge).toHaveBeenCalledTimes(2);
    expect(summary.terminalPayments).toBe(2);
    expect(summary.recorded).toBe(1);
    expect(summary.results[0]).toMatchObject({ reference: "ref-1", recorded: true, payment_id: "pay-1" });
    expect(summary.results[1]).toMatchObject({ reference: "ref-2", recorded: false, reason: "duplicate" });
  });

  it("enriches transactions with terminal context before recording", async () => {
    vi.mocked(listTransactions).mockResolvedValueOnce({
      data: [{ reference: "ref-3", amount: 5000 }],
    } as never);
    vi.mocked(recordPaystackTerminalCharge).mockResolvedValueOnce({ recorded: true, payment: { id: "pay-3" } } as never);

    await reconcilePaystackTerminalPayments({
      supabase: {},
      terminals: [
        { id: "t2", provider_id: "prov-9", paystack_terminal_id: 456, terminal_code: "VT_9" },
      ],
      from: reconcileWindowFromDays(7),
      maxPages: 1,
    });

    const enriched = vi.mocked(recordPaystackTerminalCharge).mock.calls[0][1] as Record<string, any>;
    expect(enriched.metadata.provider_id).toBe("prov-9");
    expect(enriched.metadata.paystack_terminal_code).toBe("VT_9");
    expect(enriched.source.source).toBe("virtual_terminal");
    expect(enriched.currency).toBe("ZAR");
  });
});
