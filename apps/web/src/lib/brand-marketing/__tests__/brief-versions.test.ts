import { describe, expect, it } from "vitest";
import { diffBriefFields } from "../brief-versions";

describe("diffBriefFields", () => {
  it("lists keys whose JSON values differ", () => {
    const changed = diffBriefFields(
      { name: "A", budget_envelope: 100 },
      { name: "B", budget_envelope: 100 },
    );
    expect(changed).toEqual(["name"]);
  });

  it("diffs nested fields json keys", () => {
    const changed = diffBriefFields(
      { name: "A", fields: { podcast_show: "Show 1" } },
      { name: "A", fields: { podcast_show: "Show 2" } },
    );
    expect(changed).toEqual(["podcast_show"]);
  });
});
