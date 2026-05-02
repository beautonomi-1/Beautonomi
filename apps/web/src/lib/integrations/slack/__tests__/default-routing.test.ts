import { describe, expect, it } from "vitest";
import { defaultSlackRouting, mergeSlackRouting } from "../default-routing";
import { SLACK_EVENT_KEYS } from "../event-keys";

describe("Slack default routing", () => {
  it("includes every canonical operational alert disabled by default", () => {
    const routing = defaultSlackRouting();

    for (const key of Object.values(SLACK_EVENT_KEYS)) {
      expect(routing[key]).toMatchObject({
        enabled: false,
        channel_id: null,
      });
      expect(routing[key].dedupe_window_seconds).toBeGreaterThanOrEqual(60);
    }
  });

  it("preserves supported rules and drops unknown event keys", () => {
    const routing = mergeSlackRouting({
      [SLACK_EVENT_KEYS.SUPPORT_QUEUE_HEALTH]: {
        enabled: true,
        channel_id: "C123",
        channel_label: "#ops",
        dedupe_window_seconds: 120,
      },
      "unknown.event": {
        enabled: true,
        channel_id: "C999",
        dedupe_window_seconds: 120,
      },
    });

    expect(routing[SLACK_EVENT_KEYS.SUPPORT_QUEUE_HEALTH]).toEqual({
      enabled: true,
      channel_id: "C123",
      channel_label: "#ops",
      dedupe_window_seconds: 120,
    });
    expect(routing["unknown.event"]).toBeUndefined();
  });
});
