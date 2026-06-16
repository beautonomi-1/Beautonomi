import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * §custom-request-create-tests 2026-05: lock in the response contract the
 * customer app now depends on:
 *  - Successful create surfaces `attachment_warning` when attachments fail.
 *  - Budget validation errors come back as `VALIDATION_ERROR`.
 *  - Tenant mismatch / disabled provider return structured codes.
 */

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveTenantId = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenantId(...args),
}));

interface BuilderConfig {
  /** Provider tenant-match lookup (id + accepts_custom_requests). */
  providerLookup?: { data: any; error?: any };
  providerOwnerLookup?: { data: any; error?: any };
  /** Insert into custom_requests. */
  insertRequest?: { data: any; error?: any };
  /** Insert into custom_request_attachments. */
  insertAttachments?: { error?: any };
  /** Insert into conversations. */
  insertConversation?: { data: any; error?: any };
  /** Insert into messages. */
  insertMessage?: { error?: any };
  /** Existing conversation lookup. */
  existingConversation?: { data: any; error?: any };
  /** Notifications gate row. */
  notificationsTable?: { data: any; error?: any };
}

function buildSupabaseMock(config: BuilderConfig) {
  const fromCalls: string[] = [];
  const from = vi.fn((table: string) => {
    fromCalls.push(table);
    switch (table) {
      case "providers": {
        // First chain: select id + accepts_custom_requests; later: select user_id + business_name
        const builder: any = {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue(config.providerLookup ?? { data: null, error: null }),
              }),
              single: vi
                .fn()
                .mockResolvedValue(config.providerOwnerLookup ?? { data: null, error: null }),
            }),
          }),
        };
        return builder;
      }
      case "custom_requests": {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockResolvedValue(
                  config.insertRequest ?? { data: { id: "req-1" }, error: null },
                ),
            }),
          }),
        };
      }
      case "custom_request_attachments": {
        return {
          insert: vi.fn().mockResolvedValue(config.insertAttachments ?? { error: null }),
        };
      }
      case "conversations": {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi
                        .fn()
                        .mockResolvedValue(
                          config.existingConversation ?? { data: null, error: null },
                        ),
                    }),
                  }),
                }),
              }),
              single: vi
                .fn()
                .mockResolvedValue({ data: { unread_count_provider: 0 }, error: null }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockResolvedValue(
                  config.insertConversation ?? { data: { id: "conv-1" }, error: null },
                ),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      case "messages": {
        return {
          insert: vi.fn().mockResolvedValue(config.insertMessage ?? { error: null }),
        };
      }
      case "notifications": {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue(config.notificationsTable ?? { data: null, error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      default:
        return { select: vi.fn(), insert: vi.fn(), update: vi.fn() };
    }
  });
  return { from, fromCalls };
}

function buildAdminMock(config?: {
  existingConversation?: { data: unknown; error?: unknown };
  insertConversation?: { data: unknown; error?: unknown };
  insertMessage?: { error?: unknown };
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi
                      .fn()
                      .mockResolvedValue(
                        config?.existingConversation ?? { data: null, error: null },
                      ),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockResolvedValue(
                  config?.insertConversation ?? { data: { id: "conv-1" }, error: null },
                ),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === "messages") {
        return {
          insert: vi.fn().mockResolvedValue(config?.insertMessage ?? { error: null }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              lt: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      };
    }),
  };
}

function buildPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/me/custom-requests", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_BODY = {
  provider_id: "11111111-1111-4111-8111-111111111111",
  description: "Looking for a bridal makeup look for my wedding next weekend.",
  duration_minutes: 60,
  location_type: "at_salon" as const,
  image_urls: [
    "https://cdn.test/image-1.jpg",
    "https://cdn.test/image-2.jpg",
  ],
};

describe("POST /api/me/custom-requests", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "customer-1", email: "c@example.com", role: "customer", full_name: "C" },
    });
    mockResolveTenantId.mockResolvedValue("tenant-1");
    mockGetSupabaseAdmin.mockReturnValue(buildAdminMock());
    // Silence dynamic imports for OneSignal notifications used by the route.
    vi.doMock("@/lib/notifications/onesignal", () => ({
      sendToUser: vi.fn().mockResolvedValue(undefined),
      sendTemplateNotification: vi.fn().mockResolvedValue(undefined),
      getNotificationTemplate: vi.fn().mockResolvedValue(null),
    }));
  });

  it("creates a request and returns conversation_id + attachments_saved", async () => {
    const supa = buildSupabaseMock({
      providerLookup: { data: { id: VALID_BODY.provider_id, accepts_custom_requests: true } },
      providerOwnerLookup: {
        data: { user_id: "provider-user-1", business_name: "Glow Studio" },
      },
    });
    mockGetSupabaseServer.mockResolvedValue(supa);

    const { POST } = await import("../route");
    const res = await POST(buildPostRequest(VALID_BODY));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.conversation_id).toBe("conv-1");
    expect(json.data.attachments_saved).toBe(2);
    expect(json.data.attachment_warning).toBeUndefined();
    expect(json.data.message_warning).toBeUndefined();
  });

  it("returns attachment_warning when attachment insert fails but request was created", async () => {
    const supa = buildSupabaseMock({
      providerLookup: { data: { id: VALID_BODY.provider_id, accepts_custom_requests: true } },
      providerOwnerLookup: {
        data: { user_id: "provider-user-1", business_name: "Glow Studio" },
      },
      insertAttachments: { error: { message: "row level security blocked insert" } },
    });
    mockGetSupabaseServer.mockResolvedValue(supa);

    const { POST } = await import("../route");
    const res = await POST(buildPostRequest(VALID_BODY));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.attachment_warning).toMatch(/inspiration photos/i);
  });

  it("returns 400 VALIDATION_ERROR when budget_max < budget_min", async () => {
    const supa = buildSupabaseMock({
      providerLookup: { data: { id: VALID_BODY.provider_id, accepts_custom_requests: true } },
    });
    mockGetSupabaseServer.mockResolvedValue(supa);

    const { POST } = await import("../route");
    const res = await POST(
      buildPostRequest({ ...VALID_BODY, budget_min: 200, budget_max: 50 }),
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 TENANT_MISMATCH when provider not found in tenant", async () => {
    const supa = buildSupabaseMock({
      providerLookup: { data: null },
    });
    mockGetSupabaseServer.mockResolvedValue(supa);

    const { POST } = await import("../route");
    const res = await POST(buildPostRequest(VALID_BODY));
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error.code).toBe("TENANT_MISMATCH");
  });

  it("returns 403 CUSTOM_REQUESTS_DISABLED when provider opted out", async () => {
    const supa = buildSupabaseMock({
      providerLookup: {
        data: { id: VALID_BODY.provider_id, accepts_custom_requests: false },
      },
    });
    mockGetSupabaseServer.mockResolvedValue(supa);

    const { POST } = await import("../route");
    const res = await POST(buildPostRequest(VALID_BODY));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.error.code).toBe("CUSTOM_REQUESTS_DISABLED");
  });
});
