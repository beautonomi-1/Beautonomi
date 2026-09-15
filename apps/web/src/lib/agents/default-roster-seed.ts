/**
 * Canonical agent brain defaults for AI Platform cheap-stack seeding.
 * Keep in sync with supabase/migrations/909_ai_platform_agent_workforce_e2e_seed.sql
 * and scripts/seed-ai-platform-agents.mjs.
 */
export type AgentRosterSeedRow = {
  key: string;
  task_default:
    | "classification"
    | "extraction"
    | "drafting"
    | "summarization"
    | "complex_reasoning"
    | "copilot";
  vision_enabled: boolean;
  preferred_model_id: null;
  fallback_model_id: null;
  max_cost_usd_per_run: number;
  operational_state: "active";
};

/** Default routing: null preferred/fallback — routeModel + module policy pick catalog models. */
export const AGENT_ROSTER_SEED: AgentRosterSeedRow[] = [
  { key: "ops-sentinel", task_default: "classification", vision_enabled: true, preferred_model_id: null, fallback_model_id: null, max_cost_usd_per_run: 0.25, operational_state: "active" },
  { key: "support-triage", task_default: "classification", vision_enabled: true, preferred_model_id: null, fallback_model_id: null, max_cost_usd_per_run: 0.25, operational_state: "active" },
  { key: "support-lead", task_default: "drafting", vision_enabled: true, preferred_model_id: null, fallback_model_id: null, max_cost_usd_per_run: 0.25, operational_state: "active" },
  { key: "payout-review", task_default: "classification", vision_enabled: true, preferred_model_id: null, fallback_model_id: null, max_cost_usd_per_run: 0.25, operational_state: "active" },
  { key: "reconciliation-investigator", task_default: "classification", vision_enabled: true, preferred_model_id: null, fallback_model_id: null, max_cost_usd_per_run: 0.25, operational_state: "active" },
  { key: "refund-specialist", task_default: "classification", vision_enabled: true, preferred_model_id: null, fallback_model_id: null, max_cost_usd_per_run: 0.25, operational_state: "active" },
  { key: "provider-success", task_default: "drafting", vision_enabled: true, preferred_model_id: null, fallback_model_id: null, max_cost_usd_per_run: 0.25, operational_state: "active" },
  { key: "membership-shepherd", task_default: "drafting", vision_enabled: true, preferred_model_id: null, fallback_model_id: null, max_cost_usd_per_run: 0.25, operational_state: "active" },
  { key: "trust-monitor", task_default: "classification", vision_enabled: true, preferred_model_id: null, fallback_model_id: null, max_cost_usd_per_run: 0.25, operational_state: "active" },
  { key: "content-moderator", task_default: "classification", vision_enabled: true, preferred_model_id: null, fallback_model_id: null, max_cost_usd_per_run: 0.25, operational_state: "active" },
  { key: "admin-copilot", task_default: "copilot", vision_enabled: true, preferred_model_id: null, fallback_model_id: null, max_cost_usd_per_run: 0.25, operational_state: "active" },
];

export const AGENT_ROSTER_SEED_KEYS = AGENT_ROSTER_SEED.map((r) => r.key);
