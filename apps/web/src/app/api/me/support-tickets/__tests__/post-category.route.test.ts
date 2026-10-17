import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockNotifySupportTicketCreated = vi.fn();
const mockResolveSupportTicketStaffRecipients = vi.fn();
const mockNotifySupportStaffInboxActivity = vi.fn();

const pendingAfter: Array<Promise<unknown>> = [];

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      pendingAfter.push(Promise.resolve().then(task));
    },
  };
});

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  notifySupportTicketCreated: (...args: unknown[]) => mockNotifySupportTicketCreated(...args),
  resolveSupportTicketStaffRecipients: (...args: unknown[]) => mockResolveSupportTicketStaffRecipients(...args),
  notifySupportStaffInboxActivity: (...args: unknown[]) => mockNotifySupportStaffInboxActivity(...args),
}));

vi.mock("@/workflows/start-support-triage", () => ({
  startSupportTriageForTicket: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/integrations/slack/triggers", () => ({
  slackNotifyNewSupportTicket: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/fraud/maybe-open-fraud-from-support-ticket", () => ({
  maybeOpenFraudCaseFromSafetyTicket: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/support/support-assistant/availability", () => ({
  isSupportAssistantEnabledForUser: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/support/support-assistant/run-turn", () => ({
  runSupportAssistantTurn: vi.fn().mockResolvedValue({
    ok: true,
    assistantMessage: { id: "asst-1", message: "Hi", created_at: "2026-01-01T12:00:02.000Z" },
    handoff: false,
  }),
}));

vi.mock("@/lib/support/support-assistant/handoff", () => ({
  handoffSupportTicketToHuman: vi.fn().mockResolvedValue(undefined),
}));

import { isSupportAssistantEnabledForUser } from "@/lib/support/support-assistant/availability";
import { runSupportAssistantTurn } from "@/lib/support/support-assistant/run-turn";
import { handoffSupportTicketToHuman } from "@/lib/support/support-assistant/handoff";
import { startSupportTriageForTicket } from "@/workflows/start-support-triage";
import { slackNotifyNewSupportTicket } from "@/lib/integrations/slack/triggers";

function resetModuleMocks() {
  vi.mocked(isSupportAssistantEnabledForUser).mockResolvedValue(true);
  vi.mocked(runSupportAssistantTurn).mockResolvedValue({
    ok: true,
    assistantMessage: { id: "asst-1", message: "Hi", created_at: "2026-01-01T12:00:02.000Z" },
    handoff: false,
  });
  vi.mocked(handoffSupportTicketToHuman).mockResolvedValue(undefined);
  vi.mocked(startSupportTriageForTicket).mockResolvedValue(undefined);
  vi.mocked(slackNotifyNewSupportTicket).mockResolvedValue(undefined);
}

type Captured = { ticketInsert?: Record<string, unknown>; ticketUpdates: Record<string, unknown>[] };

function buildAdminMock(captured: Captured) {
  captured.ticketUpdates = captured.ticketUpdates ?? [];
  const ticketRow = {
    id: "11111111-1111-4111-8111-111111111111",
    ticket_number: "ST-100",
    created_at: "2026-01-01T12:00:00.000Z",
  };
  const messageRow = { id: "msg-1", created_at: "2026-01-01T12:00:01.000Z" };

  return {
    from: vi.fn((table: string) => {
      if (table === "support_tickets") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            captured.ticketInsert = row;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: ticketRow, error: null }),
              }),
            };
          }),
          update: vi.fn((row: Record<string, unknown>) => {
            captured.ticketUpdates.push(row);
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === "support_ticket_messages") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: messageRow, error: null }),
            }),
          }),
        };
      }
      return {};
    }),
  };
}

describe("POST /api/me/support-tickets category", () => {
  beforeEach(() => {
    resetModuleMocks();
    pendingAfter.length = 0;
    mockRequireRoleInApi.mockClear();
    mockGetSupabaseAdmin.mockClear();
    mockResolveSupportTicketStaffRecipients.mockClear();
    mockNotifySupportTicketCreated.mockClear();
    mockNotifySupportStaffInboxActivity.mockClear();
    vi.mocked(startSupportTriageForTicket).mockClear();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", role: "customer" },
    });
    mockResolveSupportTicketStaffRecipients.mockResolvedValue([]);
    mockNotifySupportTicketCreated.mockResolvedValue(undefined);
    mockNotifySupportStaffInboxActivity.mockResolvedValue(undefined);
  });

  it("stores selectable category and derived support_context_type", async () => {
    const captured: Captured = { ticketUpdates: [] };
    mockGetSupabaseAdmin.mockReturnValue(buildAdminMock(captured));

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets", {
      method: "POST",
      body: JSON.stringify({
        subject: "Payout question",
        message: "Need help with my booking payment status please.",
        category: "payment_refund",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(captured.ticketInsert?.category).toBe("payment_refund");
    expect(captured.ticketInsert?.support_context_type).toBe("payment");
  });

  it("assistant create skips staff notify and first-response SLA", async () => {
    const captured: Captured = { ticketUpdates: [] };
    mockGetSupabaseAdmin.mockReturnValue(buildAdminMock(captured));

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets", {
      method: "POST",
      body: JSON.stringify({
        subject: "Chat help",
        message: "Need help with my booking payment status please.",
        category: "payment_refund",
        handling_mode: "assistant",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(captured.ticketInsert?.handling_mode).toBe("assistant");
    expect(
      captured.ticketUpdates.some((u) => Object.prototype.hasOwnProperty.call(u, "first_response_due_at")),
    ).toBe(false);
    expect(mockNotifySupportStaffInboxActivity).not.toHaveBeenCalled();
    await Promise.all(pendingAfter);
    const { startSupportTriageForTicket } = await import("@/workflows/start-support-triage");
    expect(startSupportTriageForTicket).not.toHaveBeenCalled();
  });

  it("returns 400 for legacy non-selectable category", async () => {
    mockGetSupabaseAdmin.mockReturnValue(buildAdminMock({}));

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets", {
      method: "POST",
      body: JSON.stringify({
        subject: "Test",
        message: "Test message body here.",
        category: "payments",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code).toBe("INVALID_CATEGORY");
  });
});
