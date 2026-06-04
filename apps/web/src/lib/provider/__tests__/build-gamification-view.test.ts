import { describe, expect, it } from "vitest";
import {
  buildBadgeLadder,
  buildProgressToNextBadge,
  resolveJoinedBadge,
} from "../build-gamification-view";

const badges = [
  { id: "b1", name: "Rising Star", tier: 1, requirements: { points: 100 } },
  { id: "b2", name: "Bronze", tier: 2, requirements: { points: 500 } },
  { id: "b3", name: "Silver", tier: 3, requirements: { points: 1500 } },
];

describe("resolveJoinedBadge", () => {
  it("returns null for empty join", () => {
    expect(resolveJoinedBadge(null)).toBeNull();
  });

  it("unwraps array join from Supabase", () => {
    expect(resolveJoinedBadge([{ id: "b1", name: "Rising Star", tier: 1 }])?.id).toBe("b1");
  });
});

describe("buildProgressToNextBadge", () => {
  it("targets next tier above current badge", () => {
    const progress = buildProgressToNextBadge(badges, badges[0], 250);
    expect(progress?.badge.id).toBe("b2");
    expect(progress?.current_points).toBe(250);
    expect(progress?.required_points).toBe(500);
    expect(progress?.points_needed).toBe(250);
    expect(progress?.progress_percentage).toBe(50);
  });

  it("returns null at top tier", () => {
    expect(buildProgressToNextBadge(badges, badges[2], 5000)).toBeNull();
  });

  it("works with no current badge (tier 0)", () => {
    const progress = buildProgressToNextBadge(badges, null, 0);
    expect(progress?.badge.id).toBe("b1");
    expect(progress?.progress_percentage).toBe(0);
  });
});

describe("buildBadgeLadder", () => {
  it("marks current, earned, next, and locked tiers", () => {
    const progress = buildProgressToNextBadge(badges, badges[1], 600);
    const ladder = buildBadgeLadder(badges, badges[1], progress);
    expect(ladder.find((b) => b.id === "b1")?.status).toBe("earned");
    expect(ladder.find((b) => b.id === "b2")?.status).toBe("current");
    expect(ladder.find((b) => b.id === "b3")?.status).toBe("next");
  });
});
