import { describe, expect, it } from "vitest";
import {
  firstResponseSlaHoursForPriority,
  computeFirstResponseDueIso,
  resolutionSlaHoursForPriority,
  computeSlaResolutionDueIso,
} from "./support-ticket-sla";

describe("firstResponseSlaHoursForPriority", () => {
  it("returns 0.5h for urgent", () => {
    expect(firstResponseSlaHoursForPriority("urgent")).toBe(0.5);
  });
  it("returns 2h for high", () => {
    expect(firstResponseSlaHoursForPriority("high")).toBe(2);
  });
  it("returns 8h for medium", () => {
    expect(firstResponseSlaHoursForPriority("medium")).toBe(8);
  });
  it("returns 24h for low", () => {
    expect(firstResponseSlaHoursForPriority("low")).toBe(24);
  });
  it("defaults to 8h for null", () => {
    expect(firstResponseSlaHoursForPriority(null)).toBe(8);
  });
  it("defaults to 8h for unknown value", () => {
    expect(firstResponseSlaHoursForPriority("critical")).toBe(8);
  });
});

describe("computeFirstResponseDueIso", () => {
  it("adds the correct window to createdAt for urgent", () => {
    const created = "2024-06-01T12:00:00.000Z";
    const due = computeFirstResponseDueIso(created, "urgent");
    const diff = new Date(due).getTime() - new Date(created).getTime();
    expect(diff).toBe(0.5 * 3600_000);
  });

  it("adds the correct window to createdAt for high", () => {
    const created = "2024-06-01T12:00:00.000Z";
    const due = computeFirstResponseDueIso(created, "high");
    const diff = new Date(due).getTime() - new Date(created).getTime();
    expect(diff).toBe(2 * 3600_000);
  });

  it("returns a valid ISO string", () => {
    const due = computeFirstResponseDueIso("2024-06-01T00:00:00.000Z", "medium");
    expect(() => new Date(due).toISOString()).not.toThrow();
  });
});

describe("resolutionSlaHoursForPriority (regression)", () => {
  it("returns 4h for urgent", () => {
    expect(resolutionSlaHoursForPriority("urgent")).toBe(4);
  });
  it("returns 72h for medium", () => {
    expect(resolutionSlaHoursForPriority("medium")).toBe(72);
  });
});

describe("computeSlaResolutionDueIso (regression)", () => {
  it("adds 72h for medium priority", () => {
    const created = "2024-06-01T00:00:00.000Z";
    const due = computeSlaResolutionDueIso(created, "medium");
    const diff = new Date(due).getTime() - new Date(created).getTime();
    expect(diff).toBe(72 * 3600_000);
  });
});
