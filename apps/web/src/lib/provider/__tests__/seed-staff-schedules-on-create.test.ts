import { describe, expect, it, vi } from "vitest";
import { seedStaffSchedulesOnCreate } from "../seed-staff-schedules";

describe("seedStaffSchedulesOnCreate", () => {
  it("returns seeded false when hours source is omitted", async () => {
    const supabase = { from: vi.fn() } as never;
    const result = await seedStaffSchedulesOnCreate(supabase, "p1", "s1", null, null);
    expect(result.seeded).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns seeded false when location has no explicit working hour days", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { working_hours: {} } }),
      })),
    } as never;

    const result = await seedStaffSchedulesOnCreate(supabase, "p1", "s1", "loc-1", {
      type: "location",
      locationId: "loc-1",
    });
    expect(result.seeded).toBe(false);
  });
});
