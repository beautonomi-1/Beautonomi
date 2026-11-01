import { describe, expect, it } from "vitest";
import { addStaffSchema } from "../route";

describe("addStaffSchema", () => {
  it("defaults invite_email to false when omitted", () => {
    const parsed = addStaffSchema.parse({
      email: "stylist@example.com",
    });
    expect(parsed.invite_email).toBe(false);
  });

  it("accepts job and hours_source without requiring role", () => {
    const parsed = addStaffSchema.parse({
      email: "a@example.com",
      job: "stylist",
      invite_email: true,
      hours_source: { type: "location", location_id: "550e8400-e29b-41d4-a716-446655440000" },
    });
    expect(parsed.job).toBe("stylist");
    expect(parsed.hours_source?.type).toBe("location");
  });

  it("does not require hours_source", () => {
    const parsed = addStaffSchema.parse({
      email: "a@example.com",
      name: "Alex",
    });
    expect(parsed.hours_source).toBeUndefined();
  });

  it("accepts avatar_url when a valid https URL", () => {
    const parsed = addStaffSchema.parse({
      email: "a@example.com",
      avatar_url: "https://cdn.example.com/avatars/staff.jpg",
    });
    expect(parsed.avatar_url).toBe("https://cdn.example.com/avatars/staff.jpg");
  });

  it("rejects avatar_url when not a URL", () => {
    const result = addStaffSchema.safeParse({
      email: "a@example.com",
      avatar_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});
