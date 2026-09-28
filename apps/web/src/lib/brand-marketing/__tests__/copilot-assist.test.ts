import { describe, expect, it } from "vitest";
import { runBriefCopilotAssist } from "../copilot-assist";

describe("runBriefCopilotAssist", () => {
  it("returns ai_assisted suggestions", () => {
    const r = runBriefCopilotAssist({ kind: "tighten_proposition", proposition: "One. Two." });
    expect(r.ai_assisted).toBe(true);
    expect(r.text.length).toBeGreaterThan(0);
  });
});
