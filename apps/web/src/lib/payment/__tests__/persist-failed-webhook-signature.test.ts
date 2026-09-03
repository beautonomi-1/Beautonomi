import { describe, expect, it, vi, beforeEach } from "vitest";
import { persistFailedWebhookSignature } from "../persist-failed-webhook-signature";

describe("persistFailedWebhookSignature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts failed signature row with incremented attempt_count", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const maybeSingle = vi.fn(async () => ({ data: { attempt_count: 2 } }));
    const eq2 = vi.fn(() => ({ maybeSingle }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn((table: string) => {
      if (table === "webhook_events") {
        return { select, upsert };
      }
      return {};
    });

    await persistFailedWebhookSignature({ from } as never, {
      source: "paystack",
      body: '{"event":"charge.success"}',
      errorMessage: "HMAC mismatch",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "paystack",
        event_type: "signature_rejected",
        status: "failed",
        attempt_count: 3,
      }),
      { onConflict: "event_id,source" },
    );
  });
});
