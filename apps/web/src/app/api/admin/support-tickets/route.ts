import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";
import type { UserRole } from "@/types/beautonomi";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";
import { computeSlaResolutionDueIso, computeFirstResponseDueIso } from "@/lib/support/support-ticket-sla";
import { computeTicketAttentionFields } from "@/lib/support/support-ticket-attention";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { slackNotifyNewSupportTicket } from "@/lib/integrations/slack/triggers";

function sanitizeIlikeTerm(raw: string) {
  // Strip PostgREST/or filter metacharacters so q cannot break `.or(...)`.
  return raw.trim().replace(/[%_\\,]/g, "");
}

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const category = searchParams.get("category");
    const assignedTo = searchParams.get("assigned_to");
    const userId = searchParams.get("user_id");
    const q = sanitizeIlikeTerm(searchParams.get("q") || "");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "25", 10) || 25, 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);
    const sort = searchParams.get("sort") || "smart";
    const slaOverdue =
      searchParams.get("sla_overdue") === "1" || searchParams.get("sla_overdue") === "true";
    // New segment filters
    const needsResponse =
      searchParams.get("needs_response") === "1" || searchParams.get("needs_response") === "true";
    const slaStateFilter = searchParams.get("sla_state"); // "at_risk" | "breached"
    const firstResponseOverdue =
      searchParams.get("first_response_overdue") === "1" ||
      searchParams.get("first_response_overdue") === "true";

    let query = supabase
      .from("support_tickets")
      .select(
        `
        *,
        user:users!support_tickets_user_id_fkey(id, email, full_name),
        provider:providers(id, business_name),
        assigned_user:users!support_tickets_assigned_to_fkey(id, email, full_name)
      `,
        { count: "exact" }
      );

    if (status) {
      query = query.eq("status", status);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (assignedTo === "unassigned") {
      query = query.is("assigned_to", null);
    } else if (assignedTo) {
      query = query.eq("assigned_to", assignedTo);
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (q.length > 0) {
      const pattern = `%${q}%`;
      query = query.or(`subject.ilike.${pattern},ticket_number.ilike.${pattern},description.ilike.${pattern}`);
    }

    if (slaOverdue) {
      const nowIso = new Date().toISOString();
      query = query.lt("sla_resolution_due_at", nowIso).not("status", "eq", "resolved").not("status", "eq", "closed");
    }

    if (needsResponse) {
      query = query.eq("needs_agent_response", true);
    }

    if (slaStateFilter === "breached") {
      const nowIso = new Date().toISOString();
      query = query
        .lt("sla_resolution_due_at", nowIso)
        .not("status", "in", '("resolved","closed")');
    } else if (slaStateFilter === "at_risk") {
      // at_risk: due within 25% of window. We approximate this server-side as
      // SLA due in the next 6 hours (a conservative proxy — full computation
      // happens client-side via computeTicketAttentionFields).
      const nowIso = new Date().toISOString();
      const sixHoursOut = new Date(Date.now() + 6 * 3600_000).toISOString();
      query = query
        .gt("sla_resolution_due_at", nowIso)
        .lt("sla_resolution_due_at", sixHoursOut)
        .not("status", "in", '("resolved","closed")');
    }

    if (firstResponseOverdue) {
      const nowIso = new Date().toISOString();
      query = query
        .lt("first_response_due_at", nowIso)
        .is("first_staff_reply_at", null)
        .not("status", "in", '("resolved","closed")');
    }

    switch (sort) {
      case "created_desc":
        query = query.order("created_at", { ascending: false });
        break;
      case "sla_asc":
        query = query.order("sla_resolution_due_at", { ascending: true, nullsFirst: false });
        break;
      case "priority_asc":
        query = query.order("priority_rank", { ascending: true });
        break;
      case "updated_desc":
        query = query.order("updated_at", { ascending: false });
        break;
      case "smart":
      default:
        // Attention-first: needs-response tickets first, then priority rank,
        // then earliest SLA deadline, then oldest last message (longest wait).
        query = query
          .order("needs_agent_response", { ascending: false })
          .order("priority_rank", { ascending: true })
          .order("sla_resolution_due_at", { ascending: true, nullsFirst: false })
          .order("last_message_at", { ascending: true, nullsFirst: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    const nowMs = Date.now();
    const tickets = (data || []).map((row) => {
      const attention = computeTicketAttentionFields(
        {
          status: row.status,
          priority: row.priority,
          last_message_from: row.last_message_from,
          last_message_at: row.last_message_at,
          first_staff_reply_at: row.first_staff_reply_at,
          first_response_due_at: (row as Record<string, unknown>).first_response_due_at as string | null,
          sla_resolution_due_at: row.sla_resolution_due_at,
          assigned_to: row.assigned_to,
          last_staff_view_at: (row as Record<string, unknown>).last_staff_view_at as string | null,
          needs_agent_response: (row as Record<string, unknown>).needs_agent_response as boolean | null,
        },
        nowMs,
      );
      return {
        ...row,
          needs_agent_response: (row as Record<string, unknown>).needs_agent_response ?? (attention.attention_state !== "waiting_customer" && attention.attention_state !== "resolved" && attention.attention_state !== "assigned_idle"),
        first_response_due_at: (row as Record<string, unknown>).first_response_due_at,
        attention_state: attention.attention_state,
        sla_state: attention.sla_state,
        agent_unread: attention.agent_unread,
      };
    });

    return NextResponse.json({
      tickets,
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to fetch support tickets");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const supabase = getSupabaseAdmin();

    const body = await request.json();
    const {
      subject,
      description,
      category,
      priority,
      provider_id,
      requester_type,
      support_context_type,
      support_context_id,
      support_context_label,
    } = body;

    if (!subject || !description) {
      return NextResponse.json(
        { error: "Subject and description are required" },
        { status: 400 }
      );
    }

    const priorityVal = typeof priority === "string" && priority.trim() ? priority.trim() : "medium";

    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        provider_id: provider_id || null,
        subject,
        description,
        category: category || null,
        priority: priorityVal,
        status: "open",
        requester_type: requester_type || (provider_id ? "provider" : "admin"),
        support_context_type: support_context_type || null,
        support_context_id: support_context_id || null,
        support_context_label: typeof support_context_label === "string" ? support_context_label.trim() || null : null,
      })
      .select()
      .single();

    if (error) throw error;

    const ticketId = (data as { id: string }).id;
    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.support_ticket.create",
      entity_type: "support_ticket",
      entity_id: ticketId,
      module: "support",
      risk_level: "medium",
      retention_tier: "routine",
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    const createdAt = (data as { created_at?: string }).created_at;
    if (createdAt) {
      const slaDue = computeSlaResolutionDueIso(createdAt, priorityVal);
      const firstRespDue = computeFirstResponseDueIso(createdAt, priorityVal);
      const { data: withSla, error: slaErr } = await supabase
        .from("support_tickets")
        .update({ sla_resolution_due_at: slaDue, first_response_due_at: firstRespDue })
        .eq("id", ticketId)
        .select()
        .single();
      if (!slaErr && withSla) {
        void slackNotifyNewSupportTicket(request, withSla as {
          id: string;
          ticket_number?: string;
          subject?: string;
          priority?: string;
          requester_type?: string;
          support_context_type?: string;
          support_context_label?: string;
        });
        return NextResponse.json({ ticket: withSla });
      }
    }

    void slackNotifyNewSupportTicket(request, data as {
      id: string;
      ticket_number?: string;
      subject?: string;
      priority?: string;
      requester_type?: string;
      support_context_type?: string;
      support_context_label?: string;
    });
    return NextResponse.json({ ticket: data });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to create support ticket");
  }
}
