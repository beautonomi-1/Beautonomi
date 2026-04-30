import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  getPeriodWindow,
  getTenantTicketScope,
  isSlaBreached,
  median,
  msToHours,
  msToMinutes,
} from "@/lib/support/support-report-shared";

const TICKET_ROW_CAP = 5000;
const TOP_REQUESTERS_LIMIT = 25;
const TOP_CATEGORIES_LIMIT = 25;
const TOP_TAGS_LIMIT = 20;

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
  tags: string[] | null;
  user_id: string | null;
  provider_id: string | null;
  assigned_to: string | null;
}

interface UserMini {
  id: string;
  email: string | null;
  full_name: string | null;
}

function ageBucket(createdAtIso: string): "lt_24h" | "1_3d" | "3_7d" | "gt_7d" {
  const ageMs = Date.now() - new Date(createdAtIso).getTime();
  const day = 86_400_000;
  if (ageMs < day) return "lt_24h";
  if (ageMs < 3 * day) return "1_3d";
  if (ageMs < 7 * day) return "3_7d";
  return "gt_7d";
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
      if (scope.userIds.length > 0) parts.push(`user_id.in.(${scope.userIds.join(",")})`);
      if (scope.providerIds.length > 0) parts.push(`provider_id.in.(${scope.providerIds.join(",")})`);
      return parts.length > 0 ? parts.join(",") : null;
    })();

    if (!orFilter) {
      return successResponse({
        period: window.period,
        agents: [],
        topCategories: [],
        topTags: [],
        agingUnassigned: { total: 0, buckets: [] },
        topRequesters: [],
        ticketRowCap: TICKET_ROW_CAP,
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
      "tags",
      "user_id",
      "provider_id",
      "assigned_to",
    ].join(", ");

    // Tickets created OR resolved within the period (period activity).
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
        .select(SELECT)
        .or(orFilter)
        .not("status", "in", "(resolved,closed)")
        .order("created_at", { ascending: false })
        .limit(TICKET_ROW_CAP),
    ]);

    if (createdRes.error) throw createdRes.error;
    if (resolvedRes.error) throw resolvedRes.error;
    if (openRes.error) throw openRes.error;

    const created = (createdRes.data ?? []) as unknown as TicketRow[];
    const resolved = (resolvedRes.data ?? []) as unknown as TicketRow[];
    const open = (openRes.data ?? []) as unknown as TicketRow[];

    const periodMap = new Map<string, TicketRow>();
    for (const row of [...created, ...resolved]) periodMap.set(row.id, row);
    const periodTickets = [...periodMap.values()];

    /* ── Per-agent productivity ────────────────────────────────────────── */
    const agentMap = new Map<
      string,
      {
        assignedInPeriod: Set<string>;
        resolvedInPeriod: number;
        currentlyOpen: number;
        frtMs: number[];
        mttrMs: number[];
        slaBreaches: number;
        csatScores: number[];
      }
    >();

    function ensureAgent(id: string) {
      let agg = agentMap.get(id);
      if (!agg) {
        agg = {
          assignedInPeriod: new Set(),
          resolvedInPeriod: 0,
          currentlyOpen: 0,
          frtMs: [],
          mttrMs: [],
          slaBreaches: 0,
          csatScores: [],
        };
        agentMap.set(id, agg);
      }
      return agg;
    }

    for (const t of periodTickets) {
      if (!t.assigned_to) continue;
      const agg = ensureAgent(t.assigned_to);
      agg.assignedInPeriod.add(t.id);
      if (t.first_staff_reply_at && t.created_at) {
        const ms =
          new Date(t.first_staff_reply_at).getTime() - new Date(t.created_at).getTime();
        if (ms >= 0) agg.frtMs.push(ms);
      }
      if (typeof t.csat_score === "number") agg.csatScores.push(t.csat_score);
      if (isSlaBreached(t)) agg.slaBreaches += 1;
    }
    for (const t of resolved) {
      if (!t.assigned_to) continue;
      const agg = ensureAgent(t.assigned_to);
      agg.resolvedInPeriod += 1;
      if (t.resolved_at && t.created_at) {
        const ms = new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime();
        if (ms >= 0) agg.mttrMs.push(ms);
      }
    }
    for (const t of open) {
      if (!t.assigned_to) continue;
      const agg = ensureAgent(t.assigned_to);
      agg.currentlyOpen += 1;
    }

    const agentIds = [...agentMap.keys()];
    const agentLookup: Record<string, UserMini> = {};
    if (agentIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, email, full_name")
        .in("id", agentIds);
      for (const u of (users ?? []) as UserMini[]) agentLookup[u.id] = u;
    }

    const agents = [...agentMap.entries()]
      .map(([id, agg]) => {
        const user = agentLookup[id];
        const csatAvg =
          agg.csatScores.length > 0
            ? Math.round(
                (agg.csatScores.reduce((s, v) => s + v, 0) / agg.csatScores.length) * 100
              ) / 100
            : null;
        return {
          agent_id: id,
          agent_name: user?.full_name ?? user?.email ?? "Unknown",
          agent_email: user?.email ?? null,
          assigned_in_period: agg.assignedInPeriod.size,
          resolved_in_period: agg.resolvedInPeriod,
          currently_open: agg.currentlyOpen,
          median_first_response_minutes: msToMinutes(median(agg.frtMs)),
          median_resolution_hours: msToHours(median(agg.mttrMs)),
          sla_breaches: agg.slaBreaches,
          avg_csat: csatAvg,
          csat_responses: agg.csatScores.length,
        };
      })
      .sort((a, b) => b.resolved_in_period - a.resolved_in_period || b.assigned_in_period - a.assigned_in_period);

    /* ── Top categories ────────────────────────────────────────────────── */
    const categoryMap = new Map<
      string,
      { count: number; resolutionMs: number[]; breaches: number; csat: number[] }
    >();
    for (const t of periodTickets) {
      const key = (t.category && t.category.trim()) || "uncategorized";
      let agg = categoryMap.get(key);
      if (!agg) {
        agg = { count: 0, resolutionMs: [], breaches: 0, csat: [] };
        categoryMap.set(key, agg);
      }
      agg.count += 1;
      if (t.resolved_at && t.created_at) {
        agg.resolutionMs.push(
          new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()
        );
      }
      if (isSlaBreached(t)) agg.breaches += 1;
      if (typeof t.csat_score === "number") agg.csat.push(t.csat_score);
    }
    const totalForCategoryPct = periodTickets.length;
    const topCategories = [...categoryMap.entries()]
      .map(([category, agg]) => ({
        category,
        count: agg.count,
        share: totalForCategoryPct > 0
          ? Math.round((agg.count / totalForCategoryPct) * 1000) / 10
          : 0,
        avg_resolution_hours:
          agg.resolutionMs.length > 0
            ? Math.round(
                (agg.resolutionMs.reduce((s, v) => s + v, 0) /
                  agg.resolutionMs.length /
                  3600_000) *
                  10
              ) / 10
            : null,
        breach_rate:
          agg.count > 0 ? Math.round((agg.breaches / agg.count) * 1000) / 10 : 0,
        avg_csat:
          agg.csat.length > 0
            ? Math.round((agg.csat.reduce((s, v) => s + v, 0) / agg.csat.length) * 100) / 100
            : null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_CATEGORIES_LIMIT);

    /* ── Top tags (free-text) ──────────────────────────────────────────── */
    const tagMap = new Map<string, number>();
    for (const t of periodTickets) {
      const tags = Array.isArray(t.tags) ? t.tags : [];
      for (const raw of tags) {
        const tag = String(raw ?? "").trim();
        if (!tag) continue;
        tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
      }
    }
    const topTags = [...tagMap.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_TAGS_LIMIT);

    /* ── Aging unassigned (currently open, no assignee) ────────────────── */
    const buckets = { lt_24h: 0, "1_3d": 0, "3_7d": 0, gt_7d: 0 } as Record<string, number>;
    let agingTotal = 0;
    for (const t of open) {
      if (t.assigned_to) continue;
      if (!t.created_at) continue;
      const k = ageBucket(t.created_at);
      buckets[k] = (buckets[k] ?? 0) + 1;
      agingTotal += 1;
    }
    const agingUnassigned = {
      total: agingTotal,
      buckets: [
        { bucket: "<24h", count: buckets.lt_24h },
        { bucket: "1–3 days", count: buckets["1_3d"] },
        { bucket: "3–7 days", count: buckets["3_7d"] },
        { bucket: ">7 days", count: buckets.gt_7d },
      ],
    };

    /* ── Top requesters in period (by created tickets) ─────────────────── */
    const requesterCounts = new Map<string, number>();
    for (const t of created) {
      if (!t.user_id) continue;
      requesterCounts.set(t.user_id, (requesterCounts.get(t.user_id) ?? 0) + 1);
    }
    const topRequesterIds = [...requesterCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_REQUESTERS_LIMIT);
    const requesterLookup: Record<string, UserMini> = {};
    if (topRequesterIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, email, full_name")
        .in("id", topRequesterIds.map(([id]) => id));
      for (const u of (users ?? []) as UserMini[]) requesterLookup[u.id] = u;
    }
    const topRequesters = topRequesterIds.map(([user_id, count]) => {
      const u = requesterLookup[user_id];
      return {
        user_id,
        full_name: u?.full_name ?? null,
        email: u?.email ?? null,
        ticket_count: count,
      };
    });

    return successResponse({
      period: window.period,
      agents,
      topCategories,
      topTags,
      agingUnassigned,
      topRequesters,
      ticketRowCap: TICKET_ROW_CAP,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load support workload report");
  }
}
