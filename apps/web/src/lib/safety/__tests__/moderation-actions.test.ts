import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safety/explore-post-gallery", () => ({
  removeExplorePostUrlsFromProviderGallery: vi.fn(async () => undefined),
}));

const mockUpdate = vi.fn();
const mockDelete = vi.fn();

function makeSupabase() {
  return {
    from: vi.fn((table: string) => ({
      update: mockUpdate.mockReturnValue({
        eq: vi.fn(async () => ({ error: null })),
      }),
      delete: mockDelete.mockReturnValue({
        eq: vi.fn(async () => ({ error: null })),
      }),
    })),
  } as never;
}

describe("moderation-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applyContentModerationTakedown hides explore posts", async () => {
    const captured: Record<string, unknown>[] = [];
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn((payload: Record<string, unknown>) => {
          captured.push(payload);
          return { eq: vi.fn(async () => ({ error: null })) };
        }),
      })),
    } as never;
    const { applyContentModerationTakedown } = await import("../moderation-actions");
    const result = await applyContentModerationTakedown(supabase, {
      targetType: "explore_post",
      targetId: "post-1",
      adminUserId: "admin-1",
      action: "hide",
    });
    expect(result.applied).toBe(true);
    expect(result.action).toBe("hide");
    expect(captured[0]?.moderated_by).toBe("admin-1");
  });

  it("system auto-hide omits moderated_by when adminUserId is null", async () => {
    const captured: Record<string, unknown>[] = [];
    const supabase = {
      from: vi.fn((table: string) => ({
        update: vi.fn((payload: Record<string, unknown>) => {
          captured.push(payload);
          return { eq: vi.fn(async () => ({ error: null })) };
        }),
        select:
          table === "explore_posts"
            ? vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      provider_id: "prov-1",
                      display_path: null,
                      media_urls: [],
                      media_meta: [],
                    },
                  })),
                })),
              }))
            : undefined,
      })),
    } as never;
    const { applyContentModerationTakedown } = await import("../moderation-actions");
    await applyContentModerationTakedown(supabase, {
      targetType: "explore_post",
      targetId: "post-1",
      adminUserId: null,
      action: "hide",
      notes: "Auto-hidden after 3 reports in 24h (system)",
    });
    expect(captured[0]?.is_hidden).toBe(true);
    expect(captured[0]).not.toHaveProperty("moderated_by");
  });

  it("maybeAutoHideReportedContent returns null below threshold", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(async () => ({ count: 1, error: null })),
              })),
            })),
          })),
        })),
      })),
    } as never;

    const { maybeAutoHideReportedContent } = await import("../moderation-actions");
    const result = await maybeAutoHideReportedContent(supabase, {
      targetType: "explore_comment",
      targetId: "c-1",
      threshold: 3,
      windowHours: 24,
    });
    expect(result).toBeNull();
  });
});
