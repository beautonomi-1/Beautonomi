import { describe, expect, it, vi } from "vitest";
import { submitSupportTicketCsat } from "../submit-support-ticket-csat";

function mockSupabase(updateResult: { data: unknown; error: unknown }) {
  const updates: Record<string, unknown>[] = [];
  const supabase = {
    from: vi.fn(() => ({
      update: vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload);
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => updateResult),
              })),
            })),
          })),
        };
      }),
    })),
  };
  return { supabase: supabase as never, updates };
}

describe("submitSupportTicketCsat", () => {
  it("persists CSAT and closes a resolved ticket", async () => {
    const submittedAt = "2026-07-19T12:00:00.000Z";
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(submittedAt);

    const { supabase, updates } = mockSupabase({
      data: {
        id: "ticket-1",
        status: "closed",
        closed_at: submittedAt,
        csat_score: 5,
        csat_comment: "Great",
        csat_submitted_at: submittedAt,
      },
      error: null,
    });

    const result = await submitSupportTicketCsat({
      supabase,
      ticketId: "ticket-1",
      score: 5,
      comment: "Great",
      assignedTo: "agent-1",
      currentStatus: "resolved",
      ownership: { column: "user_id", value: "customer-1" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.closedOnSubmit).toBe(true);
    expect(result.ticket.status).toBe("closed");
    expect(updates[0]).toMatchObject({
      csat_score: 5,
      csat_comment: "Great",
      csat_agent_id: "agent-1",
      status: "closed",
      closed_at: submittedAt,
    });
  });

  it("updates rating on an already-closed ticket without rewriting closed_at", async () => {
    const { supabase, updates } = mockSupabase({
      data: {
        id: "ticket-1",
        status: "closed",
        closed_at: "2026-07-01T00:00:00.000Z",
        csat_score: 4,
        csat_comment: null,
        csat_submitted_at: "2026-07-19T12:00:00.000Z",
      },
      error: null,
    });

    const result = await submitSupportTicketCsat({
      supabase,
      ticketId: "ticket-1",
      score: 4,
      comment: null,
      assignedTo: "agent-1",
      currentStatus: "closed",
      ownership: { column: "user_id", value: "customer-1" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.closedOnSubmit).toBe(false);
    expect(updates[0]).not.toHaveProperty("status");
    expect(updates[0]).not.toHaveProperty("closed_at");
    expect(updates[0]).toMatchObject({ csat_score: 4 });
  });

  it("rejects open tickets", async () => {
    const { supabase } = mockSupabase({ data: null, error: null });
    const result = await submitSupportTicketCsat({
      supabase,
      ticketId: "ticket-1",
      score: 5,
      currentStatus: "open",
      ownership: { column: "user_id", value: "customer-1" },
    });
    expect(result).toMatchObject({ ok: false, code: "TICKET_NOT_RESOLVED" });
  });
});
