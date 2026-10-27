import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTryNotify = vi.fn();

vi.mock("@/lib/integrations/slack/dispatch", () => ({
  tryNotifySlackEvent: (...args: unknown[]) => mockTryNotify(...args),
}));

import { slackNotifyWalletBankRefundRequested } from "@/lib/integrations/slack/ops-triggers";
import { SLACK_EVENT_KEYS } from "@/lib/integrations/slack/event-keys";

describe("slackNotifyWalletBankRefundRequested", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTryNotify.mockResolvedValue(undefined);
  });

  it("uses wallet bank event key and deep link tab", () => {
    slackNotifyWalletBankRefundRequested({
      tenantId: "tenant-1",
      requestId: "req-1",
      requestNumber: "WBR-1",
      amountLabel: "ZAR 100",
      netLabel: "ZAR 100",
    });

    expect(mockTryNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: SLACK_EVENT_KEYS.FINANCE_WALLET_BANK_REFUND_REQUESTED,
        actionUrl: "/refunds?view=wallet_bank",
        entityId: "req-1",
      }),
    );
  });
});
