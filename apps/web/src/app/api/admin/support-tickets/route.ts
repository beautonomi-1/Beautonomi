import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";
import type { UserRole } from "@/types/beautonomi";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";
import { computeSlaResolutionDueIso, computeFirstResponseDueIso } from "@/lib/support/support-ticket-sla";
import { computeTicketAttentionFields } from "@/lib/support/support-ticket-attention";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { slackNotifyNewSupportTicket } from "@/lib/integrations/slack/triggers";
import {
  deriveSupportContextTypeForTicket,
  resolveGroupFilter,
  validateAdminCategoryValue,
} from "@/lib/support/ticket-categories";
import { isUuidString } from "@beautonomi/utils";
import {
  applySupportAgentTicketScope,
  resolveSupportAgentTicketTenantIds,
} from "@/lib/support/support-agent-tenant-scope";
import { enrichTicketsWithLatestEmailDeliveryStatus } from "@/lib/support/enrich-support-ticket-list";

function sanitizeIlikeTerm(raw: string) {
  // Strip PostgREST/or filter metacharacters so q cannot break `.or(...)`.
  return raw.trim().replace(/[%_\\,]/g, "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminSupportTicketRow = Record<string, any> & { id: string; channel?: string | null };

/** Missing column / FK embed (migration or schema cache behind the deployed code). */
function isRecoverableSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "42703" || code === "PGRST200" || code === "PGRST201" || code === "PGRST204") {
    return true;
  }
  const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find a relationship")
  );
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const categoryGroup = searchParams.get("category_group");
    const tenantIdFilter = searchParams.get("tenant_id");
    const channelFilter = searchParams.get("channel");
    let categoryGroupValues: string[] | null = null;
    if (categoryGroup) {
      const group = resolveGroupFilter(categoryGroup);
      if (!group) {
        return NextResponse.json({ error: "Unknown category_group" }, { status: 400 });
      }
      categoryGroupValues = group.items.map((i) => i.value);
    }
    const status = searchParams.get("status");
    const statusGroup = searchParams.get("status_group");
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
    const includeCounts =
      searchParams.get("include_counts") === "1" ||
      searchParams.get("include_counts") === "true";
    const handlingModeFilter = searchParams.get("handling_mode");

    const tenantId =
      tenantIdFilter && isUuidString(tenantIdFilter) ? tenantIdFilter : null;
    const agentTenantIds = await resolveSupportAgentTicketTenantIds(supabase, {
      role: user.role,
      userId: user.id,
    });

    // Build the list query. `agentQueue` gates every column introduced by
    // migration 726 (needs_agent_response, first_response_due_at). When that
    // migration has not been applied yet (e.g. code deployed ahead of the DB
    // migration), Postgres raises 42703 "undefined column" and we retry
    // without those columns. `includeTenantEmbed` drops the tenants FK hint
    // when PostgREST reports the relationship is missing (PGRST200) so the
    // queue still loads.
    const buildQuery = async (agentQueue: boolean, includeTenantEmbed: boolean) => {
      const tenantEmbed = includeTenantEmbed
        ? `,
          tenant:tenants!support_tickets_tenant_id_fkey(id, name, slug, region_code)`
        : "";
      let query = supabase
        .from("support_tickets")
        .select(
          `
          *,
          user:users!support_tickets_user_id_fkey(id, email, full_name),
          provider:providers(id, business_name),
          assigned_user:users!support_tickets_assigned_to_fkey(id, email, full_name)${tenantEmbed}
        `,
          { count: "exact" }
        );

      if (statusGroup === "resolved_closed") {
        query = query.in("status", ["resolved", "closed"]);
      } else if (statusGroup === "active") {
        query = query.in("status", ["open", "in_progress", "waiting_customer"]);
      } else if (status) {
        query = query.eq("status", status);
      }

      if (priority) {
        query = query.eq("priority", priority);
      }

      if (category) {
        query = query.eq("category", category);
      }

      if (categoryGroupValues) {
        query = query.in("category", categoryGroupValues);
      }

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      if (channelFilter === "email" || channelFilter === "app") {
        query = query.eq("channel", channelFilter);
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
        const parts = [
          `subject.ilike.${pattern}`,
          `ticket_number.ilike.${pattern}`,
          `description.ilike.${pattern}`,
          `support_context_label.ilike.${pattern}`,
          `requester_email.ilike.${pattern}`,
        ];
        if (isUuidString(q)) {
          parts.push(`support_context_id.eq.${q}`);
        }
        query = query.or(parts.join(","));
      }

      if (slaOverdue) {
        const nowIso = new Date().toISOString();
        query = query.lt("sla_resolution_due_at", nowIso).not("status", "eq", "resolved").not("status", "eq", "closed");
      }

      // needs_agent_response is a migration-726 column — only filter on it when
      // the agent-queue schema is present.
      if (needsResponse && agentQueue) {
        query = query.eq("needs_agent_response", true);
      }

      if (handlingModeFilter === "assistant" && agentQueue) {
        query = query.eq("handling_mode", "assistant");
      } else if (handlingModeFilter === "human" && agentQueue) {
        query = query.eq("handling_mode", "human");
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

      // first_response_due_at is a migration-726 column — gate the filter.
      if (firstResponseOverdue && agentQueue) {
        const nowIso = new Date().toISOString();
        query = query
          .lt("first_response_due_at", nowIso)
          .is("first_staff_reply_at", null)
          .eq("handling_mode", "human")
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
          // The needs_agent_response ordering is only available post-726.
          if (agentQueue) {
            query = query.order("needs_agent_response", { ascending: false });
          }
          query = query
            .order("priority_rank", { ascending: true })
            .order("sla_resolution_due_at", { ascending: true, nullsFirst: false })
            .order("last_message_at", { ascending: true, nullsFirst: false });
      }

      query = applySupportAgentTicketScope(query, agentTenantIds);

      return query.range(offset, offset + limit - 1);
    };

    const listPlans = [
      { agentQueue: true, includeTenantEmbed: true },
      { agentQueue: false, includeTenantEmbed: true },
      { agentQueue: false, includeTenantEmbed: false },
    ] as const;
    let data: AdminSupportTicketRow[] | null = null;
    let error: { code?: string; message?: string } | null = null;
    let count: number | null = null;
    let agentQueue = true;
    for (let i = 0; i < listPlans.length; i++) {
      const plan = listPlans[i];
      const listQuery = await buildQuery(plan.agentQueue, plan.includeTenantEmbed);
      const result = await listQuery;
      data = (result.data ?? null) as unknown as AdminSupportTicketRow[] | null;
      error = (result.error ?? null) as { code?: string; message?: string } | null;
      count = result.count ?? null;
      if (!error) {
        agentQueue = plan.agentQueue;
        break;
      }
      if (!isRecoverableSchemaError(error) || i === listPlans.length - 1) break;
    }

    if (error) throw error;

    const nowMs = Date.now();
    const ticketsBase = (data || []).map((row): AdminSupportTicketRow => {
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
          handling_mode: (row as Record<string, unknown>).handling_mode as string | null,
        },
        nowMs,
      );
      return {
        ...row,
        needs_agent_response:
          (row as Record<string, unknown>).needs_agent_response ??
          (attention.attention_state !== "waiting_customer" &&
            attention.attention_state !== "resolved" &&
            attention.attention_state !== "assigned_idle"),
        first_response_due_at: (row as Record<string, unknown>).first_response_due_at,
        attention_state: attention.attention_state,
        sla_state: attention.sla_state,
        agent_unread: attention.agent_unread,
      };
    });

    let tickets: AdminSupportTicketRow[] = ticketsBase;
    try {
      tickets = await enrichTicketsWithLatestEmailDeliveryStatus(supabase, ticketsBase);
    } catch (enrichError) {
      if (!isRecoverableSchemaError(enrichError)) throw enrichError;
      console.warn("[admin/support-tickets] email delivery status unavailable:", enrichError);
    }

    const counts = includeCounts
      ? await loadSupportTicketCounts(supabase, agentQueue, {
          tenantId,
          agentTenantIds,
        })
      : null;

    return NextResponse.json({
      tickets,
      total: count ?? 0,
      limit,
      offset,
      ...(counts ? { counts } : {}),
    });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to fetch support tickets");
  }
}

