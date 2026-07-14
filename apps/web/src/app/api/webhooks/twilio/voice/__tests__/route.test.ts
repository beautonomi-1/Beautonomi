import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockValidateSignature = vi.fn();
const mockResolveVoiceCreds = vi.fn();
const mockResolveAuthToken = vi.fn();
const mockGetCallsConfig = vi.fn();
const mockGetGlobalConfig = vi.fn();
const mockIsVoiceEnabled = vi.fn();

vi.mock("@/lib/integrations/twilio", () => ({
  validateTwilioWebhookSignature: (...args: unknown[]) => mockValidateSignature(...args),
  resolveTwilioVoiceCredentials: (...args: unknown[]) => mockResolveVoiceCreds(...args),
  resolveTwilioWebhookAuthToken: (...args: unknown[]) => mockResolveAuthToken(...args),
  voiceStatusCallbackUrl: () =>
    "https://beautonomi.com/api/webhooks/twilio/voice/status?lead_id=x",
}));

vi.mock("@/lib/integrations/calls-config", () => ({
  getCallsIntegrationConfig: (...args: unknown[]) => mockGetCallsConfig(...args),
  getGlobalCallsIntegrationConfig: (...args: unknown[]) => mockGetGlobalConfig(...args),
  isTwilioVoiceEnabled: (...args: unknown[]) => mockIsVoiceEnabled(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

function makeRequest(fields: Record<string, string>) {
  return new NextRequest("http://localhost/api/webhooks/twilio/voice", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "sig",
    },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("POST /api/webhooks/twilio/voice (TwiML)", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockValidateSignature.mockReturnValue(true);
    mockResolveAuthToken.mockResolvedValue("auth-token");
    mockGetCallsConfig.mockResolvedValue({ config: null, twilioVoiceConfigured: true });
    mockGetGlobalConfig.mockResolvedValue(null);
    mockIsVoiceEnabled.mockReturnValue(true);
    mockResolveVoiceCreds.mockResolvedValue({
      accountSid: "AC",
      authToken: "tok",
      apiKeySid: "SK",
      apiKeySecret: "sec",
      twimlAppSid: "AP",
      voiceFrom: "+15551234567",
    });

    const from = vi.fn(() => ({
      select: vi.fn(() => {
        const sel: Record<string, ReturnType<typeof vi.fn>> = {};
        sel.eq = vi.fn(() => sel);
        sel.maybeSingle = vi.fn().mockResolvedValue({
          data: { id: "lead-1", do_not_contact: false, deleted_at: null },
          error: null,
        });
        return sel;
      }),
    }));
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
  });

  it("rejects invalid signature", async () => {
    mockValidateSignature.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ To: "+27111222333", tenant_id: "tenant-1" }));
    expect(res.status).toBe(401);
  });

  it("says voice is disabled when the toggle is off (tenant scope)", async () => {
    mockIsVoiceEnabled.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({ To: "+27111222333", tenant_id: "tenant-1", lead_id: "lead-1" }),
    );
    const xml = await res.text();
    expect(res.status).toBe(200);
    expect(xml).toContain("Voice calling is disabled");
    expect(xml).not.toContain("<Dial");
  });

  it("enforces the global toggle when no tenant_id is provided", async () => {
    mockIsVoiceEnabled.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ To: "+27111222333" }));
    const xml = await res.text();
    expect(xml).toContain("Voice calling is disabled");
    expect(mockGetGlobalConfig).toHaveBeenCalled();
  });

  it("dials with the voice caller ID when enabled and configured", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        To: "+27111222333",
        tenant_id: "tenant-1",
        lead_id: "lead-1",
        From: "admin-1",
      }),
    );
    const xml = await res.text();
    expect(res.status).toBe(200);
    expect(xml).toContain("<Dial");
    expect(xml).toContain('callerId="+15551234567"');
    expect(xml).toContain("<Number>+27111222333</Number>");
  });

  it("resolves the webhook auth token per tenant", async () => {
    const { POST } = await import("../route");
    await POST(makeRequest({ To: "+27111222333", tenant_id: "tenant-1" }));
    expect(mockResolveAuthToken).toHaveBeenCalledWith(expect.anything(), "tenant-1");
  });
});
