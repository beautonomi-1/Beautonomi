import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockPatchCustomOfferMessageAttachments = vi.fn();
const mockGetNotificationTemplate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/custom-offers/sync-offer-message-attachments", () => ({
  patchCustomOfferMessageAttachments: (...args: unknown[]) => mockPatchCustomOfferMessageAttachments(...args),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  getNotificationTemplate: (...args: unknown[]) => mockGetNotificationTemplate(...args),
  sendTemplateNotification: vi.fn(),
  sendToUser: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  successResponse: (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  handleApiError: (error: unknown, fallback: string) =>
    Response.json(
      { data: null, error: { message: error instanceof Error ? error.message : fallback } },
      { status: 500 },
    ),
  notFoundResponse: (msg: string) =>
    Response.json({ data: null, error: { message: msg, code: "NOT_FOUND" } }, { status: 404 }),
  errorResponse: (msg: string, code: string, status: number, extra?: unknown) =>
    Response.json({ data: null, error: { message: msg, code, ...(extra as object) } }, { status }),
}));

function setupOffer(status: string) {
  mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
  mockGetProviderIdForUser.mockResolvedValue("provider-1");
  mockGetNotificationTemplate.mockResolvedValue(null);
  mockPatchCustomOfferMessageAttachments.mockResolvedValue(undefined);
  mockGetSupabaseServer.mockReturnValue({
    from: (table: string) => {
      if (table === "custom_offers") {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "offer-1",
                  provider_id: "provider-1",
                  status,
                  request_id: "req-1",
                  currency: "ZAR",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  });
  mockGetSupabaseAdmin.mockReturnValue({
    from: (table: string) => {
      if (table === "custom_offers") {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      if (table === "custom_requests") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { customer_id: "cust-1" }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              in: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { business_name: "Salon" }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected admin table ${table}`);
    },
  });
}

describe("PATCH /api/provider/custom-offers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("edits a changes_requested offer back to pending", async () => {
    setupOffer("changes_requested");
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { PATCH } = await import("../route");
    const res = await PATCH(
      new NextRequest("https://app.example.com/api/provider/custom-offers/offer-1", {
        method: "PATCH",
        body: JSON.stringify({
          price: 450,
          duration_minutes: 90,
          expiration_at: future,
          notes: "Revised quote",
        }),
      }),
      { params: Promise.resolve({ id: "offer-1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.updated).toBe(true);
    expect(mockPatchCustomOfferMessageAttachments).toHaveBeenCalledWith(
      expect.anything(),
      "offer-1",
      expect.objectContaining({ status: "pending" }),
    );
  });

  it("blocks payment_pending edits", async () => {
    setupOffer("payment_pending");
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { PATCH } = await import("../route");
    const res = await PATCH(
      new NextRequest("https://app.example.com/api/provider/custom-offers/offer-1", {
        method: "PATCH",
        body: JSON.stringify({
          price: 450,
          duration_minutes: 90,
          expiration_at: future,
        }),
      }),
      { params: Promise.resolve({ id: "offer-1" }) },
    );
    expect(res.status).toBe(409);
  });
});
