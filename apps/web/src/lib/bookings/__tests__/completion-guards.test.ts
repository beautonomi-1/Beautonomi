import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const openTerminal = vi.fn();
const pendingWalletGift = vi.fn();

vi.mock("@/lib/payments/open-terminal-payments", () => ({
  findOpenTerminalPayments: (...args: unknown[]) => openTerminal(...args),
}));
vi.mock("@/lib/bookings/ensure-wallet-gift-booking-payments", () => ({
  sumPendingWalletGiftBookingPayments: (...args: unknown[]) => pendingWalletGift(...args),
}));

import {
  childBookingEligibleForCompletionComplete,
  decideCompletionBlockers,
  evaluateSingleBookingCompletion,
} from "@/lib/bookings/completion-guards";

const admin = {
  from: () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return b;
  },
} as unknown as SupabaseClient;

const paidChild = (id: string, amount = 100) => ({
  id,
  status: "in_progress",
  payment_status: "paid",
  total_amount: amount,
  total_paid: amount,
  total_refunded: 0,
  additional_charges: [],
});

describe("decideCompletionBlockers (group)", () => {
  it("allows a fully paid group", () => {
    const r = decideCompletionBlockers({ children: [paidChild("a"), paidChild("b")], openTerminalCount: 0 });
    expect(r.allowed).toBe(true);
    expect(r.balanceDue).toBe(0);
  });

  it("blocks with BALANCE_DUE when a participant is unpaid", () => {
    const r = decideCompletionBlockers({
      children: [paidChild("a"), { ...paidChild("b"), payment_status: "pending", total_paid: 0 }],
      openTerminalCount: 0,
    });
    expect(r.allowed).toBe(false);
    expect(r.blockers.map((b) => b.code)).toEqual(["BALANCE_DUE"]);
    expect(r.balanceDue).toBe(100);
  });

  it("allowUnpaid lifts BALANCE_DUE but keeps the balance for the audit event", () => {
    const r = decideCompletionBlockers({
      children: [{ ...paidChild("b"), payment_status: "pending", total_paid: 0 }],
      openTerminalCount: 0,
      allowUnpaid: true,
    });
    expect(r.allowed).toBe(true);
    expect(r.balanceDue).toBe(100);
  });

  it("blocks FULLY_REFUNDED when every participant was refunded", () => {
    const refunded = (id: string) => ({ ...paidChild(id), payment_status: "refunded", total_refunded: 100 });
    const r = decideCompletionBlockers({ children: [refunded("a"), refunded("b")], openTerminalCount: 0 });
    expect(r.blockers.map((b) => b.code)).toContain("FULLY_REFUNDED");
    expect(r.allowed).toBe(false);
  });

  it("does not flag FULLY_REFUNDED on a group that was never paid", () => {
    const unpaid = { ...paidChild("a"), payment_status: "pending", total_paid: 0 };
    const r = decideCompletionBlockers({ children: [unpaid], openTerminalCount: 0, allowUnpaid: true });
    expect(r.blockers.map((b) => b.code)).not.toContain("FULLY_REFUNDED");
  });

  it("ignores refunded and cancelled participants when computing balance", () => {
    const r = decideCompletionBlockers({
      children: [
        paidChild("a"),
        { ...paidChild("b"), payment_status: "refunded", total_refunded: 100 },
        { ...paidChild("c"), status: "cancelled", payment_status: "pending", total_paid: 0 },
      ],
      openTerminalCount: 0,
    });
    expect(r.allowed).toBe(true);
    expect(r.balanceDue).toBe(0);
  });

  it("blocks TERMINAL_IN_FLIGHT while a card machine charge is open", () => {
    const r = decideCompletionBlockers({ children: [paidChild("a")], openTerminalCount: 1, openTerminalAmount: 50 });
    expect(r.blockers[0]).toMatchObject({ code: "TERMINAL_IN_FLIGHT", amount: 50 });
  });

  it("counts unpaid additional charges and pending wallet/gift rows", () => {
    const child = {
      ...paidChild("a"),
      additional_charges: [
        { amount: 30, status: "pending" },
        { amount: 99, status: "rejected" },
        { amount: 10, status: "paid" },
      ],
    };
    const r = decideCompletionBlockers({ children: [child], openTerminalCount: 0 });
    expect(r.balanceDue).toBe(30);
  });
});

describe("childBookingEligibleForCompletionComplete", () => {
  it("skips cancelled, no-show and refunded children", () => {
    expect(childBookingEligibleForCompletionComplete({ id: "a", status: "cancelled" })).toBe(false);
    expect(childBookingEligibleForCompletionComplete({ id: "a", status: "no_show" })).toBe(false);
    expect(childBookingEligibleForCompletionComplete({ id: "a", status: "in_progress", payment_status: "refunded" })).toBe(false);
    expect(childBookingEligibleForCompletionComplete({ id: "a", status: "in_progress", payment_status: "paid" })).toBe(true);
  });
});

describe("evaluateSingleBookingCompletion", () => {
  beforeEach(() => {
    openTerminal.mockReset().mockResolvedValue([]);
    pendingWalletGift.mockReset().mockResolvedValue(0);
  });

  it("FULLY_REFUNDED wins before any lookup", async () => {
    const r = await evaluateSingleBookingCompletion(admin, {
      providerId: "p",
      booking: { ...paidChild("a"), payment_status: "refunded" },
    });
    expect(r.blockers[0]?.code).toBe("FULLY_REFUNDED");
    expect(openTerminal).not.toHaveBeenCalled();
  });

  it("TERMINAL_IN_FLIGHT blocks even with allowUnpaid", async () => {
    openTerminal.mockResolvedValue([{ id: "t1", amount: 100 }]);
    const r = await evaluateSingleBookingCompletion(admin, {
      providerId: "p",
      booking: paidChild("a"),
      allowUnpaid: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.blockers[0]?.code).toBe("TERMINAL_IN_FLIGHT");
  });

  it("BALANCE_DUE without override, allowed with override", async () => {
    const unpaid = { ...paidChild("a"), payment_status: "pending", total_paid: 40 };
    const blocked = await evaluateSingleBookingCompletion(admin, { providerId: "p", booking: unpaid });
    expect(blocked.blockers[0]).toMatchObject({ code: "BALANCE_DUE", amount: 60 });
    const ok = await evaluateSingleBookingCompletion(admin, { providerId: "p", booking: unpaid, allowUnpaid: true });
    expect(ok.allowed).toBe(true);
    expect(ok.balanceDue).toBe(60);
  });

  it("paid booking completes", async () => {
    const r = await evaluateSingleBookingCompletion(admin, { providerId: "p", booking: paidChild("a") });
    expect(r.allowed).toBe(true);
  });
});
