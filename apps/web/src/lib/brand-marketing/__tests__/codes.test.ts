import { describe, expect, it } from "vitest";
import { codesForRollup, isSubCode, suggestTrackingCode } from "../codes";

describe("brand tracking codes", () => {
  it("suggests code with market slug", () => {
    expect(suggestTrackingCode("Summer Launch", "za")).toBe("summer-launch-za");
  });

  it("rolls up sub-codes", () => {
    expect(isSubCode("summer-za", "summer-za__google")).toBe(true);
    expect(codesForRollup("summer-za", ["summer-za__google", "other"])).toEqual([
      "summer-za",
      "summer-za__google",
    ]);
  });
});
