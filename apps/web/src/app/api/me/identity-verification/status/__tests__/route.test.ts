import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockResolveEffectiveVerificationDisplayStatus = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  successResponse: (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  handleApiError: (error: unknown) =>
    Response.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Error" } },
      { status: 500 },
    ),
}));

vi.mock("@/lib/identity-verification/resolve-effective-verification-display-status", () => ({
  resolveEffectiveVerificationDisplayStatus: (...args: unknown[]) =>
    mockResolveEffectiveVerificationDisplayStatus(...args),
}));

describe("GET /api/me/identity-verification/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1", role: "customer" } });
  });

  it("returns legacy-approved status from resolveEffectiveVerificationDisplayStatus", async () => {
    mockResolveEffectiveVerificationDisplayStatus.mockResolvedValue("approved");

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("https://app.example.com/api/me/identity-verification/status"));
    const body = await res.json();

    expect(body.data.status).toBe("approved");
    expect(mockResolveEffectiveVerificationDisplayStatus).toHaveBeenCalledWith("user-1", "customer");
  });
});
