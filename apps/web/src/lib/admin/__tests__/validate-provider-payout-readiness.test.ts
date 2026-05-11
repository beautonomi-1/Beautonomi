import { describe, expect, it } from "vitest";
import { validateAdminPayoutReadiness } from "../validate-provider-payout-readiness";

type Row = Record<string, unknown>;

class Query {
  private filters: Array<{ op: "eq" | "in" | "gte" | "lte" | "is"; key: string; value: unknown }> = [];
  private limitCount: number | null = null;

  constructor(
    private readonly table: string,
    private readonly rowsByTable: Record<string, Row[]>,
  ) {}

  select() {
    return this;
  }

  eq(key: string, value: unknown) {
    this.filters.push({ op: "eq", key, value });
    return this;
  }

  in(key: string, value: unknown[]) {
    this.filters.push({ op: "in", key, value });
    return this;
  }

  gte(key: string, value: unknown) {
    this.filters.push({ op: "gte", key, value });
    return this;
  }

  lte(key: string, value: unknown) {
    this.filters.push({ op: "lte", key, value });
    return this;
  }

  is(key: string, value: unknown) {
    this.filters.push({ op: "is", key, value });
    return this;
  }

  order() {
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  private data() {
    const rows = (this.rowsByTable[this.table] ?? []).filter((row) =>
      this.filters.every((filter) => {
        if (filter.op === "eq") return row[filter.key] === filter.value;
        if (filter.op === "in") return (filter.value as unknown[]).includes(row[filter.key]);
        if (filter.op === "gte") return String(row[filter.key] ?? "") >= String(filter.value ?? "");
        if (filter.op === "lte") return String(row[filter.key] ?? "") <= String(filter.value ?? "");
        if (filter.op === "is") return row[filter.key] === filter.value;
        return true;
      }),
    );
    return this.limitCount == null ? rows : rows.slice(0, this.limitCount);
  }

  maybeSingle() {
    return Promise.resolve({ data: this.data()[0] ?? null, error: null });
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.data(), error: null }).then(onfulfilled, onrejected);
  }
}

function mockSupabase(rowsByTable: Record<string, Row[]>) {
  return {
    from(table: string) {
      return new Query(table, rowsByTable);
    },
  } as never;
}

const providerId = "provider-1";
const tenantId = "tenant-1";
const T = "2026-04-01T00:00:00.000Z";

function baseRows(overrides: Record<string, Row[]> = {}) {
  return {
    platform_settings: [
      {
        tenant_id: tenantId,
        is_active: true,
        settings: { payouts: { payout_hold_days: 0 } },
      },
    ],
    bookings: [{ id: "booking-1", booking_source: "online" }],
    booking_payments: [{ booking_id: "booking-1", payment_provider: "paystack", status: "completed" }],
    payouts: [],
    provider_payout_accounts: [
      {
        id: "account-1",
        provider_id: providerId,
        recipient_code: "RCP_active",
        currency: "ZAR",
        active: true,
        deleted_at: null,
        is_primary: true,
        created_at: T,
      },
    ],
    finance_transactions: [
      {
        provider_id: providerId,
        transaction_type: "provider_earnings",
        amount: 200,
        net: 200,
        booking_id: "booking-1",
        created_at: T,
      },
    ],
    ...overrides,
  };
}

describe("validateAdminPayoutReadiness", () => {
  it("blocks admin payout actions when refund drift leaves the provider negative", async () => {
    const result = await validateAdminPayoutReadiness({
      supabase: mockSupabase(
        baseRows({
          finance_transactions: [
            {
              provider_id: providerId,
              transaction_type: "provider_earnings",
              amount: 100,
              net: 100,
              booking_id: "booking-1",
              created_at: T,
            },
            {
              provider_id: providerId,
              transaction_type: "refund",
              amount: -150,
              net: -150,
              booking_id: "booking-1",
              created_at: T,
            },
          ],
          payouts: [{ provider_id: providerId, amount: 25, status: "pending" }],
        }),
      ),
      providerId,
      tenantId,
      requestedAccountId: "account-1",
      requireAccount: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PAYOUT_BALANCE_DRIFT");
      expect(result.rawBalance).toBe(-75);
    }
  });

  it("does not fall back when the selected payout account is inactive", async () => {
    const result = await validateAdminPayoutReadiness({
      supabase: mockSupabase(
        baseRows({
          provider_payout_accounts: [
            {
              id: "requested-inactive",
              provider_id: providerId,
              recipient_code: "RCP_inactive",
              active: false,
              deleted_at: null,
              created_at: T,
            },
            {
              id: "active-primary",
              provider_id: providerId,
              recipient_code: "RCP_active",
              active: true,
              deleted_at: null,
              is_primary: true,
              created_at: T,
            },
          ],
          payouts: [{ provider_id: providerId, amount: 50, status: "processing" }],
        }),
      ),
      providerId,
      tenantId,
      requestedAccountId: "requested-inactive",
      requireAccount: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PAYOUT_ACCOUNT_NOT_READY");
    }
  });

  it("uses the active primary payout account for legacy requests without a selected account", async () => {
    const result = await validateAdminPayoutReadiness({
      supabase: mockSupabase(
        baseRows({
          payouts: [{ provider_id: providerId, amount: 50, status: "processing" }],
        }),
      ),
      providerId,
      tenantId,
      requestedAccountId: null,
      requireAccount: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.account?.recipient_code).toBe("RCP_active");
      expect(result.rawBalance).toBe(150);
    }
  });
});
