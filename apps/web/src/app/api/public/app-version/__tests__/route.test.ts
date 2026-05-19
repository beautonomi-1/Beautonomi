import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle,
          })),
        })),
      })),
    })),
  })),
}));

describe("/api/public/app-version", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a valid native platform", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/public/app-version?platform=windows&version=1.0.0"));

    expect(res.status).toBe(400);
  });

  it("marks current version below minimum as requiring update", async () => {
    mockSingle.mockResolvedValue({
      data: {
        min_version: "1.2.0",
        latest_version: "1.3.0",
        force_update: true,
        update_url: "https://play.google.com/store/apps/details?id=com.beautonomi",
      },
      error: null,
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/public/app-version?app=customer&platform=android&version=v1.1.9"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.requiresUpdate).toBe(true);
    expect(body.forceUpdate).toBe(true);
    expect(body.minVersion).toBe("1.2.0");
    expect(body.currentVersion).toBe("1.1.9");
  });

  it("handles prerelease/build metadata without false NaN comparisons", async () => {
    mockSingle.mockResolvedValue({
      data: {
        min_version: "1.2.0",
        latest_version: "1.2.1+45",
        force_update: true,
        update_url: "https://apps.apple.com/app/id123456789",
      },
      error: null,
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/public/app-version?app=provider&platform=ios&version=1.2.0+44"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.requiresUpdate).toBe(false);
    expect(body.latestVersion).toBe("1.2.1+45");
  });
});
