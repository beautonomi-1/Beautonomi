import { beforeEach, describe, expect, it, vi } from "vitest";

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
    const supabase = makeSupabase();
    const { applyContentModerationTakedown } = await import("../moderation-actions");
    const result = await applyContentModerationTakedown(supabase, {
      targetType: "explore_post",
      targetId: "post-1",
      adminUserId: "admin-1",
      action: "hide",
    });
    expect(result.applied).toBe(true);
    expect(result.action).toBe("hide");
    expect(supabase.from).toHaveBeenCalledWith("explore_posts");
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
