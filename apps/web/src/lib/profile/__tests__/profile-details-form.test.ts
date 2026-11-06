import { describe, expect, it } from "vitest";
import {
  PROFILE_QUESTION_FIELDS,
  buildBeautyPreferencesPatch,
  buildProfileDataPatch,
  countAnsweredQuestions,
  profileDetailsFormFromApi,
} from "../profile-details-form";

describe("profile-details-form", () => {
  const profile = { about: "Hi", school: "UCT", pets: "Cat", interests: ["Hair"], languages: ["en"], avatar_url: "x" };
  const beauty = { hair_type: "Curly", things_to_avoid: "Sulfates, Latex", allergies: ["Nickel"] };

  it("covers the 11 completion question keys", () => {
    expect(PROFILE_QUESTION_FIELDS.map((f) => f.key)).toEqual([
      "school", "work", "location", "decade_born", "favorite_song", "obsessed_with",
      "fun_fact", "useless_skill", "biography_title", "spend_time", "pets",
    ]);
  });

  it("sends nothing when nothing changed", () => {
    const initial = profileDetailsFormFromApi(profile, beauty);
    const current = profileDetailsFormFromApi(profile, beauty);
    expect(buildProfileDataPatch(initial, current)).toEqual({});
    expect(buildBeautyPreferencesPatch(initial, current)).toEqual({});
  });

  it("sends only edited keys, including cleared answers, and never avatar or languages", () => {
    const initial = profileDetailsFormFromApi(profile, beauty);
    const current = profileDetailsFormFromApi(profile, beauty);
    current.questions.work = "  Stylist ";
    current.questions.pets = "";
    current.interests = ["Hair", "Nails"];
    expect(buildProfileDataPatch(initial, current)).toEqual({
      work: "Stylist",
      pets: "",
      interests: ["Hair", "Nails"],
    });
  });

  it("keeps comma-string shape for things to avoid and product preferences", () => {
    const initial = profileDetailsFormFromApi(profile, beauty);
    expect(initial.thingsToAvoid).toEqual(["Sulfates", "Latex"]);
    const current = { ...initial, thingsToAvoid: ["Sulfates"], skinType: "Dry" };
    expect(buildBeautyPreferencesPatch(initial, current)).toEqual({ skin_type: "Dry", things_to_avoid: "Sulfates" });
  });

  it("counts answered questions", () => {
    expect(countAnsweredQuestions(profileDetailsFormFromApi(profile, beauty))).toBe(2);
  });
});