async function loadSupportTicketCounts(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  agentQueue: boolean,
  scope: { tenantId: string | null; agentTenantIds: string[] | null },
) {
  const nowIso = new Date().toISOString();
  const openStatuses = ["open", "in_progress", "waiting_customer"];

  type CountQuery = {
    eq: (col: string, val: string | boolean) => CountQuery;
    in: (col: string, vals: string[]) => CountQuery;
    is: (col: string, val: null) => CountQuery;
    lt: (col: string, val: string) => CountQuery;
  };

  const runCount = async (mutate: (q: CountQuery) => CountQuery) => {
    // Fresh builder per count. PostgREST filters mutate the builder in place,
    // so reusing one query ANDs every previous count's predicates together.
    let query = supabase.from("support_tickets").select("id", { count: "exact", head: true });
    if (scope.tenantId) {
      query = query.eq("tenant_id", scope.tenantId);
    }
    query = mutate(query as unknown as CountQuery) as unknown as typeof query;
    query = applySupportAgentTicketScope(query, scope.agentTenantIds);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  };

  try {
    const open = await runCount((q) => q.in("status", openStatuses));
    const unassigned = await runCount((q) => q.in("status", openStatuses).is("assigned_to", null));
    const breachingSla = await runCount((q) =>
      q.lt("sla_resolution_due_at", nowIso).in("status", openStatuses),
    );

    let awaitingReply = 0;
    if (agentQueue) {
      try {
        awaitingReply = await runCount((q) => q.eq("needs_agent_response", true));
      } catch (err) {
        if (isRecoverableSchemaError(err)) {
          awaitingReply = await runCount((q) => q.eq("status", "open"));
        } else {
          throw err;
        }
      }
    } else {
      awaitingReply = await runCount((q) => q.eq("status", "open"));
    }

    return {
      open,
      unassigned,
      breaching_sla: breachingSla,
      awaiting_reply: awaitingReply,
    };
  } catch (countError) {
    // The list is already loaded. A count failure must not 500 the queue.
    console.warn("[admin/support-tickets] counts unavailable:", countError);
    return null;
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

    const categoryParsed = validateAdminCategoryValue(category);
    if (!categoryParsed.ok) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    const storedCategory = categoryParsed.category;
    const supportContextTypeResolved = deriveSupportContextTypeForTicket({
      category: storedCategory ?? "",
      supportContextId: support_context_id,
      supportContextLabel: support_context_label,
      clientContextType: support_context_type ?? null,
    });

    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        provider_id: provider_id || null,
        subject,
        description,
        category: storedCategory,
        priority: priorityVal,
        status: "open",
        requester_type: requester_type || (provider_id ? "provider" : "admin"),
        support_context_type: supportContextTypeResolved,
        support_context_id: support_context_id || null,
        support_context_label: typeof support_context_label === "string" ? support_context_label.trim() || null : null,
      })
      .select()
      .single();

    if (error) throw error;

    const ticketId = (data as { id: string }).id;
    try {
      const { maybeOpenFraudCaseFromSafetyTicket } = await import(
        "@/lib/fraud/maybe-open-fraud-from-support-ticket"
      );
      await maybeOpenFraudCaseFromSafetyTicket({
        ticketId,
        category: storedCategory,
        userId: user.id,
        providerId: provider_id || null,
        subject: String(subject),
        message: String(description),
        supabase: supabase as never,
      });
    } catch (fraudErr) {
      console.error("Fraud case from admin safety ticket failed:", fraudErr);
    }

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
