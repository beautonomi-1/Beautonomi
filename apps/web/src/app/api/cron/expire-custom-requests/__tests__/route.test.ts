import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyCronRequest = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/cron-auth", () => ({
  verifyCronRequest: (...args: unknown[]) => mockVerifyCronRequest(...args),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  successResponse: (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  handleApiError: (error: unknown, fallback: string) =>
    Response.json(
      { data: null, error: { message: error instanceof Error ? error.message : fallback } },
      { status: 500 },
    ),
}));

vi.mock("@/lib/custom-offers/sync-offer-message-attachments", () => ({
  patchCustomOfferMessageAttachments: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  getNotificationTemplate: vi.fn().mockResolvedValue(null),
  sendTemplateNotification: vi.fn().mockResolvedValue(undefined),
  sendToUser: vi.fn().mockResolvedValue(undefined),
}));

type Captured = {
  expiredRequestIds: string[];
  expiredOfferIds: string[];
  cascadeUpdates: number;
};

function makeAdmin(opts: {
  staleRequests: Array<{ id: string; customer_id?: string; provider_id?: string }>;
  staleOffers: Array<{ id: string; request_id?: string; provider_id?: string; request?: { customer_id?: string } }>;
  captured: Captured;
}) {
  function chainable(table: string, isCascade = false) {
    const c: any = {};
    const next = (...args: unknown[]) => {
      if (args[0] === "request_id" && Array.isArray(args[1])) {
        opts.captured.cascadeUpdates += 1;
        return chainable(table, true);
      }
      return c;
    };
    c.in = next;
    c.lt = next;
    c.eq = next;
    c.select = () => {
      if (isCascade) return Promise.resolve({ data: [], error: null });
      if (table === "custom_requests") {
        return Promise.resolve({ data: opts.staleRequests, error: null });
      }
      if (table === "custom_offers") {
        return Promise.resolve({ data: opts.staleOffers, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    };
    c.then = (resolve: (v: unknown) => void) => {
      if (isCascade) {
        resolve({ data: [], error: null });
      } else if (table === "custom_requests") {
        resolve({ data: opts.staleRequests, error: null });
      } else if (table === "custom_offers") {
        resolve({ data: opts.staleOffers, error: null });
      } else {
        resolve({ data: [], error: null });
      }
    };
    return c;
  }
  return {
    from(table: string) {
      return {
        update: () => chainable(table),
      };
    },
  };
}

describe("GET /api/cron/expire-custom-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("rejects when verifyCronRequest returns invalid", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: false, error: "Unauthorized" });
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("https://app.example.com/api/cron/expire-custom-requests"));
    expect(res.status).toBe(401);
  });

  it("expires stale custom requests and cascades to pending offers", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    const captured: Captured = { expiredRequestIds: [], expiredOfferIds: [], cascadeUpdates: 0 };
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({
        staleRequests: [
          { id: "req-1", customer_id: "cust-1", provider_id: "prov-1" },
          { id: "req-2", customer_id: "cust-2", provider_id: "prov-2" },
        ],
        staleOffers: [
          { id: "offer-1", request_id: "req-1", provider_id: "prov-1", request: { customer_id: "cust-1" } },
        ],
        captured,
      }),
    );

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("https://app.example.com/api/cron/expire-custom-requests"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.expired_requests).toBe(2);
    expect(body.data.expired_offers).toBe(1);
    expect(captured.cascadeUpdates).toBe(1);
  });
});
