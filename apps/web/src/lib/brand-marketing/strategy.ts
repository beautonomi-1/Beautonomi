import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashContent, createBrandApproval } from "./approvals";
import { validateSecondApprover } from "./approvers";
import { loadBrandSettings } from "./settings";
import { sumKnownSpendForCampaign } from "./placement-metrics";

import type {
  StrategyKpiRow,
  StrategyPillarRow,
  StrategyPlanRow,
  StrategyRow,
  StrategyStatus,
  StrategyTree,
} from "./strategy-types";

export type {
  StrategyKpiRow,
  StrategyPillarRow,
  StrategyPlanRow,
  StrategyRow,
  StrategyStatus,
  StrategyTree,
} from "./strategy-types";

export const createStrategySchema = z.object({
  year: z.coerce.number().int(),
  positioning: z.string().optional(),
  brand_promise: z.string().optional(),
  audience_priorities: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
});

export const patchStrategySchema = z.object({
  positioning: z.string().optional(),
  brand_promise: z.string().optional(),
  audience_priorities: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
});

export const createPillarSchema = z.object({
  strategy_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  kpi_key: z.string().optional(),
  kpi_target: z.coerce.number().optional(),
  budget_target: z.coerce.number().optional(),
  sort_order: z.coerce.number().int().optional(),
  owner_id: z.string().uuid().nullable().optional(),
});

export const patchPillarSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  kpi_key: z.string().nullable().optional(),
  kpi_target: z.coerce.number().nullable().optional(),
  budget_target: z.coerce.number().nullable().optional(),
  sort_order: z.coerce.number().int().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  archived: z.boolean().optional(),
});

export const createPlanSchema = z.object({
  pillar_id: z.string().uuid(),
  year: z.coerce.number().int(),
  quarter: z.coerce.number().int().min(1).max(4),
  budget: z.coerce.number().optional(),
  objective: z.string().optional(),
  notes: z.string().optional(),
});

export const patchPlanSchema = z.object({
  budget: z.coerce.number().optional(),
  objective: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  archived: z.boolean().optional(),
});

export function assertStrategyEditable(strategy: { status: string; archived_at?: string | null }) {
  if (strategy.archived_at) {
    return { ok: false as const, code: "STRATEGY_LOCKED" as const, message: "Strategy is archived. Unarchive to edit." };
  }
  if (strategy.status === "submitted") {
    return { ok: false as const, code: "STRATEGY_LOCKED" as const, message: "Strategy is submitted for approval. Revise to edit." };
  }
  if (strategy.status === "approved") {
    return { ok: false as const, code: "STRATEGY_LOCKED" as const, message: "Strategy is approved. Revise to edit." };
  }
  return { ok: true as const };
}

const STRATEGY_SELECT = "*, brand_pillars(*, brand_plans(*))";

async function attachKpis(
  supabase: SupabaseClient,
  strategies: StrategyTree[],
  includeArchived?: boolean,
): Promise<StrategyTree[]> {
  if (!strategies.length) return strategies;
  const ids = strategies.map((s) => s.id);
  let q = supabase.from("brand_strategy_kpis").select("*").in("strategy_id", ids);
  if (!includeArchived) q = q.is("archived_at", null);
  const { data: kpis } = await q;
  const byStrategy = new Map<string, unknown[]>();
  for (const k of kpis ?? []) {
    const list = byStrategy.get(k.strategy_id) ?? [];
    list.push(k);
    byStrategy.set(k.strategy_id, list);
  }
  return strategies.map((s) => {
    const brand_strategy_kpis = (byStrategy.get(s.id) ?? []) as StrategyKpiRow[];
    return { ...s, brand_strategy_kpis } as StrategyTree;
  });
}

export async function loadStrategyTree(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { includeArchived?: boolean; strategyId?: string },
): Promise<StrategyTree[]> {
  let q = supabase
    .from("brand_strategies")
    .select(STRATEGY_SELECT)
    .eq("tenant_id", tenantId)
    .order("year", { ascending: false });
  if (opts?.strategyId) q = q.eq("id", opts.strategyId);
  const { data, error } = await q;
  if (error) throw error;
  let items = data ?? [];
  if (!opts?.includeArchived) {
    items = items
      .filter((s) => !s.archived_at)
      .map((s) => ({
        ...s,
        brand_pillars: (s.brand_pillars ?? [])
          .filter((p: { archived_at?: string | null }) => !p.archived_at)
          .map((p: { brand_plans?: Array<{ archived_at?: string | null }> }) => ({
            ...p,
            brand_plans: (p.brand_plans ?? []).filter((pl) => !pl.archived_at),
          })),
      }));
  }
  return attachKpis(supabase, items as StrategyTree[], opts?.includeArchived);
}

