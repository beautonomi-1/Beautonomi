import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRefundGatewayCharge = vi.fn();
const mockSlackFailed = vi.fn();

vi.mock("@/lib/payments/refund-gateway-charge", () => ({
  refundGatewayCharge: (...args: unknown[]) => mockRefundGatewayCharge(...args),
}));

vi.mock("@/lib/payments/paystack-complete", () => ({
  convertFromSmallestUnit: (n: number) => n / 100,
}));

vi.mock("@/lib/custom-offers/auto-refund-stale-custom-offer-payment", () => ({
  staleCustomOfferRefundAmountMajor: (minor: number | null) =>
    typeof minor === "number" ? minor / 100 : null,
}));

vi.mock("@/lib/integrations/slack/ops-triggers", () => ({
  slackNotifyCronJobFailed: (...args: unknown[]) => mockSlackFailed(...args),
}));

type StaleRow = {
  id: string;
  source_type: string;
  source_id: string;
  payment_reference: string;
  amount_minor: number | null;
  currency: string | null;
  tenant_id: string | null;
  attempt_count: number;
  reason: string | null;
  refund_status: string;
  last_attempt_at?: string | null;
  created_at?: string;
};

function buildAdmin(rows: StaleRow[]) {
  const store = rows.map((r) => ({ ...r }));

  type Filter =
    | { op: "eq"; col: string; val: unknown }
    | { op: "in"; col: string; vals: unknown[] }
    | { op: "lt"; col: string; val: unknown };

  class Query {
    private filters: Filter[] = [];
    private patch: Record<string, unknown> = {};
    private mode: "select" | "update" = "select";
    private wantSingle = false;

    constructor(private table: string) {}

    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      this.mode = "select";
      if (opts?.head) {
        // unused in this module
      }
      return this;
    }

    update(patch: Record<string, unknown>) {
      this.mode = "update";
      this.patch = patch;
      return this;
    }

    eq(col: string, val: unknown) {
      this.filters.push({ op: "eq", col, val });
      return this;
    }

    in(col: string, vals: unknown[]) {
      this.filters.push({ op: "in", col, vals });
      return this;
    }

    lt(col: string, val: unknown) {
      this.filters.push({ op: "lt", col, val });
      return this;
    }

    order() {
      return this;
    }

    limit() {
      return this;
    }

    private matchRows(): StaleRow[] {
      let rows = [...store];
      for (const f of this.filters) {
        if (f.op === "eq") {
          rows = rows.filter((r) => (r as Record<string, unknown>)[f.col] === f.val);
        } else if (f.op === "in") {
          rows = rows.filter((r) => f.vals.includes((r as Record<string, unknown>)[f.col]));
        } else if (f.op === "lt") {
          rows = rows.filter((r) => Number((r as Record<string, unknown>)[f.col]) < Number(f.val));
        }
      }
      return rows;
    }

    private run() {
      if (this.mode === "update") {
        const matched = this.matchRows();
        if (this.wantSingle) {
          if (matched.length !== 1) return { data: null, error: null };
          const row = matched[0];
          if (!["pending", "failed"].includes(row.refund_status)) return { data: null, error: null };
          if (row.attempt_count >= 5) return { data: null, error: null };
          Object.assign(row, this.patch);
          return { data: { id: row.id }, error: null };
        }
        for (const row of matched) Object.assign(row, this.patch);
        return { data: matched, error: null };
      }

      let rows = this.matchRows().filter((r) => ["pending", "failed"].includes(r.refund_status));
      rows = rows.filter((r) => r.attempt_count < 5);
      rows = rows.filter((r) => ["custom_offer", "group_participant"].includes(r.source_type));
      return { data: rows, error: null };
    }

    async maybeSingle() {
      this.wantSingle = true;
      const res = this.run();
      return { data: res.data, error: null };
    }

    then<T>(resolve: (value: { data: unknown; error: null }) => T) {
      return Promise.resolve(resolve(this.run()));
    }
  }

  const admin = {
    from: (table: string) => {
      if (table !== "stale_payment_refunds") throw new Error(`unexpected table ${table}`);
      return {
        select: (cols?: string, opts?: { count?: string; head?: boolean }) =>
          new Query(table).select(cols, opts),
        update: (patch: Record<string, unknown>) => new Query(table).update(patch),
      };
    },
    _store: store,
  };

  return admin;
}

describe("retryStalePaymentRefunds", () => {
  const NOW = new Date("2026-09-02T12:00:00.000Z");
  const OLD = "2026-09-02T11:00:00.000Z";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefundGatewayCharge.mockResolvedValue({ refundId: "gw-refund-1" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("uses stale-refund idempotency key for custom_offer rows", async () => {
    const admin = buildAdmin([
      {
        id: "row-co",
        source_type: "custom_offer",
        source_id: "offer-1",
        payment_reference: "pay-co",
        amount_minor: 10000,
        currency: "ZAR",
        tenant_id: "t1",
        attempt_count: 0,
        reason: "stale",
        refund_status: "pending",
        created_at: OLD,
      },
    ]);
    const { retryStalePaymentRefunds } = await import("../retry-stale-payment-refunds");

    const summary = await retryStalePaymentRefunds(admin as never, { now: NOW });

    expect(summary.completed).toBe(1);
    expect(mockRefundGatewayCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "pay-co",
        idempotencyKey: "stale-refund:row-co",
      }),
    );
    expect(admin._store[0].refund_status).toBe("completed");
  });

  it("uses group-guest-stale idempotency key for group_participant rows", async () => {
    const admin = buildAdmin([
      {
        id: "row-gp",
        source_type: "group_participant",
        source_id: "participant-1",
        payment_reference: "pay-guest",
        amount_minor: 5000,
        currency: "ZAR",
        tenant_id: "t1",
        attempt_count: 0,
        reason: null,
        refund_status: "pending",
        created_at: OLD,
      },
    ]);
    const { retryStalePaymentRefunds } = await import("../retry-stale-payment-refunds");

    await retryStalePaymentRefunds(admin as never, { now: NOW });

    expect(mockRefundGatewayCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "group-guest-stale:participant-1:pay-guest",
      }),
    );
  });

  it("notifies ops after max failed attempts", async () => {
    mockRefundGatewayCharge.mockRejectedValue(new Error("gateway down"));
    const admin = buildAdmin([
      {
        id: "row-max",
        source_type: "custom_offer",
        source_id: "offer-2",
        payment_reference: "pay-max",
        amount_minor: 2000,
        currency: "ZAR",
        tenant_id: "t1",
        attempt_count: 4,
        reason: "stale",
        refund_status: "failed",
        created_at: OLD,
        last_attempt_at: OLD,
      },
    ]);
    const { retryStalePaymentRefunds } = await import("../retry-stale-payment-refunds");

    const summary = await retryStalePaymentRefunds(admin as never, { now: NOW });

    expect(summary.failed).toBe(1);
    expect(mockSlackFailed).toHaveBeenCalledWith(
      expect.objectContaining({ cronJob: "retry-stale-payment-refunds" }),
    );
  });
});
