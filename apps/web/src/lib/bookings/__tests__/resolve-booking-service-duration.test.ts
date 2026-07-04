import { describe, expect, it } from "vitest";
import {
  finalizeServiceStartedNotificationBody,
  formatServiceDurationForNotification,
} from "../resolve-booking-service-duration";

describe("formatServiceDurationForNotification", () => {
  it("formats sub-hour durations", () => {
    expect(formatServiceDurationForNotification(45)).toBe("45 min");
  });

  it("formats whole hours", () => {
    expect(formatServiceDurationForNotification(60)).toBe("1 hr");
    expect(formatServiceDurationForNotification(120)).toBe("2 hr");
  });

  it("formats hours and minutes", () => {
    expect(formatServiceDurationForNotification(90)).toBe("1 hr 30 min");
  });

  it("returns empty for unknown duration", () => {
    expect(formatServiceDurationForNotification(null)).toBe("");
    expect(formatServiceDurationForNotification(0)).toBe("");
  });
});

describe("finalizeServiceStartedNotificationBody", () => {
  it("keeps duration sentence when value is present", () => {
    const body =
      "Your service with Glow Salon has started. Estimated duration: 90 min.";
    expect(finalizeServiceStartedNotificationBody(body, "90 min")).toBe(body);
  });

  it("removes dangling estimated duration when value is empty", () => {
    expect(
      finalizeServiceStartedNotificationBody(
        "Your service with Glow Salon has started. Estimated duration: ",
        "",
      ),
    ).toBe("Your service with Glow Salon has started.");
  });
});
