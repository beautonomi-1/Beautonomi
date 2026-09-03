import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/resend", () => ({
  sendResendEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendResendEmail } from "@/lib/integrations/resend";
import {
  __resetSlackFallbackStateForTests,
  maybeSendSlackFallbackEmail,
  SLACK_EMAIL_FALLBACK_AFTER_FAILURES,
} from "../dispatch";

const sendResendEmailMock = vi.mocked(sendResendEmail);

function mockSupabase(statuses: string[] = []) {
  const limit = vi.fn().mockResolvedValue({
    data: statuses.map((status) => ({ status })),
  });
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit,
  };
  return {
    from: vi.fn(() => chain),
    __chain: chain,
  };
}

const params = {
  tenantId: "tenant-1",
  environment: "test",
  eventKey: "ops.cron.failed",
  dedupeKey: "cron:x",
  title: "Cron failed",
  detailLines: ["job=expire-ads"],
  actionUrl: "/ops/cron-runs",
  slackError: "channel_not_found",
};

describe("Slack email fallback", () => {
  const prev = process.env.OPS_ALERT_EMAIL;

  beforeEach(() => {
    __resetSlackFallbackStateForTests();
    sendResendEmailMock.mockClear();
    process.env.OPS_ALERT_EMAIL = "ops@example.com";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.OPS_ALERT_EMAIL;
    else process.env.OPS_ALERT_EMAIL = prev;
  });

  it("requires two consecutive failures before emailing", async () => {
    const supabase = mockSupabase([]) as never;
    expect(SLACK_EMAIL_FALLBACK_AFTER_FAILURES).toBe(2);

    const first = await maybeSendSlackFallbackEmail(supabase, params);
    expect(first).toBe(false);
    expect(sendResendEmailMock).not.toHaveBeenCalled();

    const second = await maybeSendSlackFallbackEmail(supabase, params);
    expect(second).toBe(true);
    expect(sendResendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendResendEmailMock.mock.calls[0]?.[0]).toMatchObject({
      to: "ops@example.com",
      subject: expect.stringContaining("Slack alert undelivered"),
    });
  });

  it("does not email when OPS_ALERT_EMAIL is unset", async () => {
    delete process.env.OPS_ALERT_EMAIL;
    const supabase = mockSupabase(["failed", "failed"]) as never;
    const sent = await maybeSendSlackFallbackEmail(supabase, params);
    expect(sent).toBe(false);
    expect(sendResendEmailMock).not.toHaveBeenCalled();
  });
});
