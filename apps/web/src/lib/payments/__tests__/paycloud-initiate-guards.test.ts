import { describe, expect, it } from "vitest";
import { validatePaycloudPaymentInitiate } from "../paycloud-initiate-guards";

describe("validatePaycloudPaymentInitiate", () => {
  it("rejects invoice entity type before hitting the database", async () => {
    const supabase = {} as never;
    const result = await validatePaycloudPaymentInitiate(supabase, {
      providerId: "provider-1",
      terminalId: "terminal-1",
      entityType: "invoice",
      entityId: "inv-1",
      environment: "sandbox",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_ENTITY");
    }
  });
});
