import { beforeEach, describe, expect, it, vi } from "vitest";
import { SLACK_EVENT_KEYS } from "../event-keys";

const mockGetSupabaseAdmin = vi.fn();
const mockSlackPost = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/integrations/slack/slack-api", () => ({
  slackChatPostMessage: (...args: unknown[]) => mockSlackPost(...args),
}));

vi.mock("@/lib/integrations/resend", () => ({
  sendResendEmail: vi.fn(),
}));

import { tryNotifySlackEvent } from "../dispatch";

function makeDedupeChain() {
  const terminal = {
    is: () => terminal,
    eq: () => terminal,
    maybeSingle: async () => ({ data: null }),
  };
  const chain: Record<string, unknown> = {
    eq: () => chain,
    is: () => chain,
    gte: () => chain,
    limit: () => terminal,
  };
  return chain;
}

function makeSlackMocks() {
  const isCalls: Array<[string, null]> = [];
  const insertPayloads: Array<Record<string, unknown>> = [];

  mockGetSupabaseAdmin.mockReturnValue({
    from: (table: string) => {
      if (table === "slack_integration_config") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            is: (col: string, val: null) => {
              isCalls.push([col, val]);
              return {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      enabled: true,
                      bot_token_secret: "xoxb-test",
                      routing: {
                        [SLACK_EVENT_KEYS.AGENT_EMERGENCY_ACTIVATED]: {
                          enabled: true,
                          channel_id: "C123",
                        },
                      },
                    },
                    error: null,
                  }),
                }),
              };
            },
          }),
        };
      }
      if (table === "slack_delivery_logs") {
        return {
          select: () => makeDedupeChain(),
          insert: async (row: Record<string, unknown>) => {
            insertPayloads.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  });

  return { isCalls, insertPayloads };
}

describe("tryNotifySlackEvent platform scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSlackPost.mockResolvedValue({ ok: true, ts: "123.456" });
  });

  it("loads global config with tenant_id IS NULL and logs delivery with null tenant", async () => {
    const { isCalls, insertPayloads } = makeSlackMocks();

    await tryNotifySlackEvent({
      tenantId: null,
      environment: "production",
      eventKey: SLACK_EVENT_KEYS.AGENT_EMERGENCY_ACTIVATED,
      dedupeKey: "emergency:1",
      entityType: "agent_emergency",
      entityId: "1",
      title: "Emergency activated",
      detailLines: ["freeze proposals"],
      actionUrl: "/admin/control-plane/modules/agents",
    });

    expect(isCalls.some(([col, val]) => col === "tenant_id" && val === null)).toBe(true);
    expect(mockSlackPost).toHaveBeenCalled();
    expect(insertPayloads.some((row) => row.tenant_id === null && row.status === "sent")).toBe(true);
  });

  it("normalizes literal platform tenant id to null", async () => {
    const { insertPayloads } = makeSlackMocks();

    await tryNotifySlackEvent({
      tenantId: "platform" as unknown as null,
      environment: "production",
      eventKey: SLACK_EVENT_KEYS.AGENT_EMERGENCY_ACTIVATED,
      dedupeKey: "emergency:platform",
      entityType: "agent_emergency",
      entityId: "2",
      title: "Emergency",
      detailLines: [],
      actionUrl: "/admin/control-plane/modules/agents",
    });

    expect(insertPayloads.some((row) => row.tenant_id === null)).toBe(true);
  });
});
