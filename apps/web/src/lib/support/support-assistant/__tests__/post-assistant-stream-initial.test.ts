import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../turn-precheck", () => ({
  precheckSupportAssistantTurn: vi.fn(),
  assistantTurnFailureResponse: vi.fn(),
}));

vi.mock("../stream-turn", () => ({
  createSupportAssistantTextStream: vi.fn(),
}));

const mockNotify = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications/notification-service", () => ({
  resolveSupportTicketStaffRecipients: vi.fn().mockResolvedValue(["staff-1"]),
  notifySupportStaffInboxActivity: (...args: unknown[]) => mockNotify(...args),
}));

import { precheckSupportAssistantTurn } from "../turn-precheck";
import { postSupportAssistantMessageStream } from "../post-assistant-stream";

describe("postSupportAssistantMessageStream initial mode", () => {
  beforeEach(() => {
    vi.mocked(precheckSupportAssistantTurn).mockResolvedValue({
      ok: true,
      ticket: { id: "t1", handling_mode: "assistant" } as never,
      agentId: "agent-1",
    });
  });

  it("returns alreadyAnswered when latest message is from assistant", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [{ author_kind: "assistant", message: "Done" }],
        }),
      })),
    };

    const req = new NextRequest("http://localhost/stream", {
      method: "POST",
      body: JSON.stringify({ mode: "initial", message: "ignored" }),
    });

    const res = await postSupportAssistantMessageStream({
      request: req,
      ticketId: "t1",
      userId: "user-1",
      admin: admin as never,
      loadTicket: async () => ({ id: "t1", handling_mode: "assistant" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data?.alreadyAnswered).toBe(true);
  });

  it("streams for the latest customer message without inserting a duplicate", async () => {
    const { createSupportAssistantTextStream } = await import("../stream-turn");
    vi.mocked(createSupportAssistantTextStream).mockResolvedValue({
      toTextStreamResponse: () =>
        new Response("Hi there", { headers: { "Content-Type": "text/plain; charset=utf-8" } }),
    } as never);

    const insert = vi.fn();
    const admin = {
      from: vi.fn(() => ({
        insert,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [{ author_kind: "customer", message: "My booking is wrong" }],
        }),
      })),
    };

    const req = new NextRequest("http://localhost/stream", {
      method: "POST",
      body: JSON.stringify({ mode: "initial" }),
    });

    const res = await postSupportAssistantMessageStream({
      request: req,
      ticketId: "t1",
      userId: "user-1",
      admin: admin as never,
      loadTicket: async () => ({ id: "t1", handling_mode: "assistant" }),
    });

    expect(await res.text()).toBe("Hi there");
    expect(insert).not.toHaveBeenCalled();
    expect(createSupportAssistantTextStream).toHaveBeenCalledWith(
      expect.objectContaining({ userText: "My booking is wrong" }),
    );
  });

  it("saves a follow-up as a human message and notifies staff when precheck hands off", async () => {
    vi.mocked(precheckSupportAssistantTurn).mockResolvedValue({
      ok: false,
      result: { ok: false, code: "ASSISTANT_DISABLED", message: "Connecting you to support.", handoff: true },
    });
    const inserted: Record<string, unknown>[] = [];
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "support_ticket_messages") {
          return {
            insert: vi.fn((row: Record<string, unknown>) => {
              inserted.push(row);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "msg-1", created_at: "2026-01-01T00:00:00.000Z", ...row },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { ticket_number: "ST-1", assigned_to: null },
          }),
        };
      }),
    };

    const req = new NextRequest("http://localhost/stream", {
      method: "POST",
      body: JSON.stringify({ mode: "follow_up", message: "Please help still" }),
    });

    const res = await postSupportAssistantMessageStream({
      request: req,
      ticketId: "t1",
      userId: "user-1",
      admin: admin as never,
      loadTicket: async () => ({ id: "t1", handling_mode: "assistant" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data?.handoff).toBe(true);
    expect(inserted[0]).toMatchObject({
      ticket_id: "t1",
      message: "Please help still",
      author_kind: "customer",
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });
});
