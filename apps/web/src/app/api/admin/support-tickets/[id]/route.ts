import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import type { UserRole } from "@/types/beautonomi";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";
import { notifySupportTicketUpdated, notifySupportStaffInboxActivity } from "@/lib/notifications/notification-service";
import { computeSlaResolutionDueIso } from "@/lib/support/support-ticket-sla";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { slackNotifySupportTicketUpdated } from "@/lib/integrations/slack/triggers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const supabase = getSupabaseAdmin();

    const { id } = await params;

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .select(`
        *,
        user:users!support_tickets_user_id_fkey(id, email, full_name, phone, role, created_at),
        provider:providers(id, business_name, email, phone, status, user_id, created_at),
        assigned_user:users!support_tickets_assigned_to_fkey(id, email, full_name)
      `)
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Get messages
    const { data: messages } = await supabase
      .from("support_ticket_messages")
      .select(`
        *,
        user:users!support_ticket_messages_user_id_fkey(id, email, full_name)
      `)
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    // Get notes (only for admins/agents)
    const { data: notes } = await supabase
      .from("support_ticket_notes")
      .select(`
        *,
        user:users!support_ticket_notes_user_id_fkey(id, email, full_name)
      `)
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      ticket,
      messages: messages || [],
      notes: notes || [],
    });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to fetch support ticket");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const supabase = getSupabaseAdmin();

    const { id } = await params;

    const body = await request.json();
    const {
      status,
      priority,
      assigned_to,
      tags,
      category,
      csat_score,
      csat_comment,
      sla_resolution_due_at,
      requester_type,
      support_context_type,
      support_context_id,
      support_context_label,
      expected_updated_at,
    } = body;

    const { data: before } = await supabase
      .from("support_tickets")
      .select("assigned_to, ticket_number, created_at, priority, status, resolved_at, updated_at")
      .eq("id", id)
      .maybeSingle();

    if (
      expected_updated_at != null &&
      typeof expected_updated_at === "string" &&
      before &&
      typeof before.updated_at === "string" &&
      before.updated_at !== expected_updated_at
    ) {
      return errorResponse(
        "This ticket was updated by another teammate. Refresh the page and try again.",
        "CONCURRENT_UPDATE",
        409
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) {
      updateData.status = status;
      if (status === "resolved") {
        updateData.resolved_at = new Date().toISOString();
      }
      if (status === "closed") {
        updateData.closed_at = new Date().toISOString();
      }
      if (status === "open" || status === "in_progress" || status === "waiting_customer") {
        updateData.resolved_at = null;
        updateData.closed_at = null;
      }
    }
    if (priority !== undefined) {
      updateData.priority = priority;
      const createdAt =
        typeof before?.created_at === "string" ? before.created_at : undefined;
      if (createdAt) {
        updateData.sla_resolution_due_at = computeSlaResolutionDueIso(createdAt, String(priority));
      }
    }
    if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
    if (tags !== undefined) updateData.tags = tags;
    if (category !== undefined) updateData.category = category;
    if (csat_score !== undefined) {
      if (csat_score !== null && (typeof csat_score !== "number" || csat_score < 1 || csat_score > 5)) {
        return NextResponse.json({ error: "csat_score must be null or 1–5" }, { status: 400 });
      }
      updateData.csat_score = csat_score;
    }
    if (csat_comment !== undefined) updateData.csat_comment = csat_comment;
    if (sla_resolution_due_at !== undefined) updateData.sla_resolution_due_at = sla_resolution_due_at;
    if (requester_type !== undefined) updateData.requester_type = requester_type;
    if (support_context_type !== undefined) updateData.support_context_type = support_context_type || null;
    if (support_context_id !== undefined) updateData.support_context_id = support_context_id || null;
    if (support_context_label !== undefined) updateData.support_context_label = typeof support_context_label === "string" ? support_context_label.trim() || null : null;

    const { data, error } = await supabase
      .from("support_tickets")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (
      assigned_to !== undefined &&
      before &&
      assigned_to &&
      String(assigned_to) !== String(before.assigned_to ?? "")
    ) {
      try {
        await notifySupportStaffInboxActivity(
          [String(assigned_to)],
          (data as { ticket_number?: string }).ticket_number || before?.ticket_number || id,
          "A support ticket was assigned to you.",
          id,
          ["email", "push"]
        );
      } catch (e) {
        console.error("Assignee notification failed:", e);
      }
    }

    // Notify ticket owner when status is resolved or closed so they know the ticket is officially closed
    if (
      (updateData.status === "resolved" || updateData.status === "closed") &&
      data.user_id
    ) {
      try {
        await notifySupportTicketUpdated(
          data.user_id,
          data.ticket_number || id,
          `Your ticket has been marked as ${updateData.status}. You can rate your support experience in the app.`,
          id,
          ["email", "push"],
          String((data as { requester_type?: string | null }).requester_type ?? "") === "provider"
            ? "provider"
            : "customer"
        );
      } catch (notifyErr) {
        console.error("Support ticket status notification failed:", notifyErr);
      }
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.support_ticket.update",
      entity_type: "support_ticket",
      entity_id: id,
      module: "support",
      risk_level: "medium",
      retention_tier: "routine",
      metadata: updateData,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    void slackNotifySupportTicketUpdated(request, data as {
      id: string;
      ticket_number?: string | null;
      priority?: string | null;
      status?: string | null;
      assigned_to?: string | null;
      sla_resolution_due_at?: string | null;
    }, before as {
      priority?: string | null;
      status?: string | null;
      resolved_at?: string | null;
    });

    return NextResponse.json({ ticket: data });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to update support ticket");
  }
}
