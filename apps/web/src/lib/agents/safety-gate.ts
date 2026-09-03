/**
 * P0 safety gate — agent mutations blocked until RLS harness and hardening migrations pass.
 */
export type MutationGateResult = {
  allowed: boolean;
  reason?: string;
  blockers?: string[];
};

export const REQUIRED_MIGRATIONS = [
  "787_gift_cards_rls_hardening.sql",
  "788_message_attachments_storage_hardening.sql",
];

export type AgentGateKey =
  | "rls_harness_green"
  | "p0_migrations_verified"
  | "master_enabled"
  | "shadow_mode_off"
  | "emergency_controls_clear";

export type AgentGateStatus = {
  key: AgentGateKey;
  label: string;
  ok: boolean;
  /** Why the gate is red, or how it was satisfied. */
  reason: string;
  /** What an operator does to flip it green. */
  remediation?: string;
};

export type AgentGateInputs = {
  rlsHarnessGreen: boolean;
  p0MigrationsVerified: boolean;
  masterEnabled: boolean;
  shadowMode: boolean;
  emergency: {
    stopNewRuns: boolean;
    stopAllToolCalls: boolean;
    blockApprovedExecution: boolean;
    freezePendingProposals: boolean;
  };
};

/**
 * Per-gate breakdown for the Agentic Console preflight panel and
 * GET /api/admin/agents/gate-status. `assertAgentMutationAllowed` remains the
 * enforcement point; this is the explanatory view of the same conditions.
 */
export function describeAgentGates(inputs: AgentGateInputs): AgentGateStatus[] {
  const activeEmergency = (
    [
      ["stop_new_runs", inputs.emergency.stopNewRuns],
      ["stop_all_tool_calls", inputs.emergency.stopAllToolCalls],
      ["block_approved_execution", inputs.emergency.blockApprovedExecution],
      ["freeze_pending_proposals", inputs.emergency.freezePendingProposals],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([key]) => key);

  return [
    {
      key: "rls_harness_green",
      label: "RLS harness green",
      ok: inputs.rlsHarnessGreen,
      reason: inputs.rlsHarnessGreen
        ? "AGENT_RLS_HARNESS_GREEN=true"
        : "AGENT_RLS_HARNESS_GREEN is not 'true' in this deployment",
      remediation: "Run the apps/web security test suite (and the live RLS integration where available); set AGENT_RLS_HARNESS_GREEN=true only after it passes.",
    },
    {
      key: "p0_migrations_verified",
      label: "P0 hardening migrations verified",
      ok: inputs.p0MigrationsVerified,
      reason: inputs.p0MigrationsVerified
        ? "AGENT_P0_MIGRATIONS_VERIFIED=true"
        : `Verify applied: ${REQUIRED_MIGRATIONS.join(", ")}; then set AGENT_P0_MIGRATIONS_VERIFIED=true`,
      remediation: "Confirm the migrations exist in supabase_migrations.schema_migrations for this environment, then set the env flag and redeploy.",
    },
    {
      key: "master_enabled",
      label: "Agent module master switch",
      ok: inputs.masterEnabled,
      reason: inputs.masterEnabled ? "master_enabled=true" : "agent_module_config.master_enabled is false",
      remediation: "Agentic Console -> Module controls -> Master enabled.",
    },
    {
      key: "shadow_mode_off",
      label: "Shadow mode disabled",
      ok: inputs.shadowMode === false,
      reason: inputs.shadowMode === false ? "shadow_mode=false" : "agent_module_config.shadow_mode is true (proposals only, no execution)",
      remediation: "Keep shadow mode on for the 7-day proposal review window; disable per the enablement runbook once proposals look right.",
    },
    {
      key: "emergency_controls_clear",
      label: "No emergency kill switch active",
      ok: activeEmergency.length === 0,
      reason: activeEmergency.length === 0 ? "All emergency controls off" : `Active: ${activeEmergency.join(", ")}`,
      remediation: "Agentic Console -> Emergency kill switches. Clear only after the incident that triggered them is resolved.",
    },
  ];
}

export function assertAgentMutationAllowed(options?: {
  rlsHarnessGreen?: boolean;
  masterEnabled?: boolean;
  shadowMode?: boolean;
  /** Ops confirms P0 hardening migrations are applied (defaults to AGENT_P0_MIGRATIONS_VERIFIED env). */
  p0MigrationsVerified?: boolean;
}): MutationGateResult {
  const blockers: string[] = [];
  if (!options?.rlsHarnessGreen) {
    blockers.push("RLS harness must be green (run apps/web security tests + optional live integration)");
  }
  if (!options?.masterEnabled) {
    blockers.push("Agent module master_enabled is false");
  }
  if (options?.shadowMode !== false) {
    blockers.push("shadow_mode must be disabled for mutations");
  }
  const migrationsVerified =
    options?.p0MigrationsVerified ?? process.env.AGENT_P0_MIGRATIONS_VERIFIED === "true";
  if (!migrationsVerified) {
    for (const m of REQUIRED_MIGRATIONS) {
      blockers.push(`Verify migration applied: ${m} (then set AGENT_P0_MIGRATIONS_VERIFIED=true)`);
    }
  }
  if (blockers.length > 0) {
    return { allowed: false, reason: "P0 safety gate", blockers };
  }
  return { allowed: true };
}

/** Read-only agent operations may proceed when master is enabled. */
export function assertAgentReadAllowed(options: { masterEnabled: boolean }): MutationGateResult {
  if (!options.masterEnabled) {
    return { allowed: false, reason: "master_disabled", blockers: ["master_enabled is false"] };
  }
  return { allowed: true };
}
