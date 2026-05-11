import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { errorResponse, handleApiError, requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";

const csatSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const parsed = csatSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Score must be between 1 and 5", "VALIDATION_ERROR", 400);
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, user_id, status, assigned_to")
      .eq("id", id)
      .single();

    if (ticketError || !ticket) return errorResponse("Ticket not found", "NOT_FOUND", 404);
    if (ticket.user_id !== user.id) {
      return errorResponse("You can only rate your own support tickets", "FORBIDDEN", 403);
    }

    const status = String(ticket.status ?? "");
    if (status !== "resolved" && status !== "closed") {
      return errorResponse("You can rate support after the ticket is resolved", "TICKET_NOT_RESOLVED", 409);
    }

    const submittedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("support_tickets")
      .update({
        csat_score: parsed.data.score,
        csat_comment: parsed.data.comment?.trim() || null,
        csat_submitted_at: submittedAt,
        csat_agent_id: ticket.assigned_to ?? null,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, csat_score, csat_comment, csat_submitted_at")
      .single();

    if (error) throw error;

    return successResponse({ ticket: data });
  } catch (error) {
    return handleApiError(error, "Failed to submit support rating");
  }
}
