import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/integrations/slack/triggers", () => ({
  slackNotifyNewSupportTicket: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  extractRequestMeta: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/fraud/maybe-open-fraud-from-support-ticket", () => ({
  maybeOpenFraudCaseFromSafetyTicket: vi.fn().mockResolvedValue(undefined),
}));

import { slackNotifyNewSupportTicket } from "@/lib/integrations/slack/triggers";
import { writeAuditLog } from "@/lib/audit/audit";
import { maybeOpenFraudCaseFromSafetyTicket } from "@/lib/fraud/maybe-open-fraud-from-support-ticket";

function resetModuleMocks() {
  vi.mocked(slackNotifyNewSupportTicket).mockResolvedValue(undefined);
  vi.mocked(writeAuditLog).mockResolvedValue(undefined);
  vi.mocked(maybeOpenFraudCaseFromSafetyTicket).mockResolvedValue(undefined);
}

type Captured = { ticketInsert?: Record<string, unknown> };

function buildAdminMock(captured: Captured) {
  const ticketRow = { id: "33333333-3333-4333-8333-333333333333", created_at: "2026-01-01T12:00:00.000Z" };
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
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: ticketRow, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "support_ticket_messages") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    }),
  };
}

describe("POST /api/admin/support-tickets category", () => {
  beforeEach(() => {
    resetModuleMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "admin-1", role: "superadmin" },
    });
  });

  it("derives support_context_type from category on create", async () => {
    const captured: Captured = {};
    mockGetSupabaseAdmin.mockReturnValue(buildAdminMock(captured));

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/support-tickets", {
      method: "POST",
      body: JSON.stringify({
        subject: "Ops ticket",
        description: "Provider payout issue",
        category: "provider_payouts",
        support_context_type: "booking",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(captured.ticketInsert?.category).toBe("provider_payouts");
    expect(captured.ticketInsert?.support_context_type).toBe("payment");
  });

  it("rejects unknown category slug", async () => {
    mockGetSupabaseAdmin.mockReturnValue(buildAdminMock({}));

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/support-tickets", {
      method: "POST",
      body: JSON.stringify({
        subject: "Ops ticket",
        description: "Details",
        category: "not_in_catalog",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
