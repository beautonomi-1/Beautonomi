export type LiveModelRow = {
  id: string;
  name: string;
  provider: string;
  capability: string;
  tier: string;
  enabled: boolean;
  db_id: string | null;
  eval_passed_at: string | null;
  input_usd_per_1k: number;
  output_usd_per_1k: number;
  description?: string;
  tags?: string[];
};

export type DirectGeminiModel = {
  id: string;
  provider: string;
  tier: string;
  enabled: boolean;
  gateway: boolean;
};

export type SelectableModel = {
  model_id: string;
  provider: string;
  tier: string;
  gateway: boolean;
  /** When false, model is visible in default picker but not enabled in catalog yet. */
  catalog_enabled?: boolean;
};

export type WorkforceAgent = {
  id: string | null;
  key: string;
  display_name: string;
  admin_role: string | null;
  risk_ceiling: number | null;
  state: string;
  workflows: string[];
  cron_labels: string[];
  preferred_model_id: string | null;
  fallback_model_id: string | null;
  task_default: string | null;
  vision_enabled: boolean;
  catalog_model_valid: boolean;
  fallback_model_valid: boolean;
  spend_7d_usd: number;
  missing_definition: boolean;
};

export type AiPlatformPayload = {
  runtime: Record<string, unknown> | null;
  emergency: Record<string, unknown> | null;
  live_models: LiveModelRow[];
  selectable_models: SelectableModel[];
  direct_gemini_models: DirectGeminiModel[];
  gateway_catalog_source?: string;
  gemini: Record<string, unknown> | null;
  module: Record<string, unknown> | null;
  stats: {
    spend_today_usd: number;
    spend_month_usd?: number;
    monthly_budget_usd?: number | null;
    failed_calls_last_hour: number;
    models_enabled: number;
    catalog_stats?: Record<
      string,
      { success_rate: number; p95_latency_ms: number | null; calls_24h: number }
    >;
  };
  workforce: {
    module: {
      master_enabled: boolean;
      shadow_mode: boolean;
      global_daily_spend_cap_usd: number | null;
      default_routing_policy_id: string | null;
    };
    emergency: Record<string, boolean>;
    gate_status: {
      reads_allowed: boolean;
      mutations_allowed: boolean;
      blockers: string[];
      gates: Array<{ key: string; label: string; ok: boolean; reason: string; remediation?: string }>;
      active_agents: number;
      pending_approvals: number;
      missing_agent_keys: string[];
    };
    agents: WorkforceAgent[];
    cron_schedules: Array<{ name: string; schedule: string; path: string }>;
    spend: {
      platform_today_usd: number;
      platform_month_usd: number;
      agent_month_usd: number;
      provider_ai_month_usd: number;
      monthly_budget_usd: number | null;
      agent_daily_cap_usd: number | null;
    };
  };
};

export type AiPlatformTab = "overview" | "gateway" | "workforce" | "budgets" | "safety";
