import { describe, expect, it, vi } from "vitest";
import { resolveWalkInStaffId } from "../resolve-walk-in-staff-id";

function staffLookup(result: { id: string } | null) {
  return {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: result }),
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: result }),
                }),
              }),
            }),
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: result }),
              }),
            }),
          }),
        }),
      }),
    })),
  };
}

describe("resolveWalkInStaffId", () => {
  it("never returns a raw users.id when the explicit id is not on the provider", async () => {
    const admin = staffLookup(null);
    const result = await resolveWalkInStaffId(
      admin as never,
      "prov-1",
      "user-1",
      "user-1",
    );
    expect(result).toBeNull();
  });

  it("returns the matching provider_staff.id for an explicit staff row", async () => {
    const admin = staffLookup({ id: "staff-9" });
    const result = await resolveWalkInStaffId(
      admin as never,
      "prov-1",
      "user-1",
      "staff-9",
    );
    expect(result).toBe("staff-9");
  });
});
