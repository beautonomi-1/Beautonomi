import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
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
  successResponse: (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  handleApiError: (error: unknown, fallback: string) =>
    Response.json(
      { data: null, error: { message: error instanceof Error ? error.message : fallback } },
      { status: 500 },
    ),
  notFoundResponse: (msg: string) =>
    Response.json({ data: null, error: { message: msg, code: "NOT_FOUND" } }, { status: 404 }),
  errorResponse: (msg: string, code: string, status: number) =>
    Response.json({ data: null, error: { message: msg, code } }, { status }),
}));

function setup(offer: Record<string, unknown>) {
  mockRequireRoleInApi.mockResolvedValue({ user: { id: "cust-1" } });
  mockGetNotificationTemplate.mockResolvedValue({ enabled: true, channels: ["push"] });
  mockPatchCustomOfferMessageAttachments.mockResolvedValue(undefined);
  mockGetSupabaseServer.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({ data: offer, error: null }),
        }),
      }),
    }),
  });
  mockGetSupabaseAdmin.mockReturnValue({
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  });
}

describe("POST /api/me/custom-offers/[id]/request-changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("moves a pending offer to changes_requested", async () => {
    setup({
      id: "offer-1",
      status: "pending",
      request_id: "req-1",
      request: { customer_id: "cust-1", provider_id: "provider-1" },
    });
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("https://app.example.com/api/me/custom-offers/offer-1/request-changes", {
        method: "POST",
        body: JSON.stringify({ note: "Can we do Saturday instead?" }),
      }),
      { params: Promise.resolve({ id: "offer-1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.changesRequested).toBe(true);
    expect(mockPatchCustomOfferMessageAttachments).toHaveBeenCalled();
  });

  it("rejects payment_pending offers", async () => {
    setup({
      id: "offer-1",
      status: "payment_pending",
      request_id: "req-1",
      request: { customer_id: "cust-1", provider_id: "provider-1" },
    });
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("https://app.example.com/api/me/custom-offers/offer-1/request-changes", {
        method: "POST",
        body: JSON.stringify({ note: "Too expensive" }),
      }),
      { params: Promise.resolve({ id: "offer-1" }) },
    );
    expect(res.status).toBe(409);
  });
});
