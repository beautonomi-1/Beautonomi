import { describe, it, expect } from "vitest";
import { AGENT_CRON_SCHEDULES } from "../platform-summary";

describe("platform-summary", () => {
  it("lists agent cron schedules from vercel.json contract", () => {
    const names = AGENT_CRON_SCHEDULES.map((c) => c.name);
    expect(names).toContain("agent-workforce-sweep");
    expect(names).toContain("agent-provider-ops");
    expect(names).toContain("agent-ops-sentinel");
    expect(names).toContain("agent-provider-digest");
  });
});
