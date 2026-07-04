import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockDiditEnvPresent = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/identity-verification/provider/didit-provider", () => ({
  diditEnvPresent: () => mockDiditEnvPresent(),
}));

describe("GET /api/admin/control-plane/integrations/didit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });
    mockDiditEnvPresent.mockReturnValue(true);

    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: { received_at: "2026-07-04T10:00:00.000Z" },
        error: null,
      })),
    };
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => chain),
    });

    process.env.DIDIT_API_KEY = "test-key";
    process.env.DIDIT_WORKFLOW_ID = "wf-123";
    process.env.DIDIT_WEBHOOK_SECRET = "whsec-test";
    process.env.NEXT_PUBLIC_APP_URL = "https://beautonomi.com";
    delete process.env.DIDIT_BASE_URL;
    delete process.env.DIDIT_ENVIRONMENT;
  });

  it("returns health payload without exposing secrets", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("https://app.test/api/admin/control-plane/integrations/didit"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data).toMatchObject({
      api_key_set: true,
      workflow_id_set: true,
      webhook_secret_set: true,
      base_url: "https://verification.didit.me",
      environment: "production",
      env_complete: true,
      webhook_url: "https://beautonomi.com/api/webhooks/didit",
      last_webhook_received_at: "2026-07-04T10:00:00.000Z",
    });
    expect(JSON.stringify(body)).not.toContain("test-key");
    expect(JSON.stringify(body)).not.toContain("whsec-test");
  });

  it("returns webhook_url null when NEXT_PUBLIC_APP_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    mockDiditEnvPresent.mockReturnValue(false);
    delete process.env.DIDIT_API_KEY;

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("https://app.test/api/admin/control-plane/integrations/didit"));
    const body = await res.json();

    expect(body.data.webhook_url).toBeNull();
    expect(body.data.env_complete).toBe(false);
    expect(body.data.api_key_set).toBe(false);
  });
});
