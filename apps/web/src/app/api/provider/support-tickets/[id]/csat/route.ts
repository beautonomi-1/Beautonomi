import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requireProviderSupportTicketAccess } from "@/lib/support/provider-support-ticket-access";

const csatSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id } = await params;
    const parsed = csatSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Score must be between 1 and 5", "VALIDATION_ERROR", 400);
    }

    const admin = getSupabaseAdmin();
    const access = await requireProviderSupportTicketAccess<{
      id: string;
      provider_id: string | null;
      requester_type: string | null;
      status?: string | null;
      assigned_to?: string | null;
    }>(admin, user.id, id, "id, provider_id, requester_type, status, assigned_to");
    if (access.response) return access.response;

    const status = String(access.ticket.status ?? "");
    if (status !== "resolved" && status !== "closed") {
      return errorResponse("You can rate support after the ticket is resolved", "TICKET_NOT_RESOLVED", 409);
    }

    const submittedAt = new Date().toISOString();
    const { data, error } = await admin
      .from("support_tickets")
      .update({
        csat_score: parsed.data.score,
        csat_comment: parsed.data.comment?.trim() || null,
        csat_submitted_at: submittedAt,
        csat_agent_id: access.ticket.assigned_to ?? null,
      })
      .eq("id", id)
      .eq("provider_id", access.ticket.provider_id)
      .select("id, csat_score, csat_comment, csat_submitted_at")
      .single();

    if (error) throw error;

    return successResponse({ ticket: data });
  } catch (error) {
    return handleApiError(error, "Failed to submit provider support rating");
  }
}
