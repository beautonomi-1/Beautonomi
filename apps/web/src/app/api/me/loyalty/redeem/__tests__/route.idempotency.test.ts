import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/api-helpers")>(
    "@/lib/supabase/api-helpers",
  );
  return { ...actual, requireAuthInApi: vi.fn(async () => ({ user: { id: "user-1" } })) };
});
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));
vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/loyalty/resolve-loyalty-config", () => ({
  resolveLoyaltyConfig: vi.fn(async () => ({ minRedemptionPoints: 100, redemptionRate: 10 })),
}));

const KEY = "11111111-2222-4333-8444-555555555555";

type LedgerRow = { points_amount: number; metadata: Record<string, unknown> };

/**
 * Admin client double: `loyalty_points_ledger` lookups resolve from `ledger` keyed by
 * transaction_type, so a test can model "no prior row", "prior redeemed", "compensated".
 */
function makeAdmin(state: {
  ledger: { redeemed: LedgerRow[]; adjusted: LedgerRow[] };
  appendResults?: Array<{ data: unknown; error: unknown }>;
  walletError?: unknown;
  /** After the first append call, add a redeemed row (models a concurrent winner). */
  insertOnDuplicate?: LedgerRow;
}) {
  const appendCalls: Record<string, unknown>[] = [];
  const walletCalls: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "append_loyalty_ledger_entry") {
      appendCalls.push(args);
      const next = state.appendResults?.shift() ?? { data: "ledger-row-1", error: null };
      if (next.error && state.insertOnDuplicate) state.ledger.redeemed.push(state.insertOnDuplicate);
      return next;
    }
    if (name === "wallet_credit_admin") {
      walletCalls.push(args);
      return { data: null, error: state.walletError ?? null };
    }
    return { data: null, error: null };
  });
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    });
    chain.limit = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => {
      if (table !== "loyalty_points_ledger") return { data: null, error: null };
      const rows =
        filters.transaction_type === "redeemed" ? state.ledger.redeemed : state.ledger.adjusted;
      const match = rows.find(
        (r) => r.metadata.redeem_idempotency_key === filters["metadata->>redeem_idempotency_key"],
      );
      return { data: match ?? null, error: null };
    });
    return chain;
  });
  return { client: { rpc, from }, appendCalls, walletCalls };
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import("../route");
  return POST(
    createMockNextRequest({
      method: "POST",
      url: "http://localhost/api/me/loyalty/redeem",
      body,
    }) as never,
  );
}

