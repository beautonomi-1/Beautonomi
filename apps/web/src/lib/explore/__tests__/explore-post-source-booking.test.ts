import { describe, expect, it } from "vitest";
import {
  explorePostSourceBookingIdForInsert,
  pickLinkedExplorePostForBooking,
} from "../explore-post-source-booking";

describe("explorePostSourceBookingIdForInsert", () => {
  it("stores validated booking id on draft and publish", () => {
    expect(explorePostSourceBookingIdForInsert("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("stores null when booking id missing", () => {
    expect(explorePostSourceBookingIdForInsert(null)).toBeNull();
    expect(explorePostSourceBookingIdForInsert(undefined)).toBeNull();
    expect(explorePostSourceBookingIdForInsert("")).toBeNull();
  });
});

describe("pickLinkedExplorePostForBooking", () => {
  it("prefers published over newer draft", () => {
    const picked = pickLinkedExplorePostForBooking([
      { id: "draft-new", status: "draft", created_at: "2026-01-02T00:00:00Z" },
      { id: "pub-old", status: "published", created_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(picked).toEqual({ id: "pub-old", status: "published" });
  });
});
