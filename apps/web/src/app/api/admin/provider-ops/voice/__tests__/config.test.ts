import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAdmin = vi.fn();
const mockResolveTenant = vi.fn();
const mockGetCallsConfig = vi.fn();
const mockIsVoiceEnabled = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdmin(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockResolveTenant(...args),
}));

vi.mock("@/lib/integrations/calls-config", () => ({
  getCallsIntegrationConfig: (...args: unknown[]) => mockGetCallsConfig(...args),
  isTwilioVoiceEnabled: (...args: unknown[]) => mockIsVoiceEnabled(...args),
}));

describe("GET /api/admin/provider-ops/voice/config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "admin_operations" } });
    mockResolveTenant.mockResolvedValue("tenant-1");
  });

  it("returns enabled + configured when voice is on", async () => {
    mockGetCallsConfig.mockResolvedValue({ config: {}, twilioVoiceConfigured: true });
    mockIsVoiceEnabled.mockReturnValue(true);

    const { GET } = await import("../config/route");
    const req = new NextRequest("http://localhost/api/admin/provider-ops/voice/config");
    const res = await GET(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ enabled: true, configured: true });
  });

  it("returns disabled when the toggle is off even if credentials exist", async () => {
    mockGetCallsConfig.mockResolvedValue({ config: {}, twilioVoiceConfigured: true });
    mockIsVoiceEnabled.mockReturnValue(false);

    const { GET } = await import("../config/route");
    const req = new NextRequest("http://localhost/api/admin/provider-ops/voice/config");
    const res = await GET(req);
    const body = await res.json();
    expect(body.data).toEqual({ enabled: false, configured: true });
  });

  it("returns enabled but unconfigured when credentials are missing", async () => {
    mockGetCallsConfig.mockResolvedValue({ config: {}, twilioVoiceConfigured: false });
    mockIsVoiceEnabled.mockReturnValue(true);

    const { GET } = await import("../config/route");
    const req = new NextRequest("http://localhost/api/admin/provider-ops/voice/config");
    const res = await GET(req);
    const body = await res.json();
    expect(body.data).toEqual({ enabled: true, configured: false });
  });
});
