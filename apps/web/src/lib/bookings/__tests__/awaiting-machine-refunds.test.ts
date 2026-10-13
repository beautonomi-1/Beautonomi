import { describe, expect, it, vi } from "vitest";
import {
  completeAwaitingMachineRefund,
  createAwaitingYocoRefund,
  pickYocoRefundPaymentId,
  releaseAwaitingMachineRefunds,
  sumAwaitingMachineRefunds,
  type AwaitingMachineRefund,
} from "../awaiting-machine-refunds";

describe("pickYocoRefundPaymentId", () => {
  it("picks the largest base Yoco capture", () => {
    const id = pickYocoRefundPaymentId([
      { id: "tip", payment_provider: "yoco", status: "completed", amount: 5, payment_provider_id: "pay:tip" },
      { id: "base", payment_provider: "yoco", status: "completed", amount: 100, payment_provider_id: "pay" },
    ]);
    expect(id).toBe("base");
  });
});

describe("sumAwaitingMachineRefunds", () => {
  it("sums open obligations", () => {
    const rows: AwaitingMachineRefund[] = [
      {
        id: "1",
        booking_id: "b",
        payment_id: null,
        amount: 10,
        reason: null,
        machine_refund_provider: "yoco",
        awaiting_machine_since: null,
        created_at: null,
      },
      {
        id: "2",
        booking_id: "b",
        payment_id: null,
        amount: 20.5,
        reason: null,
        machine_refund_provider: "yoco",
        awaiting_machine_since: null,
        created_at: null,
      },
    ];
    expect(sumAwaitingMachineRefunds(rows)).toBe(30.5);
  });
});

describe("createAwaitingYocoRefund", () => {
  it("returns existing open obligation instead of inserting again", async () => {
    const existing = {
      id: "r1",
      booking_id: "b1",
      payment_id: null,
      amount: 50,
      reason: "cancel",
      machine_refund_provider: "yoco",
      awaiting_machine_since: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "booking_refunds") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  not: () => ({
                    order: () => Promise.resolve({ data: [existing], error: null }),
                  }),
                }),
              }),
            }),
            insert: vi.fn(() => {
              throw new Error("should not insert");
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      }),
    };
    const out = await createAwaitingYocoRefund(supabase as never, {
      bookingId: "b1",
      amount: 25,
      paymentId: null,
      reason: "retry",
      createdBy: "u1",
    });
    expect(out?.id).toBe("r1");
  });
});

describe("completeAwaitingMachineRefund", () => {
  it("splits remainder into a new pending row on partial record", async () => {
    const updates: unknown[] = [];
    const inserts: unknown[] = [];
    const row: AwaitingMachineRefund = {
      id: "r1",
      booking_id: "b1",
      payment_id: "p1",
      amount: 100,
      reason: "cancel",
      machine_refund_provider: "yoco",
      awaiting_machine_since: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    };
    const supabase = {
      from: (table: string) => ({
        update: (payload: unknown) => {
          updates.push(payload);
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        },
        insert: (payload: unknown) => {
          inserts.push(payload);
          return Promise.resolve({ error: null });
        },
      }),
    };
    const result = await completeAwaitingMachineRefund(supabase as never, row, {
      amount: 40,
      reason: "recorded",
      recordedBy: "u1",
    });
    expect(result).toEqual({ ok: true, refundId: "r1", remaining: 60 });
    expect(inserts).toHaveLength(1);
    expect((inserts[0] as { amount: number }).amount).toBe(60);
  });
});

describe("releaseAwaitingMachineRefunds", () => {
  it("cancels obligations when cash replaces machine refund", async () => {
    const cancelled: string[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              not: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: "r1",
                        booking_id: "b1",
                        payment_id: null,
                        amount: 30,
                        reason: "x",
                        machine_refund_provider: "yoco",
                        awaiting_machine_since: null,
                        created_at: null,
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => {
              cancelled.push("r1");
              return Promise.resolve({ error: null });
            },
          }),
        }),
      }),
    };
    const released = await releaseAwaitingMachineRefunds(supabase as never, "b1", 30, "cash");
    expect(released).toBe(30);
    expect(cancelled).toEqual(["r1"]);
  });
});
