import { describe, expect, it } from "vitest";
import { assertStrategyEditable, quarterDateRange } from "../strategy";

describe("assertStrategyEditable", () => {
  it("allows draft", () => {
    expect(assertStrategyEditable({ status: "draft" }).ok).toBe(true);
  });
  it("locks submitted", () => {
    expect(assertStrategyEditable({ status: "submitted" }).ok).toBe(false);
  });
  it("locks archived", () => {
    expect(assertStrategyEditable({ status: "draft", archived_at: "2026-01-01" }).ok).toBe(false);
  });
});

describe("quarterDateRange", () => {
  it("Q1 starts January", () => {
    const { start } = quarterDateRange(2026, 1);
    expect(start.getUTCMonth()).toBe(0);
  });
});
