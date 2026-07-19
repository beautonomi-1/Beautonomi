/**
 * Persist a CSAT rating on a resolved/closed support ticket and close the
 * ticket when it was still only "resolved" — completing the support loop.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type SubmitSupportTicketCsatInput = {
  supabase: SupabaseClient;
  ticketId: string;
  score: number;
  comment?: string | null;
  /** Attribute CSAT to the agent who owned the ticket at rating time. */
  assignedTo?: string | null;
  /**
   * Ownership filter applied on the UPDATE so RLS-bypass admin client still
   * cannot write across tenants/owners by accident.
   */
  ownership: { column: "user_id" | "provider_id"; value: string };
};

export type SubmitSupportTicketCsatResult = {
  id: string;
  status: string;
  closed_at: string | null;
  csat_score: number;
  csat_comment: string | null;
  csat_submitted_at: string;
};

export type SubmitSupportTicketCsatOutcome =
  | { ok: true; ticket: SubmitSupportTicketCsatResult; closedOnSubmit: boolean }
  | { ok: false; code: "TICKET_NOT_RESOLVED" | "UPDATE_FAILED"; message: string };

export async function submitSupportTicketCsat(
  input: SubmitSupportTicketCsatInput & { currentStatus: string },
): Promise<SubmitSupportTicketCsatOutcome> {
  const status = String(input.currentStatus ?? "");
  if (status !== "resolved" && status !== "closed") {
    return {
      ok: false,
      code: "TICKET_NOT_RESOLVED",
      message: "You can rate support after the ticket is resolved",
    };
  }

  const submittedAt = new Date().toISOString();
  const alreadyClosed = status === "closed";
  const update: Record<string, unknown> = {
    csat_score: input.score,
    csat_comment: input.comment?.trim() || null,
    csat_submitted_at: submittedAt,
    csat_agent_id: input.assignedTo ?? null,
    updated_at: submittedAt,
  };

  if (!alreadyClosed) {
    update.status = "closed";
    update.closed_at = submittedAt;
  }

  const { data, error } = await input.supabase
    .from("support_tickets")
    .update(update)
    .eq("id", input.ticketId)
    .eq(input.ownership.column, input.ownership.value)
    .select("id, status, closed_at, csat_score, csat_comment, csat_submitted_at")
    .single();

  if (error || !data) {
    return {
      ok: false,
      code: "UPDATE_FAILED",
      message: error?.message ?? "Failed to save support rating",
    };
  }

  return {
    ok: true,
    ticket: data as SubmitSupportTicketCsatResult,
    closedOnSubmit: !alreadyClosed,
  };
}
