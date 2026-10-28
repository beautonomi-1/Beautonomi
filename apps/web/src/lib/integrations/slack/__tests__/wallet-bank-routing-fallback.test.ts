import { describe, expect, it } from "vitest";
import { SLACK_EVENT_KEYS } from "@/lib/integrations/slack/event-keys";
import { __resolveSlackRouteRuleForTests } from "@/lib/integrations/slack/dispatch";

describe("wallet bank Slack routing fallback", () => {
  it("falls back to finance.refund.manual_review when wallet bank event has no channel", () => {
    const routing = {
      [SLACK_EVENT_KEYS.FINANCE_REFUND_REVIEW]: {
        enabled: true,
        channel_id: "C-refunds",
      },
    };

    const rule = __resolveSlackRouteRuleForTests(routing, SLACK_EVENT_KEYS.FINANCE_WALLET_BANK_REFUND_REQUESTED);
    expect(rule?.channel_id).toBe("C-refunds");
  });
});
