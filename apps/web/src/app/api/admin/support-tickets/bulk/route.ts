import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import type { UserRole } from "@/types/beautonomi";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const VALID_STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const body = (await request.json()) as {
      ticket_ids?: string[];
      assigned_to?: string | null;
      status?: string;
    };

    const ticketIds = Array.isArray(body.ticket_ids)
      ? body.ticket_ids.filter((id) => typeof id === "string" && id.trim())
      : [];

    if (ticketIds.length === 0) {
      return errorResponse("ticket_ids is required", "VALIDATION_ERROR", 400);
    }

    const hasAssign = body.assigned_to !== undefined;
    const hasStatus = typeof body.status === "string" && body.status.trim();

    if (!hasAssign && !hasStatus) {
      return errorResponse("Provide assigned_to and/or status", "VALIDATION_ERROR", 400);
    }

    if (hasStatus && !(VALID_STATUSES as readonly string[]).includes(body.status!)) {
      return errorResponse("Invalid status", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (hasAssign) {
      updates.assigned_to =
        typeof body.assigned_to === "string" && body.assigned_to.trim() === ""
          ? null
          : body.assigned_to;
    }

    if (hasStatus) {
      updates.status = body.status;
      if (body.status === "resolved") {
        updates.resolved_at = new Date().toISOString();
      }
      if (body.status === "closed") {
        updates.closed_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from("support_tickets")
      .update(updates)
      .in("id", ticketIds)
      .select("id");

    if (error) throw error;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.support_tickets.bulk_update",
      entity_type: "support_ticket",
      entity_id: ticketIds[0],
      module: "support",
      risk_level: "low",
      retention_tier: "routine",
      metadata: {
        ticket_ids: ticketIds,
        assigned_to: body.assigned_to,
        status: body.status,
        updated_count: data?.length ?? 0,
      },
      ...extractRequestMeta(request),
    });

    return NextResponse.json({
      updated: data?.length ?? 0,
      ticket_ids: ticketIds,
    });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to bulk update support tickets");
  }
}
