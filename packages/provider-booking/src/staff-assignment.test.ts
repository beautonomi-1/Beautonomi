import { describe, expect, it } from "vitest";
import {
  ANY_STAFF_ID,
  isAnyStaffId,
  isStaffChoiceMade,
  staffIdsForAvailabilityQuery,
} from "./staff-assignment";

describe("staff-assignment", () => {
  it("treats any and uuid as a choice", () => {
    expect(isStaffChoiceMade(ANY_STAFF_ID)).toBe(true);
    expect(isStaffChoiceMade("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isStaffChoiceMade("")).toBe(false);
    expect(isStaffChoiceMade(undefined)).toBe(false);
    expect(isAnyStaffId("any")).toBe(true);
  });

  it("strips any from availability staff_ids", () => {
    expect(
      staffIdsForAvailabilityQuery(["any", "550e8400-e29b-41d4-a716-446655440000", "", undefined]),
    ).toEqual(["550e8400-e29b-41d4-a716-446655440000"]);
  });
});
