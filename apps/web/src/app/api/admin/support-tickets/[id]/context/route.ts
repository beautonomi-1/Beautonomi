import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  handleApiError,
  requireRoleInApi,
  successResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";
import type { UserRole } from "@/types/beautonomi";
import { staffCanAccessSupportTicket } from "@/lib/support/assert-staff-ticket-access";
import { fetchSupportTicketContext, searchRequesterSupportContextRecords } from "@/lib/agents/support-context";
import { attachSupportContextToTicket } from "@/lib/support/attach-support-context";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: ticket } = await admin
      .from("support_tickets")
      .select(
        "id, user_id, provider_id, support_context_type, support_context_id, support_context_label, tenant_id",
      )
      .eq("id", id)
      .maybeSingle();

    if (!ticket) {
      return errorResponse("Ticket not found", "NOT_FOUND", 404);
    }

    const canAccess = await staffCanAccessSupportTicket(admin, {
      role: user.role,
      userId: user.id,
      tenantId: (ticket as { tenant_id?: string | null }).tenant_id,
    });
    if (!canAccess) {
      return errorResponse("Ticket not found", "NOT_FOUND", 404);
    }

    const facts = await fetchSupportTicketContext(admin, ticket);
    const searchQ = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const records = await searchRequesterSupportContextRecords(
      admin,
      {
        user_id: String(ticket.user_id),
        provider_id: (ticket as { provider_id?: string | null }).provider_id,
      },
      searchQ,
    );

    return successResponse({
      support_context_type: ticket.support_context_type,
      support_context_id: ticket.support_context_id,
      support_context_label: ticket.support_context_label,
      facts: facts?.facts ?? null,
      contextType: facts?.contextType ?? null,
      records,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load ticket context");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const { id } = await params;
    const body = (await request.json()) as {
      booking_number?: string;
      order_number?: string;
      gift_card_code?: string;
      booking_id?: string;
      order_id?: string;
    };
    const admin = getSupabaseAdmin();

    const { data: ticket } = await admin
      .from("support_tickets")
      .select("id, user_id, provider_id, tenant_id")
      .eq("id", id)
      .maybeSingle();

    if (!ticket) {
      return errorResponse("Ticket not found", "NOT_FOUND", 404);
    }

    const canAccess = await staffCanAccessSupportTicket(admin, {
      role: user.role,
      userId: user.id,
      tenantId: (ticket as { tenant_id?: string | null }).tenant_id,
    });
    if (!canAccess) {
      return errorResponse("Ticket not found", "NOT_FOUND", 404);
    }

    const attached = await attachSupportContextToTicket({
      admin,
      ticketId: id,
      ticket: { user_id: String(ticket.user_id), provider_id: ticket.provider_id },
      input: body,
    });
    if (attached.ok === false) {
      return errorResponse(attached.message, attached.code, attached.code === "NOT_FOUND" ? 404 : 400);
    }

    return successResponse({
      ticket: {
        support_context_type: attached.support_context_type,
        support_context_id: attached.support_context_id,
        support_context_label: attached.support_context_label,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to attach context");
  }
}
