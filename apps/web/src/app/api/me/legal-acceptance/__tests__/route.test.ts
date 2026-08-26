import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();

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

describe("POST /api/me/legal-acceptance", () => {
  const userId = "user-legal-1";
  let updateMock: ReturnType<typeof vi.fn>;
  let insertMock: ReturnType<typeof vi.fn>;
  let maybeSingleMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: userId } });

    updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    insertMock = vi.fn().mockResolvedValue({ error: null });
    maybeSingleMock = vi.fn().mockResolvedValue({
      data: { privacy_settings: { analytics_consent: true } },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
      update: updateMock,
      insert: insertMock,
    };

    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => chain),
    });
  });

  it("stores partner EULA acceptance in privacy_settings", async () => {
    const { POST } = await import("../route");
    const request = new NextRequest("http://localhost/api/me/legal-acceptance", {
      method: "POST",
      body: JSON.stringify({ app: "partner", version: "2026-08-26" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.version).toBe("2026-08-26");
    expect(body.data.app).toBe("partner");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        privacy_settings: expect.objectContaining({
          partner_eula_version: "2026-08-26",
          partner_eula_accepted_at: expect.any(String),
        }),
      }),
    );
  });

  it("stores customer EULA acceptance in privacy_settings", async () => {
    const { POST } = await import("../route");
    const request = new NextRequest("http://localhost/api/me/legal-acceptance", {
      method: "POST",
      body: JSON.stringify({ app: "customer", version: "2026-08-26" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.app).toBe("customer");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        privacy_settings: expect.objectContaining({
          customer_eula_version: "2026-08-26",
          customer_eula_accepted_at: expect.any(String),
        }),
      }),
    );
  });
});
