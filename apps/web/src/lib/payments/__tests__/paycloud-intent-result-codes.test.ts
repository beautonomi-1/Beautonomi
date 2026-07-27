import { describe, expect, it } from "vitest";
import {
  humanizePaycloudIntentResult,
  isPaycloudIntentResultApproved,
} from "../paycloud-intent-result-codes";

describe("paycloud-intent-result-codes", () => {
  it("maps known result codes", () => {
    expect(humanizePaycloudIntentResult("K026")).toMatch(/cancelled/i);
    expect(humanizePaycloudIntentResult("M016")).toMatch(/duplicate/i);
  });

  it("treats 00 as approved", () => {
    expect(isPaycloudIntentResultApproved("00")).toBe(true);
    expect(isPaycloudIntentResultApproved("K026")).toBe(false);
  });
});
