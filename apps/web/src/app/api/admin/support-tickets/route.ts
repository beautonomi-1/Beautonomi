import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";
import type { UserRole } from "@/types/beautonomi";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";
import { computeSlaResolutionDueIso } from "@/lib/support/support-ticket-sla";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

function sanitizeIlikeTerm(raw: string) {
  // Strip PostgREST/or filter metacharacters so q cannot break `.or(...)`.
  return raw.trim().replace(/[%_\\,]/g, "");
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const category = searchParams.get("category");
    const assignedTo = searchParams.get("assigned_to");
    const userId = searchParams.get("user_id");
    const q = sanitizeIlikeTerm(searchParams.get("q") || "");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "25", 10) || 25, 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);
    const sort = searchParams.get("sort") || "updated_desc";
    const slaOverdue =
      searchParams.get("sla_overdue") === "1" || searchParams.get("sla_overdue") === "true";

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
      default:
        query = query.order("updated_at", { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      tickets: data || [],
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
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);

    const body = await request.json();
    const {
      subject,
      description,
      category,
      priority,
      provider_id,
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
      const { data: withSla, error: slaErr } = await supabase
        .from("support_tickets")
        .update({ sla_resolution_due_at: slaDue })
        .eq("id", ticketId)
        .select()
        .single();
      if (!slaErr && withSla) {
        return NextResponse.json({ ticket: withSla });
      }
    }

    return NextResponse.json({ ticket: data });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to create support ticket");
  }
}
