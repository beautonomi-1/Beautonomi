/**
 * GET /api/me/gift-cards — multi-card / bulk visibility regression.
 *
 * Before the fix this endpoint only returned `gift_card_orders.gift_card_id`
 * (the FIRST card issued for a bulk order). Buyers who paid for 5 cards saw
 * 1 card on the success page and in account settings. The webhook stores the
 * remaining cards with `metadata.order_id = <order id>`, so this test pins
 * the contract: cards 2..N must be returned alongside the FK-linked first card.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

const mockGetSupabaseServer = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

function ordersChain(orders: Array<{ id?: string; gift_card_id?: string | null }>) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: orders, error: null }),
      })),
    })),
  };
}

function redemptionsChain(rows: Array<{ gift_card_id: string }>) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
    })),
  };
}

describe("GET /api/me/gift-cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "buyer-1", email: "buyer@example.com", role: "customer" },
    });
  });

  it("returns every card issued for a bulk order (not just the first)", async () => {
    // Server (RLS-scoped) side: orders + redemptions
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "gift_card_orders") {
          return ordersChain([{ id: "order-1", gift_card_id: "card-1" }]);
        }
        if (table === "gift_card_redemptions") {
          return redemptionsChain([]);
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    // Admin side: bulk siblings via metadata.order_id, recipient_email scan, final fetch
    const orCalls: string[] = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table !== "gift_cards") throw new Error(`Unexpected admin table ${table}`);
        return {
          select: vi.fn((cols: string) => {
            if (cols === "id") {
              // metadata.order_id sibling query
              return {
                or: vi.fn((expr: string) => {
                  orCalls.push(expr);
                  return Promise.resolve({
                    data: [{ id: "card-1" }, { id: "card-2" }, { id: "card-3" }],
                    error: null,
                  });
                }),
              };
            }
            if (cols === "id, metadata") {
              // recipient_email scan
              return {
                eq: vi.fn(() => ({
                  or: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              };
            }
            if (cols === "*") {
              // final hydrate
              return {
                in: vi.fn(() => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      { id: "card-1", code: "AAA", balance: 500, currency: "ZAR", metadata: { order_id: "order-1" } },
                      { id: "card-2", code: "BBB", balance: 500, currency: "ZAR", metadata: { order_id: "order-1" } },
                      { id: "card-3", code: "CCC", balance: 500, currency: "ZAR", metadata: { order_id: "order-1" } },
                    ],
                    error: null,
                  }),
                })),
              };
            }
            throw new Error(`Unexpected select(${cols})`);
          }),
        };
      }),
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/me/gift-cards"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(orCalls[0]).toContain("metadata->>order_id.eq.order-1");
    expect(body.data.gift_cards).toHaveLength(3);
    const ids = (body.data.gift_cards as Array<{ id: string }>).map((c) => c.id).sort();
    expect(ids).toEqual(["card-1", "card-2", "card-3"]);
  });

  it("returns single-card orders without crashing when there are no bulk siblings", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "gift_card_orders") {
          return ordersChain([{ id: "order-9", gift_card_id: "card-9" }]);
        }
        if (table === "gift_card_redemptions") {
          return redemptionsChain([]);
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn((cols: string) => {
          if (cols === "id") {
            return { or: vi.fn().mockResolvedValue({ data: [{ id: "card-9" }], error: null }) };
          }
          if (cols === "id, metadata") {
            return {
              eq: vi.fn(() => ({ or: vi.fn().mockResolvedValue({ data: [], error: null }) })),
            };
          }
          if (cols === "*") {
            return {
              in: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [{ id: "card-9", code: "ZZZ", balance: 100, currency: "ZAR" }],
                  error: null,
                }),
              })),
            };
          }
          throw new Error(`Unexpected select(${cols})`);
        }),
      })),
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/me/gift-cards"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.gift_cards).toHaveLength(1);
    expect(body.data.gift_cards[0].id).toBe("card-9");
  });

  it("returns empty list when buyer has no orders, redemptions, or recipient gifts", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "gift_card_orders") return ordersChain([]);
        if (table === "gift_card_redemptions") return redemptionsChain([]);
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ or: vi.fn().mockResolvedValue({ data: [], error: null }) })),
        })),
      })),
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/me/gift-cards"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.gift_cards).toEqual([]);
  });
});
