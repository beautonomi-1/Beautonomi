import { describe, expect, it, vi } from "vitest";
import { isUuid, resolveReportedUserId } from "../resolve-reported-user";

describe("resolve-reported-user", () => {
  it("isUuid accepts valid v4 ids", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("resolveReportedUserId returns uuid when valid", async () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const supabase = { from: vi.fn() };
    await expect(resolveReportedUserId(supabase as never, { reported_user_id: id })).resolves.toBe(id);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("resolveReportedUserId looks up handle without @ prefix", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: "user-abc" } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    await expect(
      resolveReportedUserId(supabase as never, { reported_handle: "@Jane_Doe" }),
    ).resolves.toBe("user-abc");

    expect(supabase.from).toHaveBeenCalledWith("user_profiles");
    expect(chain.eq).toHaveBeenCalledWith("handle", "jane_doe");
  });
});
