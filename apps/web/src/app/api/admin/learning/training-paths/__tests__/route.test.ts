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

function makeRequest() {
  return {
    method: "GET",
    url: "http://localhost/api/admin/learning/training-paths",
    headers: { get: () => null },
  } as any;
}

describe("GET /api/admin/learning/training-paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSection.mockResolvedValue({
      user: { id: MOCK_USERS.superadmin.id, role: MOCK_USERS.superadmin.role },
    });
  });

  it("returns 500 on paths query error instead of empty list", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "db down" } }),
        }),
      })),
    });

    const { GET } = await import("../route");
    const res = await GET(makeRequest());
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it("omits answer_index from checkpoint_quiz in response", async () => {
    const pathRow = {
      id: "p1",
      slug: "new-support-agent",
      title: "Support",
      role: "support",
      description: null,
      sort_order: 1,
      article_slugs: ["support-desk-runbook"],
      checkpoint_quiz: [{ id: "q1", prompt: "?", choices: ["a", "b"], answer_index: 1 }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "learning_training_paths") {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [pathRow], error: null }),
            }),
          };
        }
        if (table === "learning_articles") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
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
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === "learning_training_completions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    });

    const { GET } = await import("../route");
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].checkpoint_quiz[0].answer_index).toBeUndefined();
    expect(body.data[0].steps[0].status).toBe("published");
  });
});