export const getStrategyById = async (
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<StrategyTree | null> => {
  const { data, error } = await supabase
    .from("brand_strategies")
    .select(STRATEGY_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const base = data as unknown as StrategyTree;
  const { data: kpis } = await supabase.from("brand_strategy_kpis").select("*").eq("strategy_id", id);
  return {
    ...base,
    brand_strategy_kpis: (kpis ?? []) as StrategyKpiRow[],
  } as StrategyTree;
};

export type LinkCounts = {
  briefs: number;
  campaigns: number;
  plans: number;
};

export async function countStrategyLinks(
  supabase: SupabaseClient,
  tenantId: string,
  kind: "strategy" | "pillar" | "plan",
  id: string,
): Promise<LinkCounts> {
  const counts: LinkCounts = { briefs: 0, campaigns: 0, plans: 0 };
  if (kind === "strategy") {
    const { count: b } = await supabase
      .from("brand_briefs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in(
        "pillar_id",
        (
          await supabase.from("brand_pillars").select("id").eq("strategy_id", id)
        ).data?.map((p) => p.id) ?? ["00000000-0000-0000-0000-000000000000"],
      );
    counts.briefs = b ?? 0;
    const pillarIds = (await supabase.from("brand_pillars").select("id").eq("strategy_id", id)).data?.map((p) => p.id) ?? [];
    if (pillarIds.length) {
      const { count: c } = await supabase
        .from("brand_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("pillar_id", pillarIds);
      counts.campaigns = c ?? 0;
    }
    const { count: pl } = await supabase
      .from("brand_plans")
      .select("id", { count: "exact", head: true })
      .in(
        "pillar_id",
        (
          await supabase.from("brand_pillars").select("id").eq("strategy_id", id)
        ).data?.map((p) => p.id) ?? ["00000000-0000-0000-0000-000000000000"],
      );
    counts.plans = pl ?? 0;
    return counts;
  }
  if (kind === "pillar") {
    const [{ count: b }, { count: c }, { count: pl }] = await Promise.all([
      supabase.from("brand_briefs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("pillar_id", id),
      supabase.from("brand_campaigns").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("pillar_id", id),
      supabase.from("brand_plans").select("id", { count: "exact", head: true }).eq("pillar_id", id),
    ]);
    counts.briefs = b ?? 0;
    counts.campaigns = c ?? 0;
    counts.plans = pl ?? 0;
    return counts;
  }
  const [{ count: b }, { count: c }] = await Promise.all([
    supabase.from("brand_briefs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("plan_id", id),
    supabase.from("brand_campaigns").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("plan_id", id),
  ]);
  counts.briefs = b ?? 0;
  counts.campaigns = c ?? 0;
  return counts;
}

export async function canHardDelete(
  supabase: SupabaseClient,
  tenantId: string,
  kind: "strategy" | "pillar" | "plan",
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string; counts: LinkCounts }> {
  const counts = await countStrategyLinks(supabase, tenantId, kind, id);
  const total = counts.briefs + counts.campaigns + (kind === "strategy" ? counts.plans : 0);
  if (kind === "plan" && counts.briefs + counts.campaigns > 0) {
    return {
      ok: false,
      reason: "Plan is linked to briefs or campaigns. Archive instead.",
      counts,
    };
  }
  if (kind === "pillar" && counts.briefs + counts.campaigns > 0) {
    return {
      ok: false,
      reason: "Pillar is linked to briefs or campaigns. Archive instead.",
      counts,
    };
  }
  if (kind === "strategy" && (counts.briefs > 0 || counts.campaigns > 0 || counts.plans > 0)) {
    return {
      ok: false,
      reason: "Strategy has linked briefs, campaigns or plans. Archive instead.",
      counts,
    };
  }
  if (total > 0 && kind !== "strategy") {
    return { ok: false, reason: "Linked records exist. Archive instead.", counts };
  }
  return { ok: true };
}

export function strategySnapshotHash(tree: Record<string, unknown>): string {
  return hashContent(tree);
}

export async function submitStrategy(
  supabase: SupabaseClient,
  tenantId: string,
  strategyId: string,
  actorId: string,
  approverId: string,
): Promise<{ ok: true; approval_id: string } | { ok: false; message: string; code: string }> {
  const strategy = await getStrategyById(supabase, tenantId, strategyId);
  if (!strategy) return { ok: false, message: "Strategy not found", code: "NOT_FOUND" };
  if (strategy.status !== "draft") {
    return { ok: false, message: "Only draft strategies can be submitted", code: "VALIDATION_ERROR" };
  }
  if (approverId === actorId) {
    return { ok: false, message: "You cannot approve your own submission", code: "VALIDATION_ERROR" };
  }
  const valid = await validateSecondApprover(supabase, tenantId, approverId);
  if (valid.ok === false) return { ok: false, message: valid.message, code: "VALIDATION_ERROR" };

  const settings = await loadBrandSettings(supabase, tenantId);
  const versionHash = strategySnapshotHash(strategy as Record<string, unknown>);
  const { id: approvalId } = await createBrandApproval(supabase, {
    tenantId,
    subjectType: "strategy",
    subjectId: strategyId,
    versionHash,
    requestedBy: actorId,
    approverId,
    dueAt: new Date(Date.now() + settings.approval_sla_hours * 3600 * 1000),
  });

  await supabase
    .from("brand_strategies")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      pending_approval_id: approvalId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", strategyId);

  return { ok: true, approval_id: approvalId };
}

export async function applyStrategyDecision(
  supabase: SupabaseClient,
  tenantId: string,
  strategyId: string,
  decision: "approved" | "changes_requested" | "rejected",
  actorId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const strategy = await getStrategyById(supabase, tenantId, strategyId);
  if (!strategy) return { ok: false, message: "Strategy not found" };
  if (strategy.status !== "submitted") return { ok: false, message: "Strategy is not awaiting approval" };

  if (decision === "approved") {
    await supabase
      .from("brand_strategies")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: actorId,
        pending_approval_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", strategyId);

    const pillarIds = (strategy.brand_pillars ?? []).map((p: { id: string }) => p.id);
    if (pillarIds.length) {
      await supabase
        .from("brand_plans")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .in("pillar_id", pillarIds)
        .eq("tenant_id", tenantId);
    }
    return { ok: true };
  }

  await supabase
    .from("brand_strategies")
    .update({
      status: "draft",
      pending_approval_id: null,
      submitted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", strategyId);
  return { ok: true };
}

export async function reviseStrategy(
  supabase: SupabaseClient,
  tenantId: string,
  strategyId: string,
  _reason: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const strategy = await getStrategyById(supabase, tenantId, strategyId);
  if (!strategy) return { ok: false, message: "Strategy not found" };
  if (strategy.status !== "approved") {
    return { ok: false, message: "Only approved strategies can be revised" };
  }
  await supabase
    .from("brand_strategies")
    .update({
      status: "draft",
      approved_at: null,
      approved_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", strategyId);

  const pillarIds = (strategy.brand_pillars ?? []).map((p: { id: string }) => p.id);
  if (pillarIds.length) {
    await supabase
      .from("brand_plans")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .in("pillar_id", pillarIds)
      .eq("tenant_id", tenantId);
  }
  return { ok: true };
}

export async function archiveStrategy(
  supabase: SupabaseClient,
  tenantId: string,
  strategyId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const strategy = await getStrategyById(supabase, tenantId, strategyId);
  if (!strategy) return { ok: false, message: "Strategy not found" };
  if (strategy.status === "submitted") {
    return { ok: false, message: "Cannot archive while submitted" };
  }
  await supabase
    .from("brand_strategies")
    .update({
      archived_at: new Date().toISOString(),
      archive_reason: reason ?? null,
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", strategyId)
    .eq("tenant_id", tenantId);
  return { ok: true };
}

export async function unarchiveStrategy(supabase: SupabaseClient, tenantId: string, strategyId: string) {
  await supabase
    .from("brand_strategies")
    .update({
      archived_at: null,
      archive_reason: null,
      status: "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", strategyId)
    .eq("tenant_id", tenantId);
}

export type BudgetRollupRow = {
  plan_id: string;
  pillar_id: string;
  quarter: number;
  plan_budget: number;
  campaign_envelope: number;
  known_spend: number;
  variance: number;
};

export async function rollupStrategyBudgets(
  supabase: SupabaseClient,
  tenantId: string,
  strategyId: string,
  period?: { start: Date; end: Date },
): Promise<BudgetRollupRow[]> {
  const strategy = await getStrategyById(supabase, tenantId, strategyId);
  if (!strategy) return [];

  const window =
    period ??
    ({
      start: new Date(strategy.year, 0, 1),
      end: new Date(strategy.year, 11, 31, 23, 59, 59),
    } as { start: Date; end: Date });

  const rows: BudgetRollupRow[] = [];
  for (const pillar of strategy.brand_pillars ?? []) {
    for (const plan of pillar.brand_plans ?? []) {
      const { data: campaigns } = await supabase
        .from("brand_campaigns")
        .select("id, budget_envelope")
        .eq("tenant_id", tenantId)
        .eq("plan_id", plan.id);
      let known = 0;
      let envelope = 0;
      for (const c of campaigns ?? []) {
        envelope += Number(c.budget_envelope ?? 0);
        const spend = await sumKnownSpendForCampaign(supabase, tenantId, c.id, window);
        known += spend.known;
      }
      const planBudget = Number(plan.budget ?? 0);
      rows.push({
        plan_id: plan.id,
        pillar_id: pillar.id,
        quarter: plan.quarter,
        plan_budget: planBudget,
        campaign_envelope: envelope,
        known_spend: Math.round(known * 100) / 100,
        variance: Math.round((planBudget - known) * 100) / 100,
      });
    }
  }
  return rows;
}

export { quarterDateRange } from "./strategy-dates";