describe("POST /api/me/loyalty/redeem idempotency", () => {
  async function setup(admin: ReturnType<typeof makeAdmin>, balance = 1000) {
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseServer).mockResolvedValue({
      rpc: vi.fn(async () => ({ data: balance, error: null })),
    } as never);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin.client as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first request debits once and credits the wallet with a key-scoped idempotency key", async () => {
    const admin = makeAdmin({ ledger: { redeemed: [], adjusted: [] } });
    await setup(admin);

    const res = await post({ points: 200, idempotency_key: KEY });

    expect(res.status).toBe(200);
    expect(admin.appendCalls).toHaveLength(1);
    expect(admin.appendCalls[0]).toMatchObject({
      p_transaction_type: "redeemed",
      p_points_amount: -200,
      p_metadata: expect.objectContaining({ redeem_idempotency_key: KEY }),
    });
    expect(admin.walletCalls).toEqual([
      expect.objectContaining({ p_amount: 20, p_idempotency_key: `loyalty_redeem:user-1:${KEY}` }),
    ]);
  });

  it("repeat with the same key does not debit again and returns the original result", async () => {
    const admin = makeAdmin({
      ledger: {
        redeemed: [
          {
            points_amount: -200,
            metadata: { redeem_idempotency_key: KEY, wallet_credit_amount: 20, currency: "ZAR" },
          },
        ],
        adjusted: [],
      },
    });
    await setup(admin);

    const res = await post({ points: 200, idempotency_key: KEY });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ points_redeemed: 200, redemption_value: 20, replayed: true });
    expect(admin.appendCalls).toHaveLength(0);
    // Re-issues the wallet credit with the same key: a no-op if it landed, a heal if it did not.
    expect(admin.walletCalls).toEqual([
      expect.objectContaining({ p_amount: 20, p_idempotency_key: `loyalty_redeem:user-1:${KEY}` }),
    ]);
  });

  it("accepts the key from the Idempotency-Key header", async () => {
    const admin = makeAdmin({
      ledger: {
        redeemed: [
          {
            points_amount: -200,
            metadata: { redeem_idempotency_key: KEY, wallet_credit_amount: 20, currency: "ZAR" },
          },
        ],
        adjusted: [],
      },
    });
    await setup(admin);
    const { POST } = await import("../route");

    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: "http://localhost/api/me/loyalty/redeem",
        body: { points: 200 },
        headers: { "idempotency-key": KEY },
      }) as never,
    );

    expect(res.status).toBe(200);
    expect(admin.appendCalls).toHaveLength(0);
  });

  it("concurrent duplicate that loses the unique index replays instead of failing", async () => {
    const admin = makeAdmin({
      ledger: { redeemed: [], adjusted: [] },
      appendResults: [{ data: null, error: { code: "23505", message: "duplicate key value" } }],
      insertOnDuplicate: {
        points_amount: -200,
        metadata: { redeem_idempotency_key: KEY, wallet_credit_amount: 20, currency: "ZAR" },
      },
    });
    await setup(admin);

    const res = await post({ points: 200, idempotency_key: KEY });

    expect(res.status).toBe(200);
    expect((await res.json()).data.replayed).toBe(true);
    expect(admin.appendCalls).toHaveLength(1);
    expect(admin.walletCalls).toHaveLength(1);
  });

  it("a key whose earlier attempt was compensated is rejected, not re-credited", async () => {
    const admin = makeAdmin({
      ledger: {
        redeemed: [
          {
            points_amount: -200,
            metadata: { redeem_idempotency_key: KEY, wallet_credit_amount: 20, currency: "ZAR" },
          },
        ],
        adjusted: [{ points_amount: 200, metadata: { redeem_idempotency_key: KEY } }],
      },
    });
    await setup(admin);

    const res = await post({ points: 200, idempotency_key: KEY });

    expect(res.status).toBe(409);
    expect((await res.json()).error?.code).toBe("REDEMPTION_PREVIOUSLY_FAILED");
    expect(admin.appendCalls).toHaveLength(0);
    expect(admin.walletCalls).toHaveLength(0);
  });

  it("wallet failure returns the points and tags the compensation with the key", async () => {
    const admin = makeAdmin({
      ledger: { redeemed: [], adjusted: [] },
      walletError: { message: "wallet down" },
    });
    await setup(admin);

    const res = await post({ points: 200, idempotency_key: KEY });

    expect(res.status).toBe(500);
    expect((await res.json()).error?.code).toBe("WALLET_CREDIT_FAILED");
    expect(admin.appendCalls).toHaveLength(2);
    expect(admin.appendCalls[1]).toMatchObject({
      p_transaction_type: "adjusted",
      p_points_amount: 200,
      p_metadata: expect.objectContaining({ redeem_idempotency_key: KEY }),
    });
  });

  it("legacy clients without a key still get a wallet idempotency key from the ledger row", async () => {
    const admin = makeAdmin({
      ledger: { redeemed: [], adjusted: [] },
      appendResults: [{ data: "ledger-row-9", error: null }],
    });
    await setup(admin);

    const res = await post({ points: 200 });

    expect(res.status).toBe(200);
    expect(admin.walletCalls).toEqual([
      expect.objectContaining({ p_idempotency_key: "loyalty_redeem:ledger:ledger-row-9" }),
    ]);
  });

  it("insufficient balance from the ledger RPC is a 400, not a 500", async () => {
    const admin = makeAdmin({
      ledger: { redeemed: [], adjusted: [] },
      appendResults: [{ data: null, error: { message: "insufficient_loyalty_balance" } }],
    });
    await setup(admin);

    const res = await post({ points: 200, idempotency_key: KEY });

    expect(res.status).toBe(400);
    expect(admin.walletCalls).toHaveLength(0);
  });
});
