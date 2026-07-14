import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAdmin = vi.fn();
const mockResolveTenant = vi.fn();
const mockGetCallsConfig = vi.fn();
const mockIsTwilioVoiceEnabled = vi.fn();
const mockResolveVoiceCreds = vi.fn();
const mockGenerateToken = vi.fn();

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
  isTwilioVoiceEnabled: (...args: unknown[]) => mockIsTwilioVoiceEnabled(...args),
}));

vi.mock("@/lib/integrations/twilio", () => ({
  resolveTwilioVoiceCredentials: (...args: unknown[]) => mockResolveVoiceCreds(...args),
  generateTwilioVoiceAccessToken: (...args: unknown[]) => mockGenerateToken(...args),
}));

describe("POST /api/admin/provider-ops/voice/token", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "admin_operations" } });
    mockResolveTenant.mockResolvedValue("tenant-1");
    mockGetCallsConfig.mockResolvedValue({ config: null, twilioVoiceConfigured: false });
    mockIsTwilioVoiceEnabled.mockReturnValue(false);
    mockResolveVoiceCreds.mockResolvedValue(null);
    mockGenerateToken.mockReturnValue("jwt.token.here");
  });

  it("returns 403 when Twilio Voice is disabled", async () => {
    const { POST } = await import("../token/route");
    const req = new NextRequest("http://localhost/api/admin/provider-ops/voice/token", {
      method: "POST",
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error?.code).toBe("VOICE_DISABLED");
  });

  it("returns token when enabled and configured", async () => {
    mockIsTwilioVoiceEnabled.mockReturnValue(true);
    mockResolveVoiceCreds.mockResolvedValue({
      accountSid: "AC",
      authToken: "tok",
      apiKeySid: "SK",
      apiKeySecret: "sec",
      twimlAppSid: "AP",
      voiceFrom: "+15551234567",
    });

    const { POST } = await import("../token/route");
    const req = new NextRequest("http://localhost/api/admin/provider-ops/voice/token", {
      method: "POST",
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.token).toBe("jwt.token.here");
    expect(body.data.identity).toBe("admin-1");
  });
});
