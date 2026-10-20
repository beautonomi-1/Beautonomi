import { describe, expect, it, vi } from "vitest";
import { streamAssistantReply } from "@beautonomi/utils";

describe("streamAssistantReply", () => {
  it("treats 200 JSON handoff errors as success with info message", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        data: null,
        error: { message: "Connecting you to a specialist.", code: "LOCALE_ESCALATION" },
      }),
    }));
    const result = await streamAssistantReply({
      streamUrl: "/test",
      message: "hello",
      fetchFn: fetchFn as unknown as typeof fetch,
      onAssistantChunk: () => {},
    });
    expect(result.ok).toBe(true);
    expect(result.handoff).toBe(true);
    expect(result.infoMessage).toContain("specialist");
  });
});
