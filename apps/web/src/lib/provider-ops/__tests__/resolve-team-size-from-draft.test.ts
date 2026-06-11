import { describe, expect, it } from "vitest";
import { resolveTeamSizeFromOnboardingDraft } from "../resolve-team-size-from-draft";

describe("resolveTeamSizeFromOnboardingDraft", () => {
  it("returns explicit valid team_size from draft", () => {
    expect(
      resolveTeamSizeFromOnboardingDraft({ team_size: "medium", business_type: "salon" }),
    ).toBe("medium");
  });

  it("maps mobile business_type to freelancer when team_size missing", () => {
    expect(resolveTeamSizeFromOnboardingDraft({ business_type: "mobile" })).toBe("freelancer");
  });

  it("maps salon business_type to small when team_size missing", () => {
    expect(resolveTeamSizeFromOnboardingDraft({ business_type: "salon" })).toBe("small");
  });

  it("rejects legacy just_me and falls back from business_type", () => {
    expect(
      resolveTeamSizeFromOnboardingDraft({ team_size: "just_me", business_type: "salon" }),
    ).toBe("small");
    expect(
      resolveTeamSizeFromOnboardingDraft({ team_size: "just_me", business_type: "mobile" }),
    ).toBe("freelancer");
  });
});
