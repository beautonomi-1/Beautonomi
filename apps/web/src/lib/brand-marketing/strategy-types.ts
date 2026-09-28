export type StrategyStatus = "draft" | "submitted" | "approved" | "archived";

export type StrategyRow = {
  id: string;
  tenant_id: string;
  year: number;
  status: StrategyStatus;
  positioning: string | null;
  brand_promise: string | null;
  audience_priorities: Record<string, unknown>;
  notes: string | null;
  pending_approval_id: string | null;
  archived_at: string | null;
};

export type StrategyPlanRow = {
  id: string;
  year: number;
  quarter: number;
  budget?: number;
  objective?: string | null;
  archived_at?: string | null;
};

export type StrategyPillarRow = {
  id: string;
  name: string;
  description?: string | null;
  brand_plans?: StrategyPlanRow[];
};

export type StrategyKpiRow = {
  id: string;
  kpi_key: string;
  target: number;
  weight: number;
  baseline: number | null;
  pillar_id: string | null;
  plan_id: string | null;
  archived_at: string | null;
};

export type StrategyTree = StrategyRow & {
  brand_pillars?: StrategyPillarRow[];
  brand_strategy_kpis?: StrategyKpiRow[];
};
