import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRole = vi.fn();
const mockRequireSocialAccess = vi.fn();
const mockGetProviderId = vi.fn();
const mockIsExploreProviderPostsEnabled = vi.fn();
const mockIsExploreSoundCatalogEnabled = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRole(...args),
  getProviderIdForUser: (...args: unknown[]) => mockGetProviderId(...args),
  successResponse: (data: unknown, status = 200) =>
    new Response(JSON.stringify({ data }), { status }),
  errorResponse: (message: string, code: string, status: number) =>
    new Response(JSON.stringify({ error: { message, code } }), { status }),
  handleApiError: (err: Error) => new Response(JSON.stringify({ error: err.message }), { status: 500 }),
}));

vi.mock("@/lib/safety/require-social-access", () => ({
  requireSocialAccess: (...args: unknown[]) => mockRequireSocialAccess(...args),
}));

vi.mock("@/lib/explore/explore-feature-gates", () => ({
  isExploreProviderPostsEnabled: (...args: unknown[]) => mockIsExploreProviderPostsEnabled(...args),
  isExploreSoundCatalogEnabled: (...args: unknown[]) => mockIsExploreSoundCatalogEnabled(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({})),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(async () => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: "s1" }, error: null })),
        })),
      })),
    })),
  })),
}));

describe("POST /api/explore/sounds/mine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ user: { id: "u1" } });
    mockRequireSocialAccess.mockResolvedValue(undefined);
    mockGetProviderId.mockResolvedValue("prov-1");
    mockIsExploreProviderPostsEnabled.mockResolvedValue(true);
    mockIsExploreSoundCatalogEnabled.mockResolvedValue(true);
  });

  it("returns 400 when rights_confirmed is missing", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/explore/sounds/mine", {
      method: "POST",
      body: JSON.stringify({
        title: "Beat",
        storage_path: "explore/prov-1/sounds/a.mp3",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
