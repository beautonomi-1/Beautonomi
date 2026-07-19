import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { errorResponse, handleApiError, requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";
import { submitSupportTicketCsat } from "@/lib/support/submit-support-ticket-csat";

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
    const parsed = csatSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Score must be between 1 and 5", "VALIDATION_ERROR", 400);
    }

    // Ticket owners are not granted UPDATE on support_tickets under RLS (only staff roles are).
    // After role + ownership checks, persist CSAT via service role so the mutation cannot be blocked by RLS.
    const admin = getSupabaseAdmin();
    const { data: ticket, error: ticketError } = await admin
      .from("support_tickets")
      .select("id, user_id, status, assigned_to")
      .eq("id", id)
      .single();

    if (ticketError || !ticket) return errorResponse("Ticket not found", "NOT_FOUND", 404);
    if (ticket.user_id !== user.id) {
      return errorResponse("You can only rate your own support tickets", "FORBIDDEN", 403);
    }

    const result = await submitSupportTicketCsat({
      supabase: admin,
      ticketId: id,
      score: parsed.data.score,
      comment: parsed.data.comment,
      assignedTo: ticket.assigned_to ?? null,
      currentStatus: String(ticket.status ?? ""),
      ownership: { column: "user_id", value: user.id },
    });

    if (!result.ok) {
      if (result.code === "TICKET_NOT_RESOLVED") {
        return errorResponse(result.message, "TICKET_NOT_RESOLVED", 409);
      }
      throw new Error(result.message);
    }

    return successResponse({ ticket: result.ticket, closedOnSubmit: result.closedOnSubmit });
  } catch (error) {
    return handleApiError(error, "Failed to submit support rating");
  }
}
