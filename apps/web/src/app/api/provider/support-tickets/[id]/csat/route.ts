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
import { submitSupportTicketCsat } from "@/lib/support/submit-support-ticket-csat";

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

    const providerId = access.ticket.provider_id;
    if (!providerId) {
      return errorResponse("Ticket has no provider scope", "FORBIDDEN", 403);
    }

    const result = await submitSupportTicketCsat({
      supabase: admin,
      ticketId: id,
      score: parsed.data.score,
      comment: parsed.data.comment,
      assignedTo: access.ticket.assigned_to ?? null,
      currentStatus: String(access.ticket.status ?? ""),
      ownership: { column: "provider_id", value: providerId },
    });

    if (!result.ok) {
      if (result.code === "TICKET_NOT_RESOLVED") {
        return errorResponse(result.message, "TICKET_NOT_RESOLVED", 409);
      }
      throw new Error(result.message);
    }

    return successResponse({ ticket: result.ticket, closedOnSubmit: result.closedOnSubmit });
  } catch (error) {
    return handleApiError(error, "Failed to submit provider support rating");
  }
}
