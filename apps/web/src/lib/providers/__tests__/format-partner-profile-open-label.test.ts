import { describe, expect, it } from "vitest";
import { formatPartnerProfileOpenLabel } from "../format-partner-profile-open-label";

const pp = (key: string, options?: Record<string, string | number>) => {
  if (key === "openUntil") return `Open until ${options?.time}`;
  if (key === "closedOpens") return `Closed · Opens ${options?.day} ${options?.time}`;
  if (key === "closed") return "Closed";
  if (key === "dayFriday") return "Friday";
  return key;
};

describe("formatPartnerProfileOpenLabel", () => {
  const hours = {
    monday: { open: "09:00", close: "17:00", closed: false },
  };
  const mondayNoon = new Date("2026-04-20T10:00:00.000Z");

  it("returns open until when now is inside scheduled hours", () => {
    expect(
      formatPartnerProfileOpenLabel(hours, "Africa/Johannesburg", pp, mondayNoon),
    ).toBe("Open until 17:00");
  });

  it("parses hours stored as a JSON string", () => {
    expect(
      formatPartnerProfileOpenLabel(JSON.stringify(hours), "Africa/Johannesburg", pp, mondayNoon),
    ).toBe("Open until 17:00");
  });

  it("returns null without a timezone", () => {
    expect(formatPartnerProfileOpenLabel(hours, null, pp, mondayNoon)).toBeNull();
    expect(formatPartnerProfileOpenLabel(hours, "  ", pp, mondayNoon)).toBeNull();
  });

  it("returns null for an invalid timezone instead of using the device clock", () => {
    expect(
      formatPartnerProfileOpenLabel(hours, "Not/AZone", pp, mondayNoon),
    ).toBeNull();
  });

  it("returns null for empty or unparseable hours", () => {
    expect(formatPartnerProfileOpenLabel(null, "Africa/Johannesburg", pp, mondayNoon)).toBeNull();
    expect(formatPartnerProfileOpenLabel("not-json", "Africa/Johannesburg", pp, mondayNoon)).toBeNull();
    expect(formatPartnerProfileOpenLabel({}, "Africa/Johannesburg", pp, mondayNoon)).toBeNull();
  });
});
