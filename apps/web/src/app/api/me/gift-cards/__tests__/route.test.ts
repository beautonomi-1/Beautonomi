/**
 * GET /api/me/gift-cards — multi-card / bulk visibility regression + per-user hides.
 *
 * Before the bulk fix this endpoint only returned `gift_card_orders.gift_card_id`
 * (the FIRST card issued for a bulk order). Buyers who paid for 5 cards saw
 * 1 card on the success page and in account settings. The webhook stores the
 * remaining cards with `metadata.order_id = <order id>`, so this test pins
 * the contract: cards 2..N must be returned alongside the FK-linked first card.
 *
 * The per-user "Remove from wallet" feature adds a `user_gift_card_hides` table;
 * the list route must exclude this user's hidden ids, and DELETE /[id] must only
 * hide cards the user legitimately holds.
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

// Audit logging is fire-and-forget; stub it so the DELETE route doesn't touch a real client.
vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  extractRequestMeta: vi.fn(() => ({ ip_address: null, user_agent: null })),
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

/** Admin `user_gift_card_hides` select chain: .select("gift_card_id").eq("user_id", x) */
function hidesChain(rows: Array<{ gift_card_id: string }>) {
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

    // Admin side: bulk siblings via metadata.order_id, recipient_email scan, hides, final fetch
    const orCalls: string[] = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "user_gift_card_hides") return hidesChain([]);
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
      from: vi.fn((table: string) => {
        if (table === "user_gift_card_hides") return hidesChain([]);
        return {
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
        };
      }),
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
      from: vi.fn((table: string) => {
        if (table === "user_gift_card_hides") return hidesChain([]);
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ or: vi.fn().mockResolvedValue({ data: [], error: null }) })),
          })),
        };
      }),
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/me/gift-cards"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.gift_cards).toEqual([]);
  });

  it("surfaces expires_at, balance, is_active and the order's deliver_at on each card", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "gift_card_orders") {
          return ordersChain([{ id: "order-1", gift_card_id: "card-1" }]);
        }
        if (table === "gift_card_redemptions") return redemptionsChain([]);
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "user_gift_card_hides") return hidesChain([]);
        if (table === "gift_card_orders") {
          return {
            select: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "order-1",
                    deliver_at: "2030-01-01T08:00:00.000Z",
                    delivered_at: null,
                    delivery_channel: "email_sms",
                  },
                ],
                error: null,
              }),
            })),
          };
        }
        return {
          select: vi.fn((cols: string) => {
            if (cols === "id") {
              return { or: vi.fn().mockResolvedValue({ data: [{ id: "card-1" }], error: null }) };
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
                    data: [
                      {
                        id: "card-1",
                        code: "AAA",
                        balance: "250.00",
                        currency: "ZAR",
                        is_active: true,
                        expires_at: "2031-01-01T00:00:00.000Z",
                        metadata: { order_id: "order-1" },
                      },
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
    const card = body.data.gift_cards[0];
    expect(card.expires_at).toBe("2031-01-01T00:00:00.000Z");
    expect(card.balance).toBe(250);
    expect(card.is_active).toBe(true);
    expect(card.deliver_at).toBe("2030-01-01T08:00:00.000Z");
    expect(card.delivered_at).toBeNull();
    expect(card.delivery_channel).toBe("email_sms");
  });

  it("excludes cards the user has hidden from their wallet", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "gift_card_orders") {
          return ordersChain([{ id: "order-1", gift_card_id: "card-1" }]);
        }
        if (table === "gift_card_redemptions") {
          return redemptionsChain([{ gift_card_id: "card-2" }]);
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const inIds: string[][] = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "user_gift_card_hides") {
          // card-2 is hidden by this user
          return hidesChain([{ gift_card_id: "card-2" }]);
        }
        return {
          select: vi.fn((cols: string) => {
            if (cols === "id") {
              return { or: vi.fn().mockResolvedValue({ data: [{ id: "card-1" }], error: null }) };
            }
            if (cols === "id, metadata") {
              return {
                eq: vi.fn(() => ({ or: vi.fn().mockResolvedValue({ data: [], error: null }) })),
              };
            }
            if (cols === "*") {
              return {
                in: vi.fn((_col: string, ids: string[]) => {
                  inIds.push(ids);
                  return {
                    order: vi.fn().mockResolvedValue({
                      data: ids.map((id) => ({ id, code: id, balance: 100, currency: "ZAR" })),
                      error: null,
                    }),
                  };
                }),
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
    // The hidden card-2 must not reach the final `.in(...)` fetch.
    expect(inIds[0]).not.toContain("card-2");
    expect(inIds[0]).toContain("card-1");
    const ids = (body.data.gift_cards as Array<{ id: string }>).map((c) => c.id);
    expect(ids).not.toContain("card-2");
  });
});

describe("DELETE /api/me/gift-cards/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "buyer-1", email: "buyer@example.com", role: "customer" },
    });
  });

  function params(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("hides a card the user purchased and returns 200", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "gift_card_orders") {
          return ordersChain([{ id: "order-1", gift_card_id: "card-1" }]);
        }
        throw new Error(`Unexpected server table ${table}`);
      }),
    });

    const upsertArgs: any[] = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "gift_cards") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "card-1", metadata: {} },
                  error: null,
                }),
              })),
            })),
          };
        }
        if (table === "user_gift_card_hides") {
          return {
            upsert: vi.fn((row: any, opts: any) => {
              upsertArgs.push({ row, opts });
              return Promise.resolve({ error: null });
            }),
          };
        }
        throw new Error(`Unexpected admin table ${table}`);
      }),
    });

    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/me/gift-cards/card-1", { method: "DELETE" }),
      params("card-1"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.hidden).toBe(true);
    expect(upsertArgs[0].row).toEqual({ user_id: "buyer-1", gift_card_id: "card-1" });
  });

  it("rejects hiding a card the user does not hold with 403", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "gift_card_orders") return ordersChain([]);
        if (table === "gift_card_redemptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          };
        }
        throw new Error(`Unexpected server table ${table}`);
      }),
    });

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "gift_cards") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  // Card exists but recipient_email belongs to someone else.
                  data: { id: "other-card", metadata: { recipient_email: "stranger@example.com" } },
                  error: null,
                }),
              })),
            })),
          };
        }
        throw new Error(`Unexpected admin table ${table}`);
      }),
    });

    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/me/gift-cards/other-card", { method: "DELETE" }),
      params("other-card"),
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when the gift card does not exist", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => ordersChain([])),
    });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "gift_cards") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          };
        }
        throw new Error(`Unexpected admin table ${table}`);
      }),
    });

    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/me/gift-cards/missing", { method: "DELETE" }),
      params("missing"),
    );

    expect(res.status).toBe(404);
  });
});
