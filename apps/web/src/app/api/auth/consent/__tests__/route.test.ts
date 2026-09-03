import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockPersistMarketingConsent = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  successResponse: (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  errorResponse: (message: string, code?: string, status = 400) =>
    Response.json({ data: null, error: { message, code } }, { status }),
  handleApiError: (error: unknown, message = "Error") =>
    Response.json(
      { data: null, error: { message: `${message}: ${error instanceof Error ? error.message : String(error)}` } },
      { status: 500 },
    ),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({})),
}));

vi.mock("@/lib/auth/persist-marketing-consent", () => ({
  persistMarketingConsent: (...args: unknown[]) => mockPersistMarketingConsent(...args),
}));

describe("POST /api/auth/consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-consent-1" } });
    mockPersistMarketingConsent.mockResolvedValue({ ok: true });
  });

  it("persists marketing_consent=true via the helper", async () => {
    const { POST } = await import("../route");
    const request = new NextRequest("http://localhost/api/auth/consent", {
      method: "POST",
      body: JSON.stringify({ marketing_consent: true }),
    });
    const res = await POST(request);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.marketing_consent).toBe(true);
    expect(mockPersistMarketingConsent).toHaveBeenCalledWith(expect.anything(), "user-consent-1", true);
  });

  it("defaults unchecked consent to false", async () => {
    const { POST } = await import("../route");
    const request = new NextRequest("http://localhost/api/auth/consent", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(request);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.marketing_consent).toBe(false);
    expect(mockPersistMarketingConsent).toHaveBeenCalledWith(expect.anything(), "user-consent-1", false);
  });
});
