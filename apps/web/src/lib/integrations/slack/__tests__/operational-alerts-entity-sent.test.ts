import { describe, expect, it, vi } from "vitest";
import { __slackEntityAlreadySentForTests } from "@/lib/integrations/slack/operational-alerts";

describe("slackEntityAlreadySent", () => {
  it("returns true when a sent delivery log exists for the entity", async () => {
    const terminal = vi.fn().mockResolvedValue({ count: 1, error: null });
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => terminal());
    chain.eq = vi.fn((col: string) => {
      if (col === "tenant_id") return terminal();
      return chain;
    });

    const supabase = { from: vi.fn(() => chain) };

    const sent = await __slackEntityAlreadySentForTests(
      supabase as never,
      "tenant-1",
      "req-abc",
    );
    expect(sent).toBe(true);
  });
});
