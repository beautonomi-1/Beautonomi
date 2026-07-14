import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockPatchCustomOfferMessageAttachments = vi.fn();
const mockGetNotificationTemplate = vi.fn();
const mockSendTemplateNotification = vi.fn();
const mockSendToUser = vi.fn();

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
  sendTemplateNotification: (...args: unknown[]) => mockSendTemplateNotification(...args),
  sendToUser: (...args: unknown[]) => mockSendToUser(...args),
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

function makeMocks(request: Record<string, unknown> | null) {
  const adminFrom = vi.fn((table: string) => {
    if (table === "custom_offers") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
              limit: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
        update: () => ({ in: () => Promise.resolve({ error: null }) }),
      };
    }
    if (table === "custom_requests") {
      return {
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
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
  });

  mockGetSupabaseAdmin.mockReturnValue({ from: adminFrom });

  mockGetSupabaseServer.mockReturnValue({
    from: (table: string) => {
      if (table === "custom_requests") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({ data: request, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "custom_offers") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  });
}

describe("POST /api/provider/custom-requests/[id]/decline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetNotificationTemplate.mockResolvedValue(null);
    mockPatchCustomOfferMessageAttachments.mockResolvedValue(undefined);
  });

  it("declines a pending request", async () => {
    makeMocks({ id: "req-1", customer_id: "cust-1", provider_id: "provider-1", status: "pending" });
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("https://app.example.com/api/provider/custom-requests/req-1/decline", {
        method: "POST",
        body: JSON.stringify({ reason: "Fully booked" }),
      }),
      { params: Promise.resolve({ id: "req-1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.declined).toBe(true);
  });

  it("rejects fulfilled requests", async () => {
    makeMocks({ id: "req-1", customer_id: "cust-1", provider_id: "provider-1", status: "fulfilled" });
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("https://app.example.com/api/provider/custom-requests/req-1/decline", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "req-1" }) },
    );
    expect(res.status).toBe(400);
  });
});
