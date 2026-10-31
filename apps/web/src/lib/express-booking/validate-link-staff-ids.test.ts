import { describe, expect, it, vi } from "vitest";
import { validateExpressLinkStaffIds } from "./validate-link-staff-ids";

describe("validateExpressLinkStaffIds", () => {
  it("allows empty staff list", async () => {
    const supabase = { from: vi.fn() };
    await expect(validateExpressLinkStaffIds(supabase as never, "p1", [])).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects unknown staff ids", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ data: [{ id: "a" }], error: null }),
      })),
    };
    const err = await validateExpressLinkStaffIds(supabase as never, "p1", ["a", "b"]);
    expect(err).toMatch(/not found/i);
  });

  it("rejects staff not publicly bookable", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({
          data: [
            {
              id: "a",
              is_active: true,
              is_service_provider: false,
              enable_in_online_booking: true,
              bookable_from: null,
            },
          ],
          error: null,
        }),
      })),
    };
    const err = await validateExpressLinkStaffIds(supabase as never, "p1", ["a"]);
    expect(err).toMatch(/online booking/i);
  });
});
