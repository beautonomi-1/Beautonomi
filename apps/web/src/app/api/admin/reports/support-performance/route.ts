import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  getPeriodWindow,
  getTenantTicketScope,
  iterateDays,
  isSlaBreached,
  median,
  msToHours,
  msToMinutes,
} from "@/lib/support/support-report-shared";

const TICKET_ROW_CAP = 5000;

interface TicketRow {
  id: string;
  status: string | null;
  priority: string | null;
  created_at: string | null;
  updated_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  first_staff_reply_at: string | null;
  sla_resolution_due_at: string | null;
  csat_score: number | null;
  category: string | null;
  requester_type: string | null;
  support_context_type: string | null;
  user_id: string | null;
  provider_id: string | null;
  assigned_to: string | null;
}

const STATUS_KEYS = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
const PRIORITY_KEYS = ["urgent", "high", "medium", "low"] as const;

function isClosedLike(status: string | null | undefined): boolean {
  return status === "resolved" || status === "closed";
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const window = getPeriodWindow(
      searchParams.get("period"),
      searchParams.get("start_date"),
      searchParams.get("end_date")
    );

    const scope = await getTenantTicketScope(supabase, tenantId);

    const orFilter = (() => {
      const parts: string[] = [];
      if (scope.userIds.length > 0) {
        parts.push(`user_id.in.(${scope.userIds.join(",")})`);
      }
      if (scope.providerIds.length > 0) {
        parts.push(`provider_id.in.(${scope.providerIds.join(",")})`);
      }
      return parts.length > 0 ? parts.join(",") : null;
    })();

    if (!orFilter) {
      return successResponse({
        period: window.period,
        ticketsCreated: 0,
        ticketsResolved: 0,
        openBacklog: 0,
        slaBreachRate: 0,
        slaBreachCount: 0,
        medianFirstResponseMinutes: null,
        medianResolutionHours: null,
        firstResponseSampleSize: 0,
        resolutionSampleSize: 0,
        avgCsat: null,
        csatResponses: 0,
        csatPositiveRate: null,
        requesterMix: [],
        contextMix: [],
        statusMix: STATUS_KEYS.map((status) => ({ status, count: 0 })),
        priorityMix: PRIORITY_KEYS.map((priority) => ({
          priority,
          count: 0,
          breached: 0,
          breachRate: 0,
        })),
        dailyOpenedVsResolved: Array.from(iterateDays(window.startDate, window.endDate)).map((date) => ({
          date,
          opened: 0,
          resolved: 0,
        })),
      });
    }

    const SELECT = [
      "id",
      "status",
      "priority",
      "created_at",
      "updated_at",
      "resolved_at",
      "closed_at",
      "first_staff_reply_at",
      "sla_resolution_due_at",
      "csat_score",
      "category",
      "requester_type",
      "support_context_type",
      "user_id",
      "provider_id",
      "assigned_to",
    ].join(", ");

    const [createdRes, resolvedRes, openRes] = await Promise.all([
      supabase
        .from("support_tickets")
        .select(SELECT)
        .or(orFilter)
        .gte("created_at", window.startISO)
        .lte("created_at", window.endISO)
        .order("created_at", { ascending: false })
        .limit(TICKET_ROW_CAP),
      supabase
        .from("support_tickets")
        .select(SELECT)
        .or(orFilter)
        .gte("resolved_at", window.startISO)
        .lte("resolved_at", window.endISO)
        .order("resolved_at", { ascending: false })
        .limit(TICKET_ROW_CAP),
      supabase
        .from("support_tickets")
        .select("id, status, priority, sla_resolution_due_at")
        .or(orFilter)
        .not("status", "in", "(resolved,closed)")
        .limit(TICKET_ROW_CAP),
    ]);

    if (createdRes.error) throw createdRes.error;
    if (resolvedRes.error) throw resolvedRes.error;
    if (openRes.error) throw openRes.error;

    const created = (createdRes.data ?? []) as unknown as TicketRow[];
    const resolved = (resolvedRes.data ?? []) as unknown as TicketRow[];
    const open = (openRes.data ?? []) as unknown as Pick<
      TicketRow,
      "id" | "status" | "priority" | "sla_resolution_due_at"
    >[];

    const dedupById = new Map<string, TicketRow>();
    for (const row of [...created, ...resolved]) dedupById.set(row.id, row);
    const periodTickets = [...dedupById.values()];

    const ticketsCreated = created.length;
    const ticketsResolved = resolved.length;
    const openBacklog = open.length;

    const breachedNow = open.filter((t) =>
      isSlaBreached({
        status: t.status,
        sla_resolution_due_at: t.sla_resolution_due_at ?? null,
      })
    ).length;
    const breachedResolved = resolved.filter((t) => isSlaBreached(t)).length;
    const slaConsidered = openBacklog + ticketsResolved;
    const slaBreachCount = breachedNow + breachedResolved;
    const slaBreachRate = slaConsidered > 0 ? (slaBreachCount / slaConsidered) * 100 : 0;

    const frtMs = periodTickets
      .filter((t) => t.first_staff_reply_at && t.created_at)
      .map(
        (t) =>
          new Date(t.first_staff_reply_at as string).getTime() -
          new Date(t.created_at as string).getTime()
      )
      .filter((ms) => ms >= 0);
    const mttrMs = resolved
      .filter((t) => t.resolved_at && t.created_at)
      .map(
        (t) =>
          new Date(t.resolved_at as string).getTime() -
          new Date(t.created_at as string).getTime()
      )
      .filter((ms) => ms >= 0);

    const medianFirstResponseMinutes = msToMinutes(median(frtMs));
    const medianResolutionHours = msToHours(median(mttrMs));

    const csatScores = periodTickets
      .map((t) => t.csat_score)
      .filter((v): v is number => typeof v === "number");
    const avgCsat =
      csatScores.length > 0
        ? Math.round((csatScores.reduce((s, v) => s + v, 0) / csatScores.length) * 100) / 100
        : null;
    const csatPositive = csatScores.filter((v) => v >= 4).length;
    const csatPositiveRate =
      csatScores.length > 0
        ? Math.round((csatPositive / csatScores.length) * 1000) / 10
        : null;

    const statusCounts = new Map<string, number>();
    for (const key of STATUS_KEYS) statusCounts.set(key, 0);
    for (const t of [...periodTickets, ...open]) {
      const key = String(t.status ?? "").trim();
      if (!key) continue;
      statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
    }
    const statusMix = [...statusCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const requesterCounts = new Map<string, number>();
    const contextCounts = new Map<string, number>();
    for (const t of periodTickets) {
      const requester = t.requester_type || (t.provider_id ? "provider" : "customer");
      requesterCounts.set(requester, (requesterCounts.get(requester) ?? 0) + 1);
      const context = t.support_context_type || "uncategorized";
      contextCounts.set(context, (contextCounts.get(context) ?? 0) + 1);
    }
    const requesterMix = [...requesterCounts.entries()]
      .map(([requester_type, count]) => ({ requester_type, count }))
      .sort((a, b) => b.count - a.count);
    const contextMix = [...contextCounts.entries()]
      .map(([support_context_type, count]) => ({ support_context_type, count }))
      .sort((a, b) => b.count - a.count);

    const priorityAgg = new Map<string, { count: number; breached: number }>();
    for (const key of PRIORITY_KEYS) priorityAgg.set(key, { count: 0, breached: 0 });
    for (const t of periodTickets) {
      const key = String(t.priority ?? "medium").trim() || "medium";
      const cur = priorityAgg.get(key) ?? { count: 0, breached: 0 };
      cur.count += 1;
      if (isSlaBreached(t)) cur.breached += 1;
      priorityAgg.set(key, cur);
    }
    const priorityMix = [...priorityAgg.entries()]
      .map(([priority, agg]) => ({
        priority,
        count: agg.count,
        breached: agg.breached,
        breachRate: agg.count > 0 ? Math.round((agg.breached / agg.count) * 1000) / 10 : 0,
      }))
      .sort((a, b) => {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
        return (order[a.priority] ?? 99) - (order[b.priority] ?? 99);
      });

    const openedByDay = new Map<string, number>();
    const resolvedByDay = new Map<string, number>();
    for (const t of created) {
      if (!t.created_at) continue;
      const k = new Date(t.created_at).toISOString().slice(0, 10);
      openedByDay.set(k, (openedByDay.get(k) ?? 0) + 1);
    }
    for (const t of resolved) {
      if (!t.resolved_at) continue;
      const k = new Date(t.resolved_at).toISOString().slice(0, 10);
      resolvedByDay.set(k, (resolvedByDay.get(k) ?? 0) + 1);
    }
    const dailyOpenedVsResolved = Array.from(iterateDays(window.startDate, window.endDate)).map(
      (date) => ({
        date,
        opened: openedByDay.get(date) ?? 0,
        resolved: resolvedByDay.get(date) ?? 0,
      })
    );

    return successResponse({
      period: window.period,
      ticketsCreated,
      ticketsResolved,
      openBacklog,
      slaBreachRate: Math.round(slaBreachRate * 10) / 10,
      slaBreachCount,
      slaConsideredTickets: slaConsidered,
      medianFirstResponseMinutes,
      medianResolutionHours,
      firstResponseSampleSize: frtMs.length,
      resolutionSampleSize: mttrMs.length,
      avgCsat,
      csatResponses: csatScores.length,
      csatPositiveRate,
      requesterMix,
      contextMix,
      statusMix,
      priorityMix,
      dailyOpenedVsResolved,
      ticketsWithoutFirstResponse: periodTickets.filter(
        (t) => !t.first_staff_reply_at && !isClosedLike(t.status)
      ).length,
      ticketRowCap: TICKET_ROW_CAP,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load support performance report");
  }
}
