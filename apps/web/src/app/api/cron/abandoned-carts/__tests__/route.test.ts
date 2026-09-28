import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyCronRequest = vi.fn();
const mockDispatchTemplateNotification = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/cron-auth", () => ({
  verifyCronRequest: (...args: unknown[]) => mockVerifyCronRequest(...args),
}));

vi.mock("@/lib/cron/locked-cron-route", () => ({
  runLockedCronRoute: (_name: string, fn: () => Promise<Response>) => fn(),
}));

vi.mock("@/lib/notifications/dispatch-template-notification", () => ({
  dispatchTemplateNotification: (...args: unknown[]) => mockDispatchTemplateNotification(...args),
}));

const idleCartRow = {
  user_id: "user-1",
  provider_id: "prov-1",
  product_id: "prod-1",
  product_variant_id: null,
  quantity: 1,
  updated_at: "2026-01-14T00:00:00.000Z",
  product: {
    name: "Shampoo",
    is_active: true,
    retail_sales_enabled: true,
    track_stock_quantity: false,
    quantity: 5,
  },
  product_variant: null,
};

function makeAdmin(opts: {
  ledgerRows?: Array<{ user_id: string; cart_fingerprint: string; send_count: number; last_sent_at: string | null }>;
  upserts: unknown[];
}) {
  return {
    from: (table: string) => {
      if (table === "cart_items") {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.lt = () => chain;
        chain.gt = () => chain;
        chain.order = () => chain;
        chain.limit = () => Promise.resolve({ data: [idleCartRow], error: null });
        return chain;
      }
      if (table === "product_order_items") {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.in = () => Promise.resolve({ data: [], error: null });
        return chain;
      }
      if (table === "providers") {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.in = () =>
          Promise.resolve({
            data: [{ id: "prov-1", tenant_id: "tenant-1" }],
            error: null,
          });
        return chain;
      }
      if (table === "abandoned_cart_reminders") {
        let inCalls = 0;
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.in = () => {
          inCalls += 1;
          if (inCalls >= 2) {
            return Promise.resolve({
              data: opts.ledgerRows ?? [],
              error: null,
            });
          }
          return chain;
        };
        chain.upsert = (payload: unknown) => {
          opts.upserts.push(payload);
          return Promise.resolve({ error: null });
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("GET /api/cron/abandoned-carts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    mockVerifyCronRequest.mockReturnValue({ valid: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("increments ledger when dispatch succeeds", async () => {
    const upserts: unknown[] = [];
    mockGetSupabaseAdmin.mockReturnValue(makeAdmin({ upserts }));
    mockDispatchTemplateNotification.mockResolvedValue({
      success: true,
      notification_id: "sent-1",
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/cron/abandoned-carts"));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.sent).toBe(1);
    expect(mockDispatchTemplateNotification).toHaveBeenCalledTimes(1);
    expect(upserts).toHaveLength(1);
    expect((upserts[0] as { send_count: number }).send_count).toBe(1);
  });

  it("does not increment ledger when dispatch is suppressed", async () => {
    const upserts: unknown[] = [];
    mockGetSupabaseAdmin.mockReturnValue(makeAdmin({ upserts }));
    mockDispatchTemplateNotification.mockResolvedValue({
      success: true,
      notification_id: "suppressed-preferences",
    });

    const { GET } = await import("../route");
    const res = await import("../route").then((m) => m.GET(new NextRequest("http://localhost/api/cron/abandoned-carts")));
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(upserts).toHaveLength(0);
  });

  it("skips send when cap cooldown has not elapsed", async () => {
    const upserts: unknown[] = [];
    const { computeCartFingerprint } = await import("@/lib/commerce/abandoned-cart");
    const fingerprint = computeCartFingerprint([
      {
        user_id: "user-1",
        provider_id: "prov-1",
        product_id: "prod-1",
        product_variant_id: null,
        quantity: 1,
        updated_at: idleCartRow.updated_at,
        product_name: "Shampoo",
        is_active: true,
        retail_sales_enabled: true,
        track_stock_quantity: false,
        product_quantity: 5,
        variant_quantity: null,
      },
    ]);

    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({
        upserts,
        ledgerRows: [
          {
            user_id: "user-1",
            cart_fingerprint: fingerprint,
            send_count: 1,
            last_sent_at: "2026-01-15T10:00:00.000Z",
          },
        ],
      }),
    );

    const { GET } = await import("../route");
    const body = await (await GET(new NextRequest("http://localhost/api/cron/abandoned-carts"))).json();

    expect(body.sent).toBe(0);
    expect(mockDispatchTemplateNotification).not.toHaveBeenCalled();
  });
});
