import {
  routeForProfileCompletionItem,
  firstIncompleteRequiredRoute,
} from "@/lib/profile-completion-routes";

describe("routeForProfileCompletionItem", () => {
  it("routes beauty_preferences to profile-details (same screen as bio/interests)", () => {
    expect(routeForProfileCompletionItem("beauty_preferences")).toBe(
      "/(app)/account-settings/profile-details",
    );
  });
});

describe("firstIncompleteRequiredRoute", () => {
  it("returns route for first incomplete required item", () => {
    expect(
      firstIncompleteRequiredRoute([
        { id: "photo", completed: true, required: true },
        { id: "beauty_preferences", completed: false, required: true },
      ]),
    ).toBe("/(app)/account-settings/profile-details");
  });
});
