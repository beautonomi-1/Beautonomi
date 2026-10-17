import type { SupabaseClient } from "@supabase/supabase-js";
import { classifySupportTicketHeuristically } from "@/lib/agents/workflows/support-agent";

export async function resolveSupportTicketViaAssistant(params: {
  admin: SupabaseClient;
  ticketId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const { data: ticket } = await params.admin
    .from("support_tickets")
    .select("id, user_id, handling_mode, status, subject, description, priority, category")
    .eq("id", params.ticketId)
    .maybeSingle();

  if (!ticket || ticket.user_id !== params.userId) {
    return { ok: false, code: "NOT_FOUND", message: "Ticket not found" };
  }
  if (String(ticket.handling_mode ?? "human") !== "assistant") {
    return { ok: false, code: "NOT_ASSISTANT", message: "Ticket is not in assistant mode" };
  }

  const heuristic = classifySupportTicketHeuristically({
    subject: String(ticket.subject ?? ""),
    description: String(ticket.description ?? ""),
    priority: ticket.priority as string | null,
    category: ticket.category as string | null,
  });
  if (heuristic.needsHuman) {
    return { ok: false, code: "NEEDS_HUMAN", message: "A specialist must review this ticket" };
  }

  const { data: existing } = await params.admin
    .from("support_tickets")
    .select("metadata")
    .eq("id", params.ticketId)
    .maybeSingle();
  const meta =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? { ...(existing.metadata as Record<string, unknown>) }
      : {};
  meta.assistant_involved = true;

  const now = new Date().toISOString();
  await params.admin
    .from("support_tickets")
    .update({
      status: "resolved",
      resolved_at: now,
      updated_at: now,
      metadata: meta,
    })
    .eq("id", params.ticketId);

  return { ok: true };
}
