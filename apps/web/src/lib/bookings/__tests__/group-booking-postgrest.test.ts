import { describe, expect, it } from "vitest";
import {
  ADMIN_GROUP_DETAIL_SELECT,
  GROUP_CHILD_BOOKINGS_REL,
  ME_GROUP_DETAIL_SELECT,
  PROVIDER_GROUP_DETAIL_SELECT,
  groupChildBookingsEmbed,
} from "../group-booking-postgrest";

describe("group-booking-postgrest", () => {
  it("disambiguates child bookings with bookings_group_booking_id_fkey", () => {
    const embed = groupChildBookingsEmbed("id");
    expect(embed).toContain(GROUP_CHILD_BOOKINGS_REL);
    expect(embed).not.toMatch(/bookings:bookings\(/);
  });

  it("provider and me detail selects use disambiguated child bookings", () => {
    expect(PROVIDER_GROUP_DETAIL_SELECT).toContain(GROUP_CHILD_BOOKINGS_REL);
    expect(ME_GROUP_DETAIL_SELECT).toContain(GROUP_CHILD_BOOKINGS_REL);
    expect(PROVIDER_GROUP_DETAIL_SELECT).not.toMatch(/bookings:bookings\(/);
    expect(ME_GROUP_DETAIL_SELECT).not.toMatch(/bookings:bookings\(/);
  });

  it("admin detail select omits ambiguous child bookings embed", () => {
    expect(ADMIN_GROUP_DETAIL_SELECT).not.toMatch(/bookings:bookings\(/);
    expect(ADMIN_GROUP_DETAIL_SELECT).toContain("booking_participants");
  });
});
