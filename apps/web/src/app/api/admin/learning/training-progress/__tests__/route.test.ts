import { describe, it, expect, vi, beforeEach } from "vitest";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const mockRequireAdminSection = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  };
});

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/learning/sync-path-completion", () => ({
  syncPathCompletionIfReady: vi.fn().mockResolvedValue({ completed_at: null }),
}));

describe("POST /api/admin/learning/training-progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSection.mockResolvedValue({
      user: { id: MOCK_USERS.superadmin.id, role: MOCK_USERS.superadmin.role },
    });
  });

  it("records sign-off with the authenticated user id", async () => {
    const upsertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { signed_off_at: "2026-01-01T00:00:00.000Z" },
          error: null,
        }),
      }),
    });

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "learning_training_paths") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { slug: "new-support-agent", article_slugs: ["support-desk-runbook"] },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "learning_articles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "a1",
                    slug: "support-desk-runbook",
                    title: "Support",
                    summary: null,
                    audience: "internal",
                    is_internal: true,
                    status: "published",
                    content_type: "article",
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === "learning_training_progress") {
          return { upsert: upsertSpy };
        }
        return {};
      }),
    });

    const { POST } = await import("../route");
    const req = {
      method: "POST",
      json: vi.fn().mockResolvedValue({
        path_slug: "new-support-agent",
        article_slug: "support-desk-runbook",
      }),
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: MOCK_USERS.superadmin.id,
        path_slug: "new-support-agent",
        article_slug: "support-desk-runbook",
      }),
      expect.any(Object),
    );
  });
});
