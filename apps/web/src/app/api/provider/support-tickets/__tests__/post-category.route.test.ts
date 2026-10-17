import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockNotifySupportTicketCreated = vi.fn();
const mockResolveSupportTicketStaffRecipients = vi.fn();
const mockNotifySupportStaffInboxActivity = vi.fn();

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      void Promise.resolve().then(task);
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

vi.mock("@/lib/integrations/slack/triggers", () => ({
  slackNotifyNewSupportTicket: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/fraud/maybe-open-fraud-from-support-ticket", () => ({
  maybeOpenFraudCaseFromSafetyTicket: vi.fn().mockResolvedValue(undefined),
}));

import { slackNotifyNewSupportTicket } from "@/lib/integrations/slack/triggers";
import { maybeOpenFraudCaseFromSafetyTicket } from "@/lib/fraud/maybe-open-fraud-from-support-ticket";

function resetModuleMocks() {
  vi.mocked(slackNotifyNewSupportTicket).mockResolvedValue(undefined);
  vi.mocked(maybeOpenFraudCaseFromSafetyTicket).mockResolvedValue(undefined);
}

type Captured = { ticketInsert?: Record<string, unknown> };

function buildAdminMock(captured: Captured) {
  const ticketRow = {
    id: "22222222-2222-4222-8222-222222222222",
    ticket_number: "ST-200",
    created_at: "2026-01-01T12:00:00.000Z",
  };
  const messageRow = { id: "msg-2", created_at: "2026-01-01T12:00:01.000Z" };

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
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
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

describe("POST /api/provider/support-tickets category", () => {
  beforeEach(() => {
    resetModuleMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "provider-user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue("44444444-4444-4444-8444-444444444444");
    mockResolveSupportTicketStaffRecipients.mockResolvedValue([]);
    mockNotifySupportTicketCreated.mockResolvedValue(undefined);
    mockNotifySupportStaffInboxActivity.mockResolvedValue(undefined);
  });

  it("stores terminal_onboarding and payment context", async () => {
    const captured: Captured = {};
    mockGetSupabaseAdmin.mockReturnValue(buildAdminMock(captured));

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/support-tickets", {
      method: "POST",
      body: JSON.stringify({
        subject: "Terminal setup",
        message: "Need help activating my card terminal device.",
        category: "terminal_onboarding",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(captured.ticketInsert?.category).toBe("terminal_onboarding");
    expect(captured.ticketInsert?.support_context_type).toBe("payment");
    expect(captured.ticketInsert?.requester_type).toBe("provider");
  });
});
