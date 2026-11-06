import { describe, expect, it } from "vitest";
import {
  firstIncompleteRequiredItemId,
  getCompletionHref,
  isPersonalInfoFocusParam,
} from "../completion-deeplinks";
import { PROFILE_DETAILS_SECTION_IDS } from "../profile-details-form";

describe("getCompletionHref", () => {
  it("sends personal fields to personal-info, where the focus reader is mounted", () => {
    for (const [id, focus] of [
      ["email", "email"],
      ["preferred_name", "preferredName"],
      ["identity", "identity"],
      ["phone", "phone"],
      ["address", "address"],
      ["emergency_contact", "emergencyContact"],
    ] as const) {
      const href = getCompletionHref(id);
      expect(href).toBe(`/account-settings/personal-info?focus=${focus}#personal-info-section`);
      expect(isPersonalInfoFocusParam(focus)).toBe(true);
    }
    expect(getCompletionHref("photo")).toBe("/account-settings/personal-info#photo");
  });

  it("sends date of birth to age assurance", () => {
    expect(getCompletionHref("date_of_birth")).toBe("/account-settings/age-assurance");
  });

  it("sends bio, questions, interests, and beauty preferences to real profile-details sections", () => {
    const hrefs = ["bio", "profile_questions", "interests", "beauty_preferences"].map(getCompletionHref);
    for (const href of hrefs) {
      const [path, hash] = href.split("#");
      expect(path).toBe("/account-settings/profile-details");
      expect(PROFILE_DETAILS_SECTION_IDS).toContain(hash);
    }
  });

  it("picks the first incomplete required item, skipping optional ones", () => {
    expect(
      firstIncompleteRequiredItemId([
        { id: "photo", completed: false, required: false },
        { id: "email", completed: true, required: true },
        { id: "date_of_birth", completed: false, required: true },
        { id: "phone", completed: false, required: true },
      ]),
    ).toBe("date_of_birth");
    expect(firstIncompleteRequiredItemId([{ id: "bio", completed: false, required: false }])).toBeNull();
    expect(firstIncompleteRequiredItemId(undefined)).toBeNull();
  });

  it("never points at a bare hub hash", () => {
    for (const id of ["photo", "email", "bio", "beauty_preferences", "date_of_birth"]) {
      expect(getCompletionHref(id).startsWith("/account-settings#")).toBe(false);
      expect(getCompletionHref(id).startsWith("/account-settings?")).toBe(false);
    }
    expect(getCompletionHref("unknown")).toBe("/account-settings");
  });
});
