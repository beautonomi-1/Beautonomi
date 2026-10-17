import { describe, expect, it } from "vitest";
import { assistantTurnFailureResponse } from "../turn-precheck";

describe("assistantTurnFailureResponse", () => {
  it("maps IN_FLIGHT to 429", async () => {
    const res = assistantTurnFailureResponse({
      ok: false,
      code: "IN_FLIGHT",
      message: "wait",
    });
    expect(res.status).toBe(429);
  });

  it("maps handoff failures to 200", async () => {
    const res = assistantTurnFailureResponse({
      ok: false,
      code: "LOCALE_ESCALATION",
      message: "specialist",
      handoff: true,
    });
    expect(res.status).toBe(200);
  });
});
