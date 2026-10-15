import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, errorResponse, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import type { UserRole } from "@/types/beautonomi";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";

/**
 * POST /api/admin/support-tickets/[id]/seen
 *
 * Stamps `last_staff_view_at = now()` on the ticket so the agent-unread
 * indicator clears after the agent opens the detail view.
 * Mirrors the customer-side route at /api/me/support-tickets/[id]/seen.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, tenant_id")
      .eq("id", id)
      .maybeSingle();

    if (ticketError || !ticket) {
      return errorResponse("Ticket not found", "NOT_FOUND", 404);
    }

    const { staffCanAccessSupportTicket } = await import("@/lib/support/assert-staff-ticket-access");
    const ok = await staffCanAccessSupportTicket(supabase, {
      role: user.role,
      userId: user.id,
      tenantId: (ticket as { tenant_id?: string | null }).tenant_id,
    });
    if (!ok) {
      return errorResponse("Ticket not found", "NOT_FOUND", 404);
    }

    const seenAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({ last_staff_view_at: seenAt })
      .eq("id", id);

    if (updateError) throw updateError;

    return successResponse({ seen_at: seenAt });
  } catch (error) {
    return handleApiError(error, "Failed to mark support ticket as seen by staff");
  }
}
