import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRole = vi.fn();
const mockTrack = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRole(...args),
  successResponse: (data: unknown) => Response.json({ data, error: null }),
  handleApiError: (error: unknown) =>
    Response.json({ data: null, error: { message: String(error) } }, { status: 500 }),
}));

vi.mock("@/lib/analytics/provider-subscription-funnel", () => ({
  trackProviderCheckoutFunnel: (...args: unknown[]) => mockTrack(...args),
}));

describe("POST /api/provider/subscription/funnel-event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("records checkout abandoned for authenticated provider", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("https://app.example.com/api/provider/subscription/funnel-event", {
      method: "POST",
      body: JSON.stringify({
        event: "provider_checkout_abandoned",
        properties: { source: "subscription_return", platform: "web" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockTrack).toHaveBeenCalledWith(
      "provider_checkout_abandoned",
      { source: "subscription_return", platform: "web" },
      "user-1",
    );
  });
});
