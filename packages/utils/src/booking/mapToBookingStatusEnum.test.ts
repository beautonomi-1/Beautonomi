import { describe, expect, it } from "vitest";
import { mapToBookingStatusEnum } from "./mapToBookingStatusEnum";

describe("mapToBookingStatusEnum", () => {
  it("maps portal aliases to DB enum", () => {
    expect(mapToBookingStatusEnum("booked")).toBe("confirmed");
    expect(mapToBookingStatusEnum("started")).toBe("in_progress");
  });

  it("passes through valid enum literals", () => {
    expect(mapToBookingStatusEnum("pending")).toBe("pending");
    expect(mapToBookingStatusEnum("confirmed")).toBe("confirmed");
    expect(mapToBookingStatusEnum("checked_in")).toBe("checked_in");
  });

  it("maps invalid values (e.g. payment leaked labels) to pending", () => {
    expect(mapToBookingStatusEnum("failed")).toBe("pending");
    expect(mapToBookingStatusEnum("paid")).toBe("pending");
    expect(mapToBookingStatusEnum("")).toBe("pending");
    expect(mapToBookingStatusEnum(null)).toBe("pending");
  });
});
